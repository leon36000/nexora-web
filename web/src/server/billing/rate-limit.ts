import { apiRateLimits, type Database, sql } from "@nexora/db";

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  retryAfterSeconds: number;
}

/**
 * Limitation de débit à fenêtre fixe, partagée entre les instances (une seule instruction SQL
 * atomique). Sert aux routes de facturation ; les routes d'authentification utilisent celle de
 * Better Auth.
 */
export async function consumeRateLimit(
  db: Database,
  key: string,
  options: { limit: number; windowSeconds: number; now?: Date },
): Promise<RateLimitResult> {
  const now = options.now ?? new Date();
  const windowMs = options.windowSeconds * 1000;
  const expiredBefore = new Date(now.getTime() - windowMs);
  const [row] = await db
    .insert(apiRateLimits)
    .values({ key, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: apiRateLimits.key,
      set: {
        windowStart: sql`CASE WHEN ${apiRateLimits.windowStart} <= ${expiredBefore.toISOString()}::timestamptz THEN ${now.toISOString()}::timestamptz ELSE ${apiRateLimits.windowStart} END`,
        count: sql`CASE WHEN ${apiRateLimits.windowStart} <= ${expiredBefore.toISOString()}::timestamptz THEN 1 ELSE ${apiRateLimits.count} + 1 END`,
      },
    })
    .returning({
      count: apiRateLimits.count,
      windowStart: apiRateLimits.windowStart,
    });
  if (!row) throw new Error("limitation de débit : aucune ligne");
  const elapsed = now.getTime() - row.windowStart.getTime();
  return {
    allowed: row.count <= options.limit,
    count: row.count,
    retryAfterSeconds: Math.max(1, Math.ceil((windowMs - elapsed) / 1000)),
  };
}
