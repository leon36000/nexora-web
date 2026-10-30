import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Billets et cookies signés de l'origine dédiée de l'environnement Nexora Code (voir `docs/nexora-code.md` § 5).
 *
 * L'interface web de l'environnement est servie depuis un hôte à part (`<proxy_id>.<suffixe>`), jamais depuis l'origine
 * du site : la session du site n'y est donc pas envoyée. Le site (session ouverte) y envoie la personne avec un billet
 * d'ENTRÉE de 60 secondes ; l'hôte dédié le vérifie et pose un cookie de SESSION propre à cet hôte (8 heures). Les deux
 * sont des charges JSON signées HMAC-SHA256, de genres distincts (un billet n'est pas un cookie).
 */

export type TokenKind = "enter" | "session";

export interface TokenClaims {
  pid: string;
  uid: string;
}

const b64 = (value: string) => Buffer.from(value, "utf8").toString("base64url");
const mac = (secret: string, payload: string) =>
  createHmac("sha256", secret).update(payload).digest("base64url");

export function signToken(
  secret: string,
  claims: TokenClaims & { k: TokenKind },
  ttlSeconds: number,
  now: Date,
): string {
  const payload = b64(
    JSON.stringify({
      k: claims.k,
      pid: claims.pid,
      uid: claims.uid,
      exp: Math.floor(now.getTime() / 1000) + ttlSeconds,
    }),
  );
  return `${payload}.${mac(secret, payload)}`;
}

export function verifyToken(
  secret: string,
  token: string,
  kind: TokenKind,
  now: Date,
): TokenClaims | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts as [string, string];
  const expected = Buffer.from(mac(secret, payload));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return null;
  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { k?: unknown; pid?: unknown; uid?: unknown; exp?: unknown };
    if (
      claims.k !== kind ||
      typeof claims.pid !== "string" ||
      typeof claims.uid !== "string" ||
      typeof claims.exp !== "number" ||
      claims.exp * 1000 <= now.getTime()
    )
      return null;
    return { pid: claims.pid, uid: claims.uid };
  } catch {
    return null;
  }
}

/** Secret de signature : `NEXORA_CODE_TICKET_SECRET` (32 caractères au moins), sinon dérivé de `BETTER_AUTH_SECRET`. */
export function ticketSecret(
  env: Record<string, string | undefined>,
): string | null {
  const own = env.NEXORA_CODE_TICKET_SECRET?.trim();
  if (own && own.length >= 32) return own;
  const base = env.BETTER_AUTH_SECRET;
  if (!base || base.length < 16) return null;
  return createHmac("sha256", base)
    .update("nexora-code-ws-ticket-v1")
    .digest("hex");
}

const PROXY_ID = /^[0-9a-f]{32}$/;

/** Identifiant d'environnement porté par l'hôte `<id>.<suffixe>[:port]` ; `null` pour tout autre hôte. */
export function parseDedicatedHost(
  host: string | null | undefined,
  suffix: string | null | undefined,
): string | null {
  if (!host || !suffix) return null;
  const name = host.toLowerCase().replace(/:\d+$/, "");
  const tail = `.${suffix.toLowerCase()}`;
  if (!name.endsWith(tail)) return null;
  const id = name.slice(0, -tail.length);
  return PROXY_ID.test(id) ? id : null;
}

/** Origine (schéma, hôte, port) de l'interface d'un environnement : schéma et port du site, hôte `<id>.<suffixe>`. */
export function dedicatedOrigin(
  siteUrl: string,
  suffix: string,
  proxyId: string,
): string {
  const site = new URL(siteUrl);
  return `${site.protocol}//${proxyId}.${suffix}${site.port ? `:${site.port}` : ""}`;
}
