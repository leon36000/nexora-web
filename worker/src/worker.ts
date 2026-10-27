import { randomBytes } from "node:crypto";
import type { Database, Job } from "@nexora/db";
import type { Logger } from "@nexora/log";
import type { BackoffOptions } from "./backoff.ts";
import { claimJob, completeJob, describeError, failJob } from "./queue.ts";
import { type HandlerRegistry, toHandlerJob } from "./registry.ts";

export interface WorkerOptions {
  db: Database;
  registry: HandlerRegistry;
  logger: Logger;
  workerId?: string;
  /** Nombre de tâches traitées en parallèle par ce worker. */
  concurrency?: number;
  pollIntervalMs?: number;
  /** Durée après laquelle une tâche « en cours » d'un worker silencieux est reprise. */
  leaseMs?: number;
  backoff?: BackoffOptions;
}

const sleepAbortable = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });

export class Worker {
  readonly workerId: string;
  private readonly db: Database;
  private readonly registry: HandlerRegistry;
  private readonly log: Logger;
  private readonly concurrency: number;
  private readonly pollIntervalMs: number;
  private readonly leaseMs: number;
  private readonly backoff: BackoffOptions;
  private readonly abort = new AbortController();
  private loops: Promise<void>[] = [];

  constructor(options: WorkerOptions) {
    this.workerId =
      options.workerId ?? `worker-${randomBytes(4).toString("hex")}`;
    this.db = options.db;
    this.registry = options.registry;
    this.log = options.logger.child({ workerId: this.workerId });
    this.concurrency = options.concurrency ?? 4;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.leaseMs = options.leaseMs ?? 5 * 60_000;
    this.backoff = options.backoff ?? { baseMs: 5_000, maxMs: 60 * 60_000 };
  }

  /** Réclame et traite au plus une tâche. Retourne vrai si une tâche a été traitée. */
  async runOnce(): Promise<boolean> {
    const job = await claimJob(this.db, {
      workerId: this.workerId,
      types: this.registry.types(),
      leaseMs: this.leaseMs,
    });
    if (!job) return false;
    await this.process(job);
    return true;
  }

  start(): void {
    if (this.loops.length > 0) return;
    this.log.info("worker démarré", {
      concurrency: this.concurrency,
      types: this.registry.types(),
    });
    for (let i = 0; i < this.concurrency; i++) this.loops.push(this.loop());
  }

  /** Arrêt propre : plus aucune réclamation, attente des tâches en cours (au plus `timeoutMs`). */
  async stop(timeoutMs = 30_000): Promise<boolean> {
    this.log.info("worker en arrêt");
    this.abort.abort();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), timeoutMs);
    });
    const result = await Promise.race([
      Promise.all(this.loops).then(() => "done" as const),
      timeout,
    ]);
    if (timer) clearTimeout(timer);
    this.loops = [];
    if (result === "timeout") {
      this.log.warn(
        "arrêt forcé : des tâches restent en cours, elles seront reprises après le bail",
      );
      return false;
    }
    this.log.info("worker arrêté");
    return true;
  }

  private async loop(): Promise<void> {
    while (!this.abort.signal.aborted) {
      try {
        const worked = await this.runOnce();
        if (!worked)
          await sleepAbortable(this.pollIntervalMs, this.abort.signal);
      } catch (error) {
        this.log.error("erreur de la boucle de consommation", { error });
        await sleepAbortable(this.pollIntervalMs, this.abort.signal);
      }
    }
  }

  private async process(job: Job): Promise<void> {
    const log = this.log.child({
      jobId: job.id,
      jobType: job.type,
      attempt: job.attempts,
    });
    const handler = this.registry.get(job.type);
    const startedAt = Date.now();
    log.info("tâche démarrée");
    try {
      if (!handler)
        throw new Error(`aucun gestionnaire pour le type ${job.type}`);
      await handler(toHandlerJob(job), { log, signal: this.abort.signal });
    } catch (error) {
      const abandoned = job.attempts >= job.maxAttempts;
      const recorded = await failJob(
        this.db,
        job,
        this.workerId,
        error,
        this.backoff,
      );
      log[abandoned ? "error" : "warn"](
        abandoned ? "tâche abandonnée" : "tâche en échec, reprise planifiée",
        {
          durationMs: Date.now() - startedAt,
          error: describeError(error),
          recorded,
        },
      );
      return;
    }
    const recorded = await completeJob(this.db, job, this.workerId);
    log.info("tâche terminée", {
      durationMs: Date.now() - startedAt,
      recorded,
    });
  }
}
