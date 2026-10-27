import { isIP } from "node:net";
import * as tls from "node:tls";
import { certFingerprint } from "./transport.ts";

/**
 * Premier contact avec un serveur Proxmox : lit le certificat présenté par le serveur pour en
 * montrer l'empreinte SHA-256 à l'opérateur, qui la confirme (épinglage). Seule la poignée de main
 * TLS a lieu : AUCUNE requête HTTP n'est écrite, donc aucun jeton ne part.
 */
export interface TlsProbe {
  /** SHA-256 du certificat (hexadécimal minuscule). */
  fingerprint: string;
  /** Même empreinte, majuscules séparées par « : » (comme l'affiche Proxmox). */
  fingerprintDisplay: string;
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  expired: boolean;
  /** Émetteur = sujet : certificat auto-signé (cas d'une installation neuve de Proxmox). */
  selfSigned: boolean;
  /** Reconnu par la chaîne de confiance du système (alors l'épinglage n'est pas nécessaire). */
  trusted: boolean;
  /** Le nom ou l'adresse saisis figurent dans le certificat. */
  hostnameMatches: boolean;
}

export class TlsProbeError extends Error {
  readonly kind: "network" | "timeout" | "tls";
  constructor(kind: TlsProbeError["kind"], message: string) {
    super(message);
    this.name = "TlsProbeError";
    this.kind = kind;
  }
}

const dn = (o: Record<string, unknown> | undefined): string =>
  Object.entries(o ?? {})
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join("+") : String(v)}`)
    .join(", ");

export function probeTls(opts: {
  host: string;
  port: number;
  timeoutMs?: number;
}): Promise<TlsProbe> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: opts.host,
      port: opts.port,
      rejectUnauthorized: false,
      ...(isIP(opts.host) ? {} : { servername: opts.host }),
    });
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      fn();
    };
    const timer = setTimeout(
      () =>
        finish(() =>
          reject(
            new TlsProbeError(
              "timeout",
              "le serveur ne répond pas (délai dépassé)",
            ),
          ),
        ),
      timeoutMs,
    );
    socket.once("secureConnect", () => {
      const cert = socket.getPeerCertificate(false);
      if (!cert?.raw)
        return finish(() =>
          reject(new TlsProbeError("tls", "aucun certificat présenté")),
        );
      const fingerprint = certFingerprint(cert.raw);
      const validTo = new Date(cert.valid_to);
      finish(() =>
        resolve({
          fingerprint,
          fingerprintDisplay:
            fingerprint.toUpperCase().match(/../g)?.join(":") ?? "",
          subject: dn(cert.subject as unknown as Record<string, unknown>),
          issuer: dn(cert.issuer as unknown as Record<string, unknown>),
          validFrom: new Date(cert.valid_from).toISOString(),
          validTo: validTo.toISOString(),
          expired: validTo.getTime() < Date.now(),
          selfSigned:
            dn(cert.subject as unknown as Record<string, unknown>) ===
            dn(cert.issuer as unknown as Record<string, unknown>),
          trusted: socket.authorized,
          hostnameMatches:
            tls.checkServerIdentity(opts.host, cert) === undefined,
        }),
      );
    });
    socket.once("error", (e) => {
      const code = (e as { code?: string }).code ?? "";
      finish(() =>
        reject(
          /^ERR_SSL|WRONG_VERSION|EPROTO/.test(code) ||
            /wrong version|alert|ssl/i.test(e.message)
            ? new TlsProbeError(
                "tls",
                "le serveur ne parle pas TLS sur ce port (ce n'est pas l'interface de Proxmox)",
              )
            : new TlsProbeError(
                "network",
                `serveur injoignable${code ? ` (${code})` : ""}`,
              ),
        ),
      );
    });
  });
}
