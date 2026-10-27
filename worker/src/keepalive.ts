import { type Database, eq, jobs, sql } from "@nexora/db";

/**
 * Renouvelle le bail d'une tâche longue (audits, agents) pour qu'un autre worker ne la reprenne pas au bout de
 * 5 minutes. À arrêter dans `finally`. Renvoie la fonction d'arrêt.
 */
export function keepJobAlive(
  db: Database,
  jobId: string,
  everyMs = 60_000,
): () => void {
  const timer = setInterval(() => {
    db.update(jobs)
      .set({ lockedAt: sql`now()` })
      .where(eq(jobs.id, jobId))
      .catch(() => {
        /* le prochain battement réessaiera */
      });
  }, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
