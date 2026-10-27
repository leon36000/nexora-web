import { type Database, eq, inArray, type Job, jobs, sql } from "@nexora/db";
import { scrubString } from "@nexora/log";
import { type BackoffOptions, backoffDelayMs } from "./backoff.ts";

export interface ClaimOptions {
  workerId: string;
  /** Types pour lesquels ce worker a un gestionnaire. */
  types: string[];
  /** Au-delà de ce délai, une tâche « en cours » est considérée abandonnée par un worker mort. */
  leaseMs: number;
}

/**
 * Réclame la prochaine tâche disponible : SELECT … FOR UPDATE SKIP LOCKED puis passage à « running »
 * dans la même transaction. Deux consommateurs ne reçoivent jamais la même tâche.
 */
export async function claimJob(
  db: Database,
  options: ClaimOptions,
): Promise<Job | null> {
  if (options.types.length === 0) return null;
  const leaseSeconds = options.leaseMs / 1000;
  const expired = sql`${jobs.lockedAt} < now() - make_interval(secs => ${leaseSeconds})`;

  // Tâches dont le worker est mort et qui n'ont plus d'essais : abandon définitif.
  await db
    .update(jobs)
    .set({
      status: "dead",
      lastError: "bail expiré après le dernier essai autorisé",
      finishedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(
      sql`${jobs.status} = 'running' AND ${expired} AND ${jobs.attempts} >= ${jobs.maxAttempts}`,
    );

  return db.transaction(async (tx) => {
    const picked = await tx.execute<{ id: string }>(sql`
      SELECT ${jobs.id} AS id FROM ${jobs}
      WHERE ${inArray(jobs.type, options.types)}
        AND (
          (${jobs.status} = 'pending' AND ${jobs.availableAt} <= now())
          OR (${jobs.status} = 'running' AND ${expired} AND ${jobs.attempts} < ${jobs.maxAttempts})
        )
      ORDER BY ${jobs.availableAt}, ${jobs.createdAt}
      LIMIT 1
      FOR UPDATE SKIP LOCKED`);
    const id = picked[0]?.id;
    if (!id) return null;
    const [claimed] = await tx
      .update(jobs)
      .set({
        status: "running",
        lockedBy: options.workerId,
        lockedAt: sql`now()`,
        attempts: sql`${jobs.attempts} + 1`,
        updatedAt: sql`now()`,
      })
      .where(eq(jobs.id, id))
      .returning();
    return claimed ?? null;
  });
}

const ownedAndRunning = (job: Job, workerId: string) =>
  sql`${jobs.id} = ${job.id} AND ${jobs.status} = 'running' AND ${jobs.lockedBy} = ${workerId}`;

/** Marque la tâche réussie. Faux si elle a été reprise par un autre worker entre-temps. */
export async function completeJob(
  db: Database,
  job: Job,
  workerId: string,
): Promise<boolean> {
  const rows = await db
    .update(jobs)
    .set({
      status: "succeeded",
      lockedBy: null,
      lockedAt: null,
      finishedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(ownedAndRunning(job, workerId))
    .returning({ id: jobs.id });
  return rows.length === 1;
}

export function describeError(error: unknown): string {
  const raw =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : `Erreur non standard (${typeof error})`;
  return scrubString(raw).slice(0, 500);
}

/**
 * Enregistre l'échec : reprise plus tard avec délai exponentiel, ou abandon (« dead ») quand les
 * essais sont épuisés. Le message est nettoyé des motifs de secrets connus avant stockage.
 */
export async function failJob(
  db: Database,
  job: Job,
  workerId: string,
  error: unknown,
  backoff: BackoffOptions,
): Promise<boolean> {
  const message = describeError(error);
  const entry = JSON.stringify([
    { attempt: job.attempts, at: new Date().toISOString(), message },
  ]);
  const exhausted = job.attempts >= job.maxAttempts;
  const delaySeconds = backoffDelayMs(job.attempts, backoff) / 1000;
  const rows = await db
    .update(jobs)
    .set({
      status: exhausted ? "dead" : "pending",
      lockedBy: null,
      lockedAt: null,
      lastError: message,
      errors: sql`${jobs.errors} || ${entry}::jsonb`,
      availableAt: exhausted
        ? jobs.availableAt
        : sql`now() + make_interval(secs => ${delaySeconds})`,
      finishedAt: exhausted ? sql`now()` : null,
      updatedAt: sql`now()`,
    })
    .where(ownedAndRunning(job, workerId))
    .returning({ id: jobs.id });
  return rows.length === 1;
}
