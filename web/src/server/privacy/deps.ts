import "server-only";
import { getDb } from "../db";
import { log } from "../log";
import { createPrivacyJournal, type PrivacyJournal } from "./events";
import type { PrivacyRouterDeps } from "./router";

function intFromEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isSafeInteger(n) && n >= 0 ? n : fallback;
}

/** Délai par défaut de conservation d'une politique lue : 5 s (une modification s'applique en moins de 5 s). */
const DEFAULT_CACHE_MS = 5000;

/** Dépendances de production : base `app`, journal des décisions, journaux du site. */
export function privacyRouterDeps(journal: PrivacyJournal): PrivacyRouterDeps {
  return {
    db: getDb,
    journal,
    log,
    now: () => new Date(),
    cacheTtlMs: intFromEnv("PRIVACY_POLICY_CACHE_MS", DEFAULT_CACHE_MS),
  };
}

export function productionJournal(): PrivacyJournal {
  return createPrivacyJournal({ db: getDb, log });
}
