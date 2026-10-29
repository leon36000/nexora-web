import type { Database } from "@nexora/db";
import type { Logger } from "@nexora/log";
import {
  createPrivacyJournal,
  createPrivacyRouter,
  type PrivacyRouter,
} from "@nexora/privacy";

/** Politique lue au plus toutes les 5 s : une modification de l'organisation s'applique en cours d'exploration. */
const CACHE_TTL_MS = 5000;

/**
 * Nexora Privacy Router du worker : le même cœur que celui du site (`@nexora/privacy`), avec la base et les journaux
 * du worker. Chaque page d'une exploration passe par `evaluate` avant de sortir ; panne = refus (échec fermé).
 */
export function workerPrivacyRouter(db: Database, log: Logger): PrivacyRouter {
  const getDb = () => db;
  return createPrivacyRouter({
    db: getDb,
    journal: createPrivacyJournal({ db: getDb, log }),
    log,
    now: () => new Date(),
    cacheTtlMs: CACHE_TTL_MS,
  });
}
