import { codeWorkspaces, type Database, eq, sql } from "@nexora/db";
import type { Logger } from "@nexora/log";
import { requireOrgMember } from "../auth/guards";
import { isSameOriginRequest } from "../auth/origin";
import type { Keyring } from "../vault/crypto";
import { readSecret } from "../vault/store";
import { errorJson } from "./http";
import { passwordRef, type WorkspaceRow } from "./workspace-service";

/**
 * Mandataire inverse de l'environnement hébergé : `/code/ws/<proxy_id>/…` → `http://<hôte>:<port>/…` du conteneur de la
 * personne. Authentifié par la SESSION du site de la personne propriétaire ; le mot de passe du serveur (au coffre) est
 * ajouté en `Authorization: Basic` côté serveur et n'atteint jamais le navigateur. HTTP et SSE passent ; **les WebSocket
 * ne passent pas par une route Next** (426 avec la marche à suivre : `docs/nexora-code.md`, « Mandataire »).
 *
 * Sécurité :
 * - pas de session : 401 ; courriel non vérifié ou personnel sans 2FA : 403 ; environnement d'une autre personne,
 *   inconnu ou identifiant mal formé : la MÊME 404 ; environnement arrêté : 409 ;
 * - méthodes qui modifient : même origine exigée (CSRF) ;
 * - cookies, `Authorization`, `Origin` et `X-Forwarded-*` de la personne ne sont jamais transmis ; les `Set-Cookie` de
 *   l'environnement jamais relayés ; les redirections sont ramenées sous le préfixe ;
 * - les pages HTML/SVG de l'environnement NE sont PAS servies depuis l'origine du site (un script s'y exécuterait avec
 *   la session de la personne) : il faut une origine dédiée, ou le réglage explicite de développement.
 */

export interface ProxySession {
  userId: string;
  organizationId: string;
  emailVerified: boolean;
  isStaff: boolean;
  twoFactorEnabled: boolean;
}

export interface ProxyDeps {
  db: () => Database;
  keyring: () => Keyring;
  siteUrl: string;
  now: () => Date;
  log: Logger;
  /** Hôte du port publié, vu du site (127.0.0.1). */
  upstreamHost: string;
  /** Sert aussi les pages HTML de l'environnement depuis l'origine du site (DÉVELOPPEMENT seulement). */
  allowSameOriginUi: boolean;
  fetch: typeof fetch;
  getContext: (headers: Headers) => Promise<ProxySession | null>;
  /** Appartenance à l'organisation de l'environnement (défaut : adhésions en base). */
  isMember?: (userId: string, organizationId: string) => Promise<boolean>;
  /**
   * Origine dédiée de l'interface web (`<id>.<suffixe>`, voir `workspace-dedicated.ts`) ; `null` : non configurée, les
   * pages HTML de l'environnement ne sont servies nulle part.
   */
  dedicated?: {
    suffix: string;
    secret: string;
    loadUser: (userId: string) => Promise<{
      emailVerified: boolean;
      isStaff: boolean;
      twoFactorEnabled: boolean;
    } | null>;
  } | null;
}

export interface ProxyTarget {
  row: WorkspaceRow;
  host: string;
  port: number;
  password: string;
}

const PROXY_ID = /^[0-9a-f]{32}$/;
const NOT_FOUND = () =>
  errorJson(404, "not_found", "Environnement introuvable.");
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Mots de passe lus au coffre, gardés une minute en mémoire (une requête de page = des dizaines de ressources). */
const passwordCache = new Map<string, { value: string; until: number }>();
const PASSWORD_TTL_MS = 60_000;

async function passwordOf(
  row: WorkspaceRow,
  deps: ProxyDeps,
): Promise<string | null> {
  const nowMs = deps.now().getTime();
  const hit = passwordCache.get(row.id);
  if (hit && hit.until > nowMs) return hit.value;
  try {
    const value = await readSecret(
      deps.db(),
      deps.keyring(),
      passwordRef(row.id),
    );
    if (!value) return null;
    passwordCache.set(row.id, { value, until: nowMs + PASSWORD_TTL_MS });
    return value;
  } catch {
    return null;
  }
}

/** Oublie le mot de passe gardé (suppression ou recréation de l'environnement). */
export function forgetWorkspacePassword(workspaceId: string): void {
  passwordCache.delete(workspaceId);
}

export type Authorization =
  | { ok: true; target: ProxyTarget; session: ProxySession }
  | { ok: false; response: Response };

/** Qui peut parler à quel environnement : voir l'en-tête du fichier. Sert au mandataire et à `/api/code/ws-auth`. */
export async function authorizeWorkspace(
  proxyId: string,
  deps: ProxyDeps,
  headers: Headers = new Headers(),
): Promise<Authorization> {
  const session = await deps.getContext(headers);
  if (!session)
    return {
      ok: false,
      response: errorJson(
        401,
        "unauthenticated",
        "Connectez-vous pour continuer.",
      ),
    };
  if (!session.emailVerified || (session.isStaff && !session.twoFactorEnabled))
    return {
      ok: false,
      response: errorJson(403, "forbidden", "Accès refusé."),
    };
  if (!PROXY_ID.test(proxyId)) return { ok: false, response: NOT_FOUND() };
  const [row] = await deps
    .db()
    .select()
    .from(codeWorkspaces)
    .where(eq(codeWorkspaces.proxyId, proxyId));
  if (!row || row.userId !== session.userId)
    return { ok: false, response: NOT_FOUND() };
  const member = deps.isMember
    ? await deps.isMember(session.userId, row.organizationId)
    : await requireOrgMember(deps.db(), session.userId, row.organizationId)
        .then(() => true)
        .catch(() => false);
  if (!member) return { ok: false, response: NOT_FOUND() };
  if (row.desiredStatus !== "running")
    return {
      ok: false,
      response: errorJson(
        409,
        "workspace_stopped",
        "Votre environnement est arrêté. Démarrez-le depuis votre compte (Nexora Code).",
      ),
    };
  const password = await passwordOf(row, deps);
  if (!password) {
    deps.log.error("mandataire Nexora Code : mot de passe introuvable", {
      workspaceId: row.id,
    });
    return {
      ok: false,
      response: errorJson(
        502,
        "workspace_unreachable",
        "Environnement injoignable.",
      ),
    };
  }
  return {
    ok: true,
    session,
    target: { row, host: deps.upstreamHost, port: row.port, password },
  };
}

const REQUEST_DROP = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "cookie",
  "authorization",
  "origin",
  "referer",
  "forwarded",
  "x-real-ip",
]);
const RESPONSE_DROP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "transfer-encoding",
  "upgrade",
  "set-cookie",
  "content-encoding",
  "content-length",
  "www-authenticate",
  "strict-transport-security",
  "content-security-policy",
  "content-security-policy-report-only",
  "access-control-allow-origin",
  "access-control-allow-credentials",
  "access-control-allow-headers",
  "access-control-allow-methods",
  "access-control-expose-headers",
]);
const UI_TYPE =
  /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml)\b/i;
const NAVIGATION_DEST = new Set([
  "document",
  "iframe",
  "frame",
  "embed",
  "object",
]);

/** Chemin à transmettre : refuse `..`, `.`, antislash, NUL (même encodés). `null` : chemin refusé. */
function upstreamPath(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  return safeRest(pathname.slice(prefix.length));
}

function safeRest(rest: string): string | null {
  if (rest !== "" && !rest.startsWith("/")) return null;
  for (const raw of rest.split("/")) {
    let seg: string;
    try {
      seg = decodeURIComponent(raw);
    } catch {
      return null;
    }
    if (seg === ".." || seg === "." || seg.includes("\\") || seg.includes("\0"))
      return null;
  }
  return rest === "" ? "/" : rest;
}

/** Une ligne de plus à `last_activity_at`, au plus toutes les 30 s (ne pas écrire à chaque ressource). */
async function touchActivity(deps: ProxyDeps, workspaceId: string) {
  const now = deps.now();
  await deps
    .db()
    .update(codeWorkspaces)
    .set({ lastActivityAt: now })
    .where(
      sql`${codeWorkspaces.id} = ${workspaceId} AND (${codeWorkspaces.lastActivityAt} IS NULL OR ${codeWorkspaces.lastActivityAt} < ${new Date(now.getTime() - 30_000).toISOString()}::timestamptz)`,
    );
}

export interface ProxyOptions {
  /**
   * Origine dédiée (`<id>.<suffixe>`) : le chemin à transmettre est donné (et non lu sous le préfixe `/code/ws/<id>`),
   * et la page HTML de l'environnement peut être servie (l'origine est à part de celle du site).
   */
  dedicatedPath?: string;
}

export async function handleWorkspaceProxy(
  request: Request,
  proxyId: string,
  deps: ProxyDeps,
  options: ProxyOptions = {},
): Promise<Response> {
  try {
    // Les méthodes qui modifient exigent la même origine, AVANT toute transmission.
    if (
      !SAFE_METHODS.has(request.method) &&
      !isSameOriginRequest(request, deps.siteUrl)
    )
      return errorJson(403, "invalid_origin", "Origine refusée.");

    const auth = await authorizeWorkspace(proxyId, deps, request.headers);
    if (!auth.ok) return auth.response;
    const { target } = auth;

    if (request.headers.get("upgrade")?.toLowerCase() === "websocket")
      return errorJson(
        426,
        "websocket_unsupported",
        "Les connexions WebSocket (terminal) ne passent pas par cette adresse. Voir la documentation de Nexora Code (mandataire).",
      );

    const url = new URL(request.url);
    const path =
      options.dedicatedPath !== undefined
        ? safeRest(options.dedicatedPath)
        : upstreamPath(url.pathname, `/code/ws/${proxyId}`);
    if (path === null)
      return errorJson(400, "invalid_path", "Adresse invalide.");

    const dest = request.headers.get("sec-fetch-dest");
    if (!deps.allowSameOriginUi && dest && NAVIGATION_DEST.has(dest))
      return uiRefused();

    await touchActivity(deps, target.row.id);

    const headers = new Headers();
    for (const [name, value] of request.headers)
      if (!REQUEST_DROP.has(name) && !name.startsWith("x-forwarded-"))
        headers.set(name, value);
    headers.set(
      "authorization",
      `Basic ${Buffer.from(`opencode:${target.password}`).toString("base64")}`,
    );

    const controller = new AbortController();
    const connectTimer = setTimeout(() => controller.abort(), 15_000);
    request.signal.addEventListener("abort", () => controller.abort(), {
      once: true,
    });
    let upstream: Response;
    try {
      upstream = await deps.fetch(
        `http://${target.host}:${target.port}${path}${url.search}`,
        {
          method: request.method,
          headers,
          body: SAFE_METHODS.has(request.method) ? undefined : request.body,
          // biome-ignore lint/suspicious/noExplicitAny: option `duplex` d'undici absente des types DOM
          ...({ duplex: "half" } as any),
          redirect: "manual",
          cache: "no-store",
          signal: controller.signal,
        },
      );
    } catch {
      deps.log.warn("mandataire Nexora Code : environnement injoignable", {
        workspaceId: target.row.id,
      });
      return errorJson(
        502,
        "workspace_unreachable",
        "Environnement injoignable.",
      );
    } finally {
      clearTimeout(connectTimer);
    }

    if (upstream.status === 401) {
      deps.log.error(
        "mandataire Nexora Code : l'environnement refuse le mot de passe",
        {
          workspaceId: target.row.id,
        },
      );
      await upstream.body?.cancel();
      return errorJson(
        502,
        "workspace_unreachable",
        "Environnement injoignable.",
      );
    }
    const type = upstream.headers.get("content-type") ?? "";
    if (!deps.allowSameOriginUi && UI_TYPE.test(type)) {
      await upstream.body?.cancel();
      return uiRefused();
    }

    const out = new Headers();
    for (const [name, value] of upstream.headers)
      if (!RESPONSE_DROP.has(name)) out.set(name, value);
    const cache = out.get("cache-control");
    out.set(
      "cache-control",
      cache ? cache.replace(/\bpublic\b/gi, "private") : "private, no-store",
    );
    out.set("x-content-type-options", "nosniff");
    out.set("referrer-policy", "no-referrer");
    const location = upstream.headers.get("location");
    if (location !== null) {
      const rewritten = rewriteLocation(location, proxyId, target);
      if (rewritten) out.set("location", rewritten);
      else out.delete("location");
    }
    const bodyless =
      request.method === "HEAD" ||
      [101, 204, 205, 304].includes(upstream.status);
    return new Response(bodyless ? null : upstream.body, {
      status: upstream.status,
      headers: out,
    });
  } catch (error) {
    deps.log.error("mandataire Nexora Code : erreur interne", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return errorJson(500, "internal_error", "Erreur interne.");
  }
}

function uiRefused(): Response {
  return errorJson(
    403,
    "dedicated_origin_required",
    "L'interface web de l'environnement ne peut pas être servie depuis l'adresse du site (voir la documentation de Nexora Code).",
  );
}

/** Redirection de l'environnement : relative → sous le préfixe ; vers lui-même → sous le préfixe ; ailleurs → retirée. */
function rewriteLocation(
  location: string,
  proxyId: string,
  target: ProxyTarget,
): string | null {
  const prefix = `/code/ws/${proxyId}`;
  if (location.startsWith("/") && !location.startsWith("//"))
    return `${prefix}${location}`;
  try {
    const u = new URL(location);
    if (u.host === `${target.host}:${target.port}`)
      return `${prefix}${u.pathname}${u.search}`;
  } catch {
    // illisible : retirée
  }
  return null;
}

/**
 * `GET /api/code/ws-auth?id=<proxy_id>` : décision d'accès pour un mandataire de BORDURE (Caddy `forward_auth`, nginx
 * `auth_request`) qui porte les WebSocket, que les routes Next ne savent pas relayer. Le mandataire transmet le cookie
 * de session de la personne ; si elle est propriétaire d'un environnement en marche, la réponse est un 204 dont les
 * en-têtes `X-Nexora-Upstream` (hôte:port) et `X-Nexora-Authorization` (Basic) sont recopiés vers l'environnement.
 * Cette route ne doit être joignable que par le mandataire de bordure (réseau interne).
 */
export async function handleWorkspaceAuth(
  request: Request,
  deps: ProxyDeps,
): Promise<Response> {
  if (request.method !== "GET")
    return errorJson(405, "method_not_allowed", "Méthode non permise.", {
      allow: "GET",
    });
  try {
    const id = new URL(request.url).searchParams.get("id") ?? "";
    const auth = await authorizeWorkspace(id, deps, request.headers);
    if (!auth.ok) return auth.response;
    return new Response(null, {
      status: 204,
      headers: {
        "cache-control": "no-store",
        "x-nexora-upstream": `${auth.target.host}:${auth.target.port}`,
        "x-nexora-authorization": `Basic ${Buffer.from(`opencode:${auth.target.password}`).toString("base64")}`,
      },
    });
  } catch (error) {
    deps.log.error("ws-auth Nexora Code : erreur interne", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return errorJson(500, "internal_error", "Erreur interne.");
  }
}
