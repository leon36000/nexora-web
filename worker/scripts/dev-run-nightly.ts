// Déclenche l'audit nocturne comme le planificateur le ferait à 03 h 05 (America/Toronto) : même code, horloge fixée.
import { createDb } from "@nexora/db";
import { loadRootEnv } from "@nexora/db/env";
import { createLogger } from "@nexora/log";
import { tickScheduler } from "../src/scheduler.ts";

loadRootEnv();
const handle = createDb(process.env.DATABASE_URL as string, { max: 2 });
const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const done = await tickScheduler({
  db: handle.db,
  log: createLogger({ name: "dev-nightly" }),
  now: () => new Date(`${date}T07:05:00Z`), // 03:05 à Toronto (heure d'été) ou 02:05 (hiver) : dû dans les deux cas à partir de 03:00
});
console.log("planifié :", done.join(", ") || "rien (déjà planifié)");
await handle.close();
