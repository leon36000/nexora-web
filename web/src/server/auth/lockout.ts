import { createHash } from "node:crypto";
import { authLockouts, type Database, eq, sql } from "@nexora/db";

/**
 * Verrouillage progressif des connexions par courriel (ASVS 2.2.1 : défense contre le bourrage d'identifiants et
 * la force brute, en plus de la limite de débit par adresse). Les 4 premiers échecs consécutifs sont gratuits ;
 * à partir du 5e, le compte est refusé 1 minute, puis 2, 4, 8… jusqu'à 30 minutes. Une connexion réussie remet
 * le compteur à zéro, et 24 heures sans échec aussi.
 *
 * La table est indexée par l'empreinte du courriel soumis : une adresse sans compte est verrouillée exactement
 * comme une adresse existante (aucune énumération) et aucune adresse n'est stockée en clair. Contrepartie
 * assumée : quelqu'un qui connaît votre courriel peut retarder vos connexions de 30 minutes au plus ; la
 * réinitialisation du mot de passe par courriel et la double authentification ne sont pas touchées.
 */
export const LOCKOUT_FREE_ATTEMPTS = 4;
export const LOCKOUT_BASE_MS = 60_000;
export const LOCKOUT_MAX_MS = 30 * 60_000;
export const LOCKOUT_FORGET_MS = 24 * 3_600_000;

export function lockoutKey(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

/** Durée du verrouillage après `failures` échecs consécutifs. */
export function lockDurationMs(failures: number): number {
  const over = failures - LOCKOUT_FREE_ATTEMPTS;
  if (over <= 0) return 0;
  return Math.min(LOCKOUT_BASE_MS * 2 ** (over - 1), LOCKOUT_MAX_MS);
}

/** Millisecondes restantes de verrouillage (0 : libre). */
export async function lockedForMs(
  db: Database,
  email: string,
  now: number,
): Promise<number> {
  const [row] = await db
    .select({ lockedUntil: authLockouts.lockedUntil })
    .from(authLockouts)
    .where(eq(authLockouts.key, lockoutKey(email)));
  if (!row?.lockedUntil) return 0;
  return Math.max(0, row.lockedUntil.getTime() - now);
}

export async function recordLoginFailure(
  db: Database,
  email: string,
  now: number,
): Promise<number> {
  const key = lockoutKey(email);
  const at = new Date(now);
  const forgotten = new Date(now - LOCKOUT_FORGET_MS).toISOString();
  const [row] = await db
    .insert(authLockouts)
    .values({ key, failures: 1, updatedAt: at })
    .onConflictDoUpdate({
      target: authLockouts.key,
      set: {
        failures: sql`CASE WHEN ${authLockouts.updatedAt} < ${forgotten} THEN 1 ELSE ${authLockouts.failures} + 1 END`,
        updatedAt: at,
      },
    })
    .returning({ failures: authLockouts.failures });
  const failures = row?.failures ?? 1;
  const duration = lockDurationMs(failures);
  await db
    .update(authLockouts)
    .set({ lockedUntil: duration > 0 ? new Date(now + duration) : null })
    .where(eq(authLockouts.key, key));
  return failures;
}

export async function clearLoginFailures(
  db: Database,
  email: string,
): Promise<void> {
  await db.delete(authLockouts).where(eq(authLockouts.key, lockoutKey(email)));
}

/**
 * Nom affiché : une seule ligne, sans caractères de contrôle ni de direction, sans adresse web ni balise (il est
 * recopié tel quel dans des courriels envoyés depuis notre domaine : sans cela, une inscription au nom de la
 * victime fait parvenir à celle-ci un message rédigé par l'attaquant). `null` : nom inutilisable.
 */
export function sanitizeDisplayName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const flat = name
    .replace(
      /[\p{Cc}\u2028\u2029\u200B\u202A-\u202E\u2066-\u2069\uFEFF]+/gu,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  if (!flat) return null;
  if (/[<>]|:\/\/|\bwww\./i.test(flat)) return null;
  return flat.slice(0, 120);
}
