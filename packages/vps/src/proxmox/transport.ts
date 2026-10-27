import { createHash } from "node:crypto";
import * as http from "node:http";
import * as https from "node:https";
import { isIP } from "node:net";
import * as tls from "node:tls";

/**
 * Transport HTTP(S) vers un serveur Proxmox VE.
 *
 *  - `verify` : certificat vérifié par la chaîne de confiance du système (ou `ca` fournie).
 *  - `pinned` : certificat auto-signé accepté UNIQUEMENT s'il porte l'empreinte SHA-256 attendue.
 *    La connexion TLS est établie et vérifiée AVANT d'écrire la moindre requête : l'en-tête
 *    d'autorisation (jeton) ne part jamais vers un serveur dont l'empreinte diffère.
 *  - `http` n'est accepté que vers la boucle locale (simulateur, développement).
 *
 * Jamais de `rejectUnauthorized: false` sans épinglage.
 */
export type TlsPolicy =
  | { mode: "verify"; ca?: string }
  | { mode: "pinned"; fingerprint: string };

export interface TransportRequest {
  method: string;
  host: string;
  port: number;
  protocol: "https" | "http";
  path: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  tls: TlsPolicy;
}
export interface TransportResponse {
  status: number;
  body: string;
}
export type Transport = (req: TransportRequest) => Promise<TransportResponse>;

export class TransportError extends Error {
  readonly kind: "network" | "timeout" | "tls";
  constructor(kind: TransportError["kind"], message: string) {
    super(message);
    this.name = "TransportError";
    this.kind = kind;
  }
}

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
export const isLoopback = (host: string) => LOOPBACK.has(host);

export function normalizeFingerprint(fp: string): string {
  return fp.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
}

/** Empreinte SHA-256 (hexadécimal minuscule) d'un certificat DER. */
export function certFingerprint(der: Buffer): string {
  return createHash("sha256").update(der).digest("hex");
}

function collect(res: http.IncomingMessage, max = 4_000_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    res.on("data", (c: Buffer) => {
      size += c.length;
      if (size > max) {
        res.destroy(new TransportError("network", "réponse trop volumineuse"));
        return;
      }
      chunks.push(c);
    });
    res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    res.on("error", reject);
  });
}

function connectPinned(
  host: string,
  port: number,
  fingerprint: string,
  timeoutMs: number,
): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const expected = normalizeFingerprint(fingerprint);
    const socket = tls.connect({
      host,
      port,
      rejectUnauthorized: false,
      ...(isIP(host) ? {} : { servername: host }),
    });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new TransportError("timeout", "délai de connexion TLS dépassé"));
    }, timeoutMs);
    socket.once("secureConnect", () => {
      clearTimeout(timer);
      const cert = socket.getPeerCertificate(false);
      const actual = cert?.raw ? certFingerprint(cert.raw) : "";
      if (actual !== expected) {
        socket.destroy();
        reject(
          new TransportError(
            "tls",
            "l'empreinte du certificat ne correspond pas à l'empreinte épinglée",
          ),
        );
        return;
      }
      resolve(socket);
    });
    socket.once("error", (e) => {
      clearTimeout(timer);
      reject(new TransportError("network", errorLabel(e)));
    });
  });
}

/** Libellé d'une erreur réseau sans détail pouvant contenir des données de la requête. */
function errorLabel(e: unknown): string {
  const code = (e as { code?: string })?.code;
  return code ? `erreur réseau (${code})` : "erreur réseau";
}

export const defaultTransport: Transport = async (req) => {
  if (req.protocol === "http" && !isLoopback(req.host))
    throw new TransportError(
      "tls",
      "HTTP en clair refusé : seule la boucle locale l'autorise",
    );
  const common = {
    method: req.method,
    host: req.host,
    port: req.port,
    path: req.path,
    headers: {
      ...req.headers,
      ...(req.body !== undefined
        ? { "content-length": String(Buffer.byteLength(req.body)) }
        : {}),
    },
    timeout: req.timeoutMs,
  };
  let request: http.ClientRequest;
  const done = new Promise<TransportResponse>((resolve, reject) => {
    const onResponse = (res: http.IncomingMessage) => {
      collect(res).then(
        (body) => resolve({ status: res.statusCode ?? 0, body }),
        (e) => reject(e),
      );
    };
    const run = async () => {
      if (req.protocol === "http") {
        request = http.request(common, onResponse);
      } else if (req.tls.mode === "pinned") {
        const socket = await connectPinned(
          req.host,
          req.port,
          req.tls.fingerprint,
          req.timeoutMs,
        );
        request = https.request(
          // Sans `agent` : Node utilise alors notre connexion déjà vérifiée (avec un agent, il l'ignorerait).
          { ...common, createConnection: () => socket },
          onResponse,
        );
      } else {
        request = https.request(
          {
            ...common,
            agent: false,
            rejectUnauthorized: true,
            ...(req.tls.ca ? { ca: req.tls.ca } : {}),
          },
          onResponse,
        );
      }
      request.on("timeout", () => {
        request.destroy(new TransportError("timeout", "délai dépassé"));
      });
      request.on("error", (e) => {
        if (e instanceof TransportError) reject(e);
        else {
          const code = (e as { code?: string }).code ?? "";
          const kind = /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|HOSTNAME/.test(code)
            ? "tls"
            : "network";
          reject(new TransportError(kind, errorLabel(e)));
        }
      });
      if (req.body !== undefined) request.write(req.body);
      request.end();
    };
    run().catch(reject);
  });
  return done;
};
