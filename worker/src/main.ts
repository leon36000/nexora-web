import { createWorkspaceDriver, resolveCodeHosting } from "@nexora/code";
import { createDb, enqueue } from "@nexora/db";
import { loadRootEnv } from "@nexora/db/env";
import { createLogger } from "@nexora/log";
import { usageClientFromEnv } from "./code/handlers.ts";
import { defaultRegistry } from "./handlers.ts";
import { startScheduler } from "./scheduler.ts";
import { SWEEP_EVERY_MS, vpsDepsFromEnv } from "./vps-handlers.ts";
import { Worker } from "./worker.ts";

loadRootEnv();
const log = createLogger({ name: "worker" });
const url = process.env.DATABASE_URL;
if (!url) {
  log.error("DATABASE_URL est absent");
  process.exit(1);
}

const handle = createDb(url, { max: 10 });
const vps = vpsDepsFromEnv(handle.db, log);
if (!vps)
  log.warn("VPS : NEXORA_VAULT_MASTER_KEY absente, provisionnement désactivé");
// Premier balayage ; chaque balayage planifie le suivant (clé unique par tranche de temps).
else
  await enqueue(handle.db, {
    type: "vps.sweep",
    idempotencyKey: `vps-sweep:${Math.floor(Date.now() / SWEEP_EVERY_MS)}`,
  });
// Nexora Code hébergé : arrêt après inactivité et mesure de l'espace. Désactivé sans pilote Docker réel, sans client du
// site (NEXORA_APP_INTERNAL_URL, NEXORA_APP_ADMIN_TOKEN) ; l'essai à blanc vit dans le processus du site seulement.
const hosting = resolveCodeHosting(
  process.env,
  process.env.SITE_URL?.trim() || "http://localhost:3500",
);
const usage = usageClientFromEnv(process.env);
const code =
  hosting.ok && hosting.config.mode === "docker" && usage
    ? {
        driver: createWorkspaceDriver(hosting.config, (line) => log.info(line)),
        usage,
        image: hosting.config.image,
        idleMinutes: hosting.config.idleMinutes,
      }
    : null;
if (hosting.ok && !code)
  log.warn(
    "Nexora Code hébergé : balayage désactivé (pilote « docker » et NEXORA_APP_INTERNAL_URL / NEXORA_APP_ADMIN_TOKEN requis)",
  );
const worker = new Worker({
  db: handle.db,
  registry: defaultRegistry({ db: handle.db, log, vps, code }),
  logger: log,
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 4),
  pollIntervalMs: Number(process.env.WORKER_POLL_MS ?? 1000),
});

// Planificateur (audit nocturne, indexation, santé des modèles, veille) : WORKER_SCHEDULER=off pour le couper.
const scheduler =
  process.env.WORKER_SCHEDULER === "off"
    ? null
    : startScheduler({ db: handle.db, log, codeSweep: code !== null });

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log.info("signal reçu", { signal });
  scheduler?.stop();
  const clean = await worker.stop(30_000);
  await handle.close();
  process.exit(clean ? 0 : 1);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

worker.start();
