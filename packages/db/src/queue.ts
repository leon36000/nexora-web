import { sql } from "drizzle-orm";
import type { Executor } from "./ledger.ts";
import { jobs } from "./schema.ts";

export type Job = typeof jobs.$inferSelect;

export interface EnqueueInput {
  type: string;
  payload?: Record<string, unknown>;
  /** Si fournie, une seule tâche existe pour cette clé : les appels suivants renvoient la première. */
  idempotencyKey?: string;
  maxAttempts?: number;
  availableAt?: Date;
}

/** Ajoute une tâche à la file. Idempotent lorsque `idempotencyKey` est fournie. */
export async function enqueue(db: Executor, input: EnqueueInput): Promise<Job> {
  const values = {
    type: input.type,
    payload: input.payload ?? {},
    idempotencyKey: input.idempotencyKey ?? null,
    ...(input.maxAttempts !== undefined
      ? { maxAttempts: input.maxAttempts }
      : {}),
    ...(input.availableAt ? { availableAt: input.availableAt } : {}),
  };
  const inserted = await db
    .insert(jobs)
    .values(values)
    .onConflictDoNothing({ target: jobs.idempotencyKey })
    .returning();
  const created = inserted[0];
  if (created) return created;

  const existing = await db
    .select()
    .from(jobs)
    .where(sql`${jobs.idempotencyKey} = ${input.idempotencyKey ?? null}`)
    .limit(1);
  const found = existing[0];
  if (!found)
    throw new Error("enqueue : tâche introuvable après conflit d'idempotence");
  return found;
}
