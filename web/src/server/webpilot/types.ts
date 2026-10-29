import type { Database } from "@nexora/db";
import type { Logger } from "@nexora/log";
import type {
  BrowserService,
  ReaderDeps,
  SafeHttpClient,
} from "@nexora/webpilot";
import type { PrivacyRouter } from "../privacy/types";
import type { WebpilotConfig } from "./config";

/** Dépendances de la couche `/v1/webpilot/*` : tout ce qui sort ou se mesure est injectable (essais, production). */
export interface WebpilotDeps {
  db: () => Database;
  /** Nexora Privacy Router : évalue chaque sortie AVANT qu'elle ait lieu. Panne = refus. */
  privacy: PrivacyRouter;
  log: Logger;
  now: () => Date;
  requestId: () => string;
  config: WebpilotConfig;
  /** Lecture de pages : client HTTP de sortie unique, robots.txt, service de rendu éventuel. */
  reader: ReaderDeps;
  /** Client du moteur de recherche (hôte interne approuvé) ; null si WEBPILOT_SEARCH_URL est absent. */
  searchClient: SafeHttpClient | null;
  /** Service de navigateur des sessions ; null si WEBPILOT_BROWSER_URL ou le secret manquent (sessions : 503). */
  browser: BrowserService | null;
  /** Passerelle de modèles interne (extraction) : reçoit une requête `chat/completions` portant la clé de l'appelant. */
  chat: (request: Request) => Promise<Response>;
}
