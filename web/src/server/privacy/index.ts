import "server-only";
import { privacyRouterDeps, productionJournal } from "./deps";
import type { PrivacyJournal } from "./events";
import { createPrivacyRouter, type ManagedPrivacyRouter } from "./router";

/**
 * Point d'entrée du Privacy Router pour le reste du site : `getPrivacyRouter()`. Singleton par processus
 * (conservé entre les rechargements à chaud en développement) : le cache de politiques est partagé par toutes les
 * requêtes.
 */

export type {
  OutboundIntent,
  PrivacyDecision,
  PrivacyRouter,
} from "./types";
export { PrivacyRouterUnavailableError } from "./types";

const globalForPrivacy = globalThis as unknown as {
  __nexoraPrivacy?: { router: ManagedPrivacyRouter; journal: PrivacyJournal };
};

function instance() {
  if (!globalForPrivacy.__nexoraPrivacy) {
    const journal = productionJournal();
    globalForPrivacy.__nexoraPrivacy = {
      journal,
      router: createPrivacyRouter(privacyRouterDeps(journal)),
    };
  }
  return globalForPrivacy.__nexoraPrivacy;
}

export function getPrivacyRouter(): ManagedPrivacyRouter {
  return instance().router;
}

/** Nombre d'écritures du journal qui ont échoué depuis le démarrage du processus (pour une sonde). */
export function privacyJournalFailures(): number {
  return instance().journal.failures();
}
