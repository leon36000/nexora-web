import { createHash, timingSafeEqual } from "node:crypto";

/** Longueur minimale du jeton d'administration attendu ; en dessous, la configuration est refusée. */
const MIN_TOKEN_LENGTH = 32;

/**
 * Compare deux chaînes en temps constant, quelles que soient leurs longueurs : les deux sont
 * ramenées à une empreinte SHA-256 de taille fixe avant la comparaison.
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export type AdminAuthResult = "ok" | "unauthorized" | "not_configured";

/**
 * Authentifie une requête d'administration : `Authorization: Bearer <NEXORA_APP_ADMIN_TOKEN>`.
 * Échoue fermé si le jeton attendu est absent ou trop court.
 */
export function checkAdminAuth(
  request: Request,
  expectedToken: string | undefined,
): AdminAuthResult {
  if (!expectedToken || expectedToken.length < MIN_TOKEN_LENGTH)
    return "not_configured";
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  if (!match?.[1]) return "unauthorized";
  return safeEqual(match[1], expectedToken) ? "ok" : "unauthorized";
}
