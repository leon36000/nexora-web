import { createDb } from "@nexora/db";
import { loadRootEnv } from "@nexora/db/env";
import { createLogger } from "@nexora/log";
import { defaultRegistry } from "./handlers.ts";
import { startScheduler } from "./scheduler.ts";
import { Worker } from "./worker.ts";

loadRootEnv();
const log = createLogger({ name: "worker" });
const url = process.env.DATABASE_URL;
if (!url) {
  log.error("DATABASE_URL est absent");
  process.exit(1);
}

const handle = createDb(url, { max: 10 });
const worker = new Worker({
  db: handle.db,
  registry: defaultRegistry({ db: handle.db, log }),
  logger: log,
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 4),
  pollIntervalMs: Number(process.env.WORKER_POLL_MS ?? 1000),
});

// Planificateur (audit nocturne, indexation, santé des modèles, veille) : WORKER_SCHEDULER=off pour le couper.
const scheduler =
  process.env.WORKER_SCHEDULER === "off"
    ? null
    : startScheduler({ db: handle.db, log });

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
