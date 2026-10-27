import type { Database, SeoAdapterKey } from "@nexora/db";
import { SEO_ADAPTER_KEYS } from "@nexora/db";
import type { Logger } from "@nexora/log";
import { readVaultSecret } from "@nexora/vault";
import { keepJobAlive } from "../keepalive.ts";
import type { HandlerRegistry } from "../registry.ts";
import { checkAdapter } from "./adapters.ts";
import { createAuditHandler } from "./audit.ts";
import { runIndexing } from "./indexing.ts";

/** Tâches SEO du worker : `seo.audit` { auditId }, `seo.index` { trigger, dryRun? }, `seo.adapter-check` { key }. */
export function registerSeoHandlers(
  registry: HandlerRegistry,
  deps: { db: Database; log: Logger },
): HandlerRegistry {
  const { db, log } = deps;
  const readSecret = (ref: string) => readVaultSecret(db, ref);

  registry.register("seo.audit", createAuditHandler({ db, log }));

  registry.register("seo.index", async (job) => {
    const trigger = ["manual", "publish", "schedule"].includes(
      String(job.payload.trigger),
    )
      ? (job.payload.trigger as "manual" | "publish" | "schedule")
      : "manual";
    const stop = keepJobAlive(db, job.id);
    try {
      await runIndexing(
        { db, log, readSecret },
        { trigger, dryRun: job.payload.dryRun === true },
      );
    } finally {
      stop();
    }
  });

  registry.register("seo.adapter-check", async (job, ctx) => {
    const key = job.payload.key;
    if (
      typeof key !== "string" ||
      !(SEO_ADAPTER_KEYS as readonly string[]).includes(key)
    )
      throw new Error("adaptateur inconnu");
    const r = await checkAdapter({ db, readSecret }, key as SeoAdapterKey);
    ctx.log.info("seo.adapter-check", { key, status: r.status });
  });
  return registry;
}
