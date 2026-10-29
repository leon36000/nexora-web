import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { checkOutboundUrl } from "@nexora/net";

/**
 * CLIENT HTTP DE SORTIE UNIQUE de WebPilot. Tout appel de Nexora AI vers le Web ouvert passe par ce module et par
 * aucun autre (un test statique le vérifie : ni `fetch`, ni `node:http`, ni `node:https` ailleurs).
 *
 * Garde SSRF (contrat §7.1) :
 *  - schémas `http` et `https` seulement, sans identifiants, ports en liste fermée ;
 *  - le nom est résolu UNE fois par saut, chaque adresse est classée (privée, boucle locale, lien local, réservée,
 *    métadonnées : refus), puis la connexion se fait À L'ADRESSE VALIDÉE (jamais une seconde résolution : pas de
 *    rebond DNS) ;
 *  - mêmes contrôles à chaque redirection (saut de redirection suivi à la main) ;
 *  - noms sans point ou en `.local`, `.internal`, `.lan`… refusés d'emblée (noms de services du réseau interne) ;
 *  - plafonds de taille (flux annulé au-delà) et de durée (total, redirections comprises) ;
 *  - ni cookies, ni en-têtes d'autorisation, ni compression (pas de bombe de décompression).
 * Seuls les hôtes de `trustedHosts` (un service interne que l'opérateur a nommé, ex. le moteur de recherche) peuvent
 * être internes ; les métadonnées du nuage et le lien local restent refusés sans exception.
 */

export type SafeFetchErrorCode =
  | "url_not_allowed"
  | "target_unreachable"
  | "target_timeout"
  | "response_too_large"
  | "too_many_redirects";

export class SafeFetchError extends Error {
  readonly code: SafeFetchErrorCode;
  constructor(code: SafeFetchErrorCode, message: string) {
    super(message);
    this.name = "SafeFetchError";
    this.code = code;
  }
}

export interface SafeHttpOptions {
  /** Identification du robot (nom et adresse de contact), envoyée à chaque requête. */
  userAgent: string;
  /** Liste fermée des ports permis. */
  allowedPorts: readonly number[];
  maxBytes: number;
  /** Durée totale d'un appel, redirections comprises. */
  timeoutMs: number;
  maxRedirects: number;
  /** Hôtes, adresses ou plages CIDR internes que l'opérateur autorise (jamais le lien local ni les métadonnées). */
  trustedHosts?: readonly string[];
  /** Résolution DNS (injectable pour les essais) : toutes les adresses d'un nom. */
  resolve?: (host: string) => Promise<string[]>;
  /**
   * Passerelle d'essai : adresse et port réellement joints, APRÈS validation de l'adresse. Ne sert qu'aux tests
   * (joindre un serveur local en lui faisant croire qu'il a une adresse publique).
   */
  dial?: (address: string, port: number) => { address: string; port: number };
}

export interface SafeResponse {
  /** Adresse finale, après redirections. */
  url: string;
  status: number;
  /** En-têtes de réponse, noms en minuscules. */
  headers: Record<string, string>;
  body: Uint8Array;
  redirects: number;
}

export interface GetOptions {
  headers?: Record<string, string>;
  /**
   * Appelé avant CHAQUE saut (adresse de départ comprise, puis chaque redirection) ; peut lever pour refuser (ex. la
   * politique de confidentialité refuse un hôte atteint par redirection).
   */
  beforeHop?: (url: URL) => Promise<void>;
  /** Plafond de taille propre à cet appel (au plus `maxBytes`). */
  maxBytes?: number;
}

export interface SafeHttpClient {
  get(rawUrl: string, options?: GetOptions): Promise<SafeResponse>;
  /**
   * POST JSON vers un service interne approuvé (`trustedHosts`, ex. le rendu par navigateur). Une seule requête, aucune
   * redirection suivie (une redirection est une erreur), mêmes gardes d'adresse, de taille et de durée.
   */
  post(
    rawUrl: string,
    json: unknown,
    options?: Pick<GetOptions, "maxBytes">,
  ): Promise<SafeResponse>;
  /** Valide une adresse comme le ferait `get` (schéma, port, nom, résolution) sans la joindre. */
  check(rawUrl: string): Promise<URL>;
}

/** Client sûr + appels authentifiés vers les services internes approuvés (service de navigateur). */
export interface TrustedHttpClient extends SafeHttpClient {
  /**
   * Appel authentifié d'un service interne approuvé (`trustedHosts`, ex. le service de navigateur) : GET, POST ou DELETE,
   * JSON facultatif, en-têtes fournis (dont `authorization`). Refusé pour tout hôte non approuvé : l'autorisation ne part
   * JAMAIS vers un tiers. Aucune redirection suivie, mêmes gardes d'adresse, de taille et de durée.
   */
  request(
    method: "GET" | "POST" | "DELETE",
    rawUrl: string,
    options?: Pick<GetOptions, "maxBytes" | "headers"> & { json?: unknown },
  ): Promise<SafeResponse>;
}

const DEFAULT_PORT = { "http:": 80, "https:": 443 } as const;
const INTERNAL_SUFFIXES = [
  ".local",
  ".localhost",
  ".internal",
  ".lan",
  ".home.arpa",
  ".intranet",
  ".corp",
  ".private",
];
const REDIRECT = new Set([301, 302, 303, 307, 308]);

const reject = (message: string) =>
  new SafeFetchError("url_not_allowed", message);

function hostnameProblem(host: string): string | null {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (h.length === 0) return "hôte vide";
  if (isIP(h)) return null;
  if (!h.includes(".")) return "nom de machine sans domaine refusé";
  if (INTERNAL_SUFFIXES.some((s) => h.endsWith(s))) return "nom interne refusé";
  if (h === "metadata" || h.startsWith("metadata.") || h.includes(".metadata."))
    return "métadonnées du nuage refusées";
  return null;
}

async function defaultResolve(host: string): Promise<string[]> {
  const all = await dnsLookup(host, { all: true });
  return all.map((a) => a.address);
}

export function createSafeHttpClient(
  options: SafeHttpOptions,
): TrustedHttpClient {
  const trusted = (options.trustedHosts ?? []).map((h) => h.toLowerCase());
  const resolveImpl = options.resolve ?? defaultResolve;

  /** Valide l'adresse d'un saut et renvoie l'URL et les adresses résolues (déjà classées). */
  async function vet(
    raw: string,
  ): Promise<{ url: URL; addresses: string[]; port: number }> {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw reject("adresse invalide");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:")
      throw reject("seuls http et https sont admis");
    if (url.username || url.password)
      throw reject("adresse avec identifiants refusée");
    const port = url.port ? Number(url.port) : DEFAULT_PORT[url.protocol];
    if (!options.allowedPorts.includes(port)) throw reject("port non permis");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const problem = trusted.includes(host.toLowerCase())
      ? null
      : hostnameProblem(host);
    if (problem) throw reject(problem);
    let dnsFailed = false;
    const check = await checkOutboundUrl(
      url.toString(),
      { allowInternal: false, allow: [...trusted] },
      {
        resolve: async (h) => {
          try {
            return await resolveImpl(h);
          } catch (error) {
            dnsFailed = true;
            throw error;
          }
        },
      },
    );
    if (!check.ok) {
      if (dnsFailed)
        throw new SafeFetchError("target_unreachable", "hôte introuvable");
      throw reject(check.reason);
    }
    return { url, addresses: check.addresses, port };
  }

  function lookupTo(address: string): LookupFunction {
    const family = isIP(address) === 6 ? 6 : 4;
    return (_hostname, opts, callback) => {
      if (opts?.all) callback(null, [{ address, family }]);
      else callback(null, address, family);
    };
  }

  /** Une requête vers une adresse validée ; le flux est lu avec un plafond et annulé au-delà. */
  function once(
    url: URL,
    address: string,
    port: number,
    headers: Record<string, string>,
    maxBytes: number,
    signal: AbortSignal,
    request: {
      method: "GET" | "POST" | "DELETE";
      body?: string;
    } = { method: "GET" },
  ): Promise<{
    status: number;
    headers: Record<string, string>;
    body: Uint8Array;
  }> {
    const dialed = options.dial?.(address, port) ?? { address, port };
    const secure = url.protocol === "https:";
    const host = url.hostname.replace(/^\[|\]$/g, "");
    return new Promise((resolve, reject_) => {
      const req = (secure ? https : http).request(
        {
          protocol: url.protocol,
          hostname: host,
          port: dialed.port,
          path: `${url.pathname}${url.search}`,
          method: request.method,
          headers: {
            ...headers,
            host: url.host,
            ...(request.body !== undefined
              ? { "content-length": String(Buffer.byteLength(request.body)) }
              : {}),
          },
          lookup: lookupTo(dialed.address),
          servername: isIP(host) ? undefined : host,
          agent: false,
          signal,
        },
        (res) => {
          const declared = Number(res.headers["content-length"]);
          if (Number.isFinite(declared) && declared > maxBytes) {
            res.destroy();
            req.destroy();
            reject_(
              new SafeFetchError(
                "response_too_large",
                "réponse trop volumineuse",
              ),
            );
            return;
          }
          const parts: Buffer[] = [];
          let total = 0;
          res.on("data", (chunk: Buffer) => {
            total += chunk.length;
            if (total > maxBytes) {
              res.destroy();
              req.destroy();
              reject_(
                new SafeFetchError(
                  "response_too_large",
                  "réponse trop volumineuse",
                ),
              );
              return;
            }
            parts.push(chunk);
          });
          res.on("error", (e) => reject_(e));
          res.on("end", () => {
            const out: Record<string, string> = {};
            for (const [k, v] of Object.entries(res.headers)) {
              if (k === "set-cookie") continue;
              out[k] = Array.isArray(v) ? v.join(", ") : (v ?? "");
            }
            resolve({
              status: res.statusCode ?? 0,
              headers: out,
              body: new Uint8Array(Buffer.concat(parts)),
            });
          });
        },
      );
      req.on("error", (e) => reject_(e));
      req.end(request.body);
    });
  }

  const CONNECT_ERRORS = new Set([
    "ECONNREFUSED",
    "ETIMEDOUT",
    "EHOSTUNREACH",
    "ENETUNREACH",
    "ECONNRESET",
    "EAI_AGAIN",
  ]);

  async function hop(
    url: URL,
    addresses: string[],
    port: number,
    headers: Record<string, string>,
    maxBytes: number,
    signal: AbortSignal,
    request?: { method: "GET" | "POST" | "DELETE"; body?: string },
  ) {
    let last: unknown;
    for (const address of addresses) {
      try {
        return await once(
          url,
          address,
          port,
          headers,
          maxBytes,
          signal,
          request,
        );
      } catch (error) {
        last = error;
        const errno = (error as NodeJS.ErrnoException)?.code;
        if (error instanceof SafeFetchError || signal.aborted) throw error;
        if (!errno || !CONNECT_ERRORS.has(errno)) throw error;
      }
    }
    throw last;
  }

  return {
    check: async (raw) => (await vet(raw)).url,
    async get(rawUrl, opts = {}) {
      const maxBytes = Math.min(
        opts.maxBytes ?? options.maxBytes,
        options.maxBytes,
      );
      const signal = AbortSignal.timeout(options.timeoutMs);
      const headers: Record<string, string> = {
        "user-agent": options.userAgent,
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
        "accept-encoding": "identity",
        ...Object.fromEntries(
          Object.entries(opts.headers ?? {}).map(([k, v]) => [
            k.toLowerCase(),
            v,
          ]),
        ),
      };
      // Jamais de cookies ni d'autorisation de l'appelant vers un tiers.
      delete headers.cookie;
      delete headers.authorization;
      delete headers["proxy-authorization"];
      let current = rawUrl;
      try {
        for (let redirects = 0; ; redirects++) {
          const { url, addresses, port } = await vet(current);
          if (opts.beforeHop) await opts.beforeHop(url);
          const res = await hop(
            url,
            addresses,
            port,
            headers,
            maxBytes,
            signal,
          );
          const location = res.headers.location;
          if (REDIRECT.has(res.status) && location) {
            if (redirects >= options.maxRedirects)
              throw new SafeFetchError(
                "too_many_redirects",
                "trop de redirections",
              );
            try {
              current = new URL(location, url).toString();
            } catch {
              throw reject("redirection vers une adresse invalide");
            }
            continue;
          }
          return {
            url: url.toString(),
            status: res.status,
            headers: res.headers,
            body: res.body,
            redirects,
          };
        }
      } catch (error) {
        throw mapError(error, signal);
      }
    },
    async request(method, rawUrl, opts = {}) {
      if (method !== "GET" && method !== "POST" && method !== "DELETE")
        throw new Error("méthode non permise");
      const maxBytes = Math.min(
        opts.maxBytes ?? options.maxBytes,
        options.maxBytes,
      );
      const signal = AbortSignal.timeout(options.timeoutMs);
      try {
        const { url, addresses, port } = await vet(rawUrl);
        // L'autorisation (secret de service à service) ne sort que vers un hôte nommé par l'opérateur.
        if (
          !trusted.includes(url.hostname.replace(/^\[|\]$/g, "").toLowerCase())
        )
          throw reject("service interne non approuvé");
        const body =
          opts.json === undefined ? undefined : JSON.stringify(opts.json);
        const res = await hop(
          url,
          addresses,
          port,
          {
            "user-agent": options.userAgent,
            accept: "application/json",
            "accept-encoding": "identity",
            ...(body !== undefined
              ? { "content-type": "application/json" }
              : {}),
            ...Object.fromEntries(
              Object.entries(opts.headers ?? {}).map(([k, v]) => [
                k.toLowerCase(),
                v,
              ]),
            ),
          },
          maxBytes,
          signal,
          { method, ...(body !== undefined ? { body } : {}) },
        );
        if (REDIRECT.has(res.status))
          throw new SafeFetchError(
            "target_unreachable",
            "redirection non suivie",
          );
        return {
          url: url.toString(),
          status: res.status,
          headers: res.headers,
          body: res.body,
          redirects: 0,
        };
      } catch (error) {
        throw mapError(error, signal);
      }
    },
    async post(rawUrl, json, opts = {}) {
      const maxBytes = Math.min(
        opts.maxBytes ?? options.maxBytes,
        options.maxBytes,
      );
      const signal = AbortSignal.timeout(options.timeoutMs);
      try {
        const { url, addresses, port } = await vet(rawUrl);
        const res = await hop(
          url,
          addresses,
          port,
          {
            "user-agent": options.userAgent,
            accept: "application/json",
            "accept-encoding": "identity",
            "content-type": "application/json",
          },
          maxBytes,
          signal,
          { method: "POST", body: JSON.stringify(json) },
        );
        if (REDIRECT.has(res.status))
          throw new SafeFetchError(
            "target_unreachable",
            "redirection non suivie",
          );
        return {
          url: url.toString(),
          status: res.status,
          headers: res.headers,
          body: res.body,
          redirects: 0,
        };
      } catch (error) {
        throw mapError(error, signal);
      }
    },
  };
}

function mapError(error: unknown, signal: AbortSignal): SafeFetchError {
  if (error instanceof SafeFetchError) return error;
  if (signal.aborted)
    return new SafeFetchError("target_timeout", "délai dépassé");
  const errno = (error as NodeJS.ErrnoException)?.code ?? "";
  if (errno === "ABORT_ERR" || (error as Error)?.name === "AbortError")
    return new SafeFetchError("target_timeout", "délai dépassé");
  return new SafeFetchError(
    "target_unreachable",
    errno.startsWith("ERR_TLS") || errno.includes("CERT")
      ? "certificat invalide"
      : "la cible n'a pas répondu",
  );
}
