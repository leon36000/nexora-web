import type { Job } from "@nexora/db";
import type { Logger } from "@nexora/log";

/** Vue de la tâche donnée au gestionnaire. `attempt` vaut 1 au premier essai. */
export interface HandlerJob {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  attempt: number;
  maxAttempts: number;
}

export interface HandlerContext {
  log: Logger;
  /** Signalé à l'arrêt du worker : un gestionnaire long doit s'interrompre proprement. */
  signal: AbortSignal;
}

export type JobHandler = (
  job: HandlerJob,
  ctx: HandlerContext,
) => Promise<void>;

export function toHandlerJob(job: Job): HandlerJob {
  return {
    id: job.id,
    type: job.type,
    payload: job.payload,
    attempt: job.attempts,
    maxAttempts: job.maxAttempts,
  };
}

/** Registre des gestionnaires par type de tâche. Un type absent n'est jamais réclamé. */
export class HandlerRegistry {
  private readonly handlers = new Map<string, JobHandler>();

  register(type: string, handler: JobHandler): this {
    if (this.handlers.has(type))
      throw new Error(`Gestionnaire déjà enregistré : ${type}`);
    this.handlers.set(type, handler);
    return this;
  }

  get(type: string): JobHandler | undefined {
    return this.handlers.get(type);
  }

  types(): string[] {
    return [...this.handlers.keys()];
  }
}
