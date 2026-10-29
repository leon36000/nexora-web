import { type Database, enqueue, type Job } from "@nexora/db";
import type { Logger } from "@nexora/log";
import {
  CRAWL_JOB,
  type CrawlDeps,
  clientConfigFromEnv,
  crawlSettingsFromEnv,
  createRobotsChecker,
  createSafeHttpClient,
  finishTask,
  type PrivacyGate,
  purgeExpiredTasks,
  ROBOT_TOKEN,
  runCrawlSlice,
} from "@nexora/webpilot";
import type { HandlerRegistry } from "../registry.ts";

/**
 * Tâches WebPilot du worker (contrat §4.2) :
 *  - `webpilot.crawl` : une TRANCHE d'une exploration (quelques minutes au plus, sous le bail de la file). Si des pages
 *    restent, la tranche suivante est mise en file (clé d'idempotence par tranche). L'état (frontière, pages, règlement)
 *    est en base : un arrêt du worker ne perd rien et ne facture jamais deux fois.
 *  - `webpilot.purge` : efface les explorations dont la conservation est échue (résultats compris).
 */

export const PURGE_JOB = "webpilot.purge";

/**
 * Nexora Privacy Router n'est pas encore branché sur le worker : toute sortie est refusée (échec fermé) et l'exploration
 * échoue en `privacy_router_unavailable`. Le branchement remplace cette fonction par l'implémentation de la couche.
 */
export function failClosedGate(): PrivacyGate {
  return {
    evaluate: async () => {
      const error = new Error(
        "Nexora Privacy Router n'est pas branché sur le worker",
      );
      error.name = "PrivacyRouterUnavailableError";
      throw error;
    },
  };
}

export function crawlDepsFromEnv(
  db: Database,
  privacy: PrivacyGate,
  env: Record<string, string | undefined> = process.env,
): CrawlDeps {
  const client = createSafeHttpClient(clientConfigFromEnv(env));
  const settings = crawlSettingsFromEnv(env);
  return {
    db,
    reader: {
      client,
      robots: createRobotsChecker({ client, userAgentToken: ROBOT_TOKEN }),
      renderer: null,
    },
    privacy,
    now: () => new Date(),
    retentionMs: settings.resultRetentionMs,
    batchSize: settings.batchSize,
    delayMs: settings.delayMs,
    sliceMs: settings.sliceMs,
  };
}

export function registerWebpilotHandlers(
  registry: HandlerRegistry,
  deps: {
    db: Database;
    log: Logger;
    privacy?: PrivacyGate;
    crawl?: CrawlDeps;
  },
): HandlerRegistry {
  const crawlDeps = () =>
    deps.crawl ?? crawlDepsFromEnv(deps.db, deps.privacy ?? failClosedGate());
  registry.register(CRAWL_JOB, async (job, ctx) => {
    const taskId = String(job.payload.taskId ?? "");
    const slice = Number(job.payload.slice ?? 0);
    if (!/^[0-9a-f-]{36}$/.test(taskId)) {
      ctx.log.error("webpilot : tâche d'exploration sans identifiant valide");
      return;
    }
    const settings = { ...crawlDeps(), signal: ctx.signal };
    try {
      const out = await runCrawlSlice(settings, taskId);
      if (!out.done)
        await enqueue(deps.db, {
          type: CRAWL_JOB,
          payload: { taskId, slice: slice + 1 },
          idempotencyKey: `webpilot-crawl:${taskId}:${slice + 1}`,
        });
    } catch (error) {
      // Dernier essai perdu : ne pas laisser une exploration « en cours » avec une réservation ouverte.
      if (job.attempt >= job.maxAttempts)
        await finishTask(deps.db, taskId, "failed", {
          errorCode: "internal_error",
          retentionMs: settings.retentionMs,
          now: new Date(),
        }).catch(() => undefined);
      ctx.log.error("webpilot : tranche d'exploration en échec", {
        taskId,
        errorName: error instanceof Error ? error.name : typeof error,
      });
      throw error;
    }
  });
  registry.register(PURGE_JOB, async (_job, ctx) => {
    const purged = await purgeExpiredTasks(deps.db, new Date());
    if (purged > 0)
      ctx.log.info("webpilot : explorations échues effacées", { purged });
  });
  return registry;
}

export type { Job };
