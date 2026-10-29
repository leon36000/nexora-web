import { clientConfigFromEnv, ROBOT_TOKEN } from "@nexora/webpilot";

/**
 * Paramètres de WebPilot, lus dans l'environnement (contrat §9 : « jamais en dur dans le code »). Les valeurs par défaut
 * ci-dessous ne sont que des plafonds prudents de départ, provisoires, à ajuster avec le fondateur et sur un pilote
 * (voir docs/webpilot.md, « Décisions provisoires »). Aucune n'est un prix.
 */
export interface WebpilotConfig {
  /** Nom et adresse de contact du robot (jeton produit `NexoraWebPilot`). */
  userAgent: string;
  allowedPorts: number[];
  /** Taille maximale d'une réponse de la cible, en octets. */
  maxBytes: number;
  /** Durée totale d'une lecture, en ms. */
  timeoutMs: number;
  maxRedirects: number;
  /** Requêtes par minute et par clé (la clé peut avoir sa propre limite `rpm_limit`). */
  defaultRpm: number;
  maxBodyBytes: number;
  maxSearchResults: number;
  maxCrawlPages: number;
  maxCrawlDepth: number;
  /** Explorations actives (en file ou en cours) par organisation. */
  maxActiveCrawls: number;
  maxExtractUrls: number;
  /** Caractères de page envoyés au modèle par page. */
  maxExtractChars: number;
  extractMaxOutputTokens: number;
  /** Modèle d'extraction par défaut (identifiant public du catalogue) ; absent : `model` est requis. */
  extractModel: string | null;
  /** Durée de conservation des résultats d'une exploration après sa fin. */
  resultRetentionMs: number;
  /** En-têtes que l'appelant peut transmettre à la cible (liste fermée, minuscules). */
  allowedHeaders: string[];
  maxWaitMs: number;
  /** Adresse du moteur de recherche (SearXNG) ; absent : `search` répond 503 `webpilot_unavailable`. */
  searchUrl: string | null;
  /**
   * Adresse du service de navigateur (rendu de pages et sessions), sur un réseau isolé. Absent : `render: "browser"`
   * répond 422 `render_unavailable` et les sessions 503 `webpilot_unavailable`.
   */
  browserUrl: string | null;
  /** Secret partagé site <-> service de navigateur (jamais exposé au client). Absent : service considéré non réglé. */
  browserSecret: string | null;
  /** Plafond de `max_minutes` d'une session. */
  sessionMaxMinutes: number;
  /** Inactivité par défaut et plafond, en secondes. */
  sessionDefaultIdleSeconds: number;
  sessionMaxIdleSeconds: number;
  /** Sessions ouvertes au plus par organisation. */
  sessionMaxOpen: number;
  /** Actions au plus par requête, et caractères au plus par saisie. */
  sessionMaxActions: number;
  sessionMaxTextChars: number;
  /** Fenêtre au plus (largeur, hauteur) d'une session. */
  sessionMaxViewport: { width: number; height: number };
}

const int = (raw: string | undefined, fallback: number, min = 1): number => {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= min ? n : fallback;
};
const list = (raw: string | undefined, fallback: string[]): string[] => {
  const items = (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return items.length ? items : fallback;
};

export { ROBOT_TOKEN };

export function webpilotConfig(
  env: Record<string, string | undefined> = process.env,
): WebpilotConfig {
  return {
    ...clientConfigFromEnv(env),
    defaultRpm: int(env.WEBPILOT_DEFAULT_RPM, 60),
    maxBodyBytes: int(env.WEBPILOT_MAX_BODY_BYTES, 100_000),
    maxSearchResults: int(env.WEBPILOT_MAX_SEARCH_RESULTS, 20),
    maxCrawlPages: int(env.WEBPILOT_MAX_CRAWL_PAGES, 100),
    maxCrawlDepth: int(env.WEBPILOT_MAX_CRAWL_DEPTH, 5, 0),
    maxActiveCrawls: int(env.WEBPILOT_MAX_ACTIVE_CRAWLS, 3),
    maxExtractUrls: int(env.WEBPILOT_MAX_EXTRACT_URLS, 5),
    maxExtractChars: int(env.WEBPILOT_MAX_EXTRACT_CHARS, 40_000),
    extractMaxOutputTokens: int(env.WEBPILOT_EXTRACT_MAX_OUTPUT_TOKENS, 2048),
    extractModel: env.WEBPILOT_EXTRACT_MODEL?.trim() || null,
    resultRetentionMs: int(env.WEBPILOT_RESULT_RETENTION_HOURS, 24) * 3_600_000,
    allowedHeaders: list(env.WEBPILOT_ALLOWED_HEADERS, [
      "accept-language",
      "accept",
      "referer",
    ]),
    maxWaitMs: int(env.WEBPILOT_MAX_WAIT_MS, 10_000, 0),
    searchUrl: env.WEBPILOT_SEARCH_URL?.trim() || null,
    browserUrl: env.WEBPILOT_BROWSER_URL?.trim() || null,
    browserSecret: env.WEBPILOT_BROWSER_SECRET?.trim() || null,
    sessionMaxMinutes: int(env.WEBPILOT_SESSION_MAX_MINUTES, 30),
    sessionDefaultIdleSeconds: int(env.WEBPILOT_SESSION_IDLE_SECONDS, 120),
    sessionMaxIdleSeconds: int(env.WEBPILOT_SESSION_MAX_IDLE_SECONDS, 600),
    sessionMaxOpen: int(env.WEBPILOT_SESSION_MAX_OPEN, 2),
    sessionMaxActions: int(env.WEBPILOT_SESSION_MAX_ACTIONS, 20),
    sessionMaxTextChars: int(env.WEBPILOT_SESSION_MAX_TEXT_CHARS, 5_000),
    sessionMaxViewport: {
      width: int(env.WEBPILOT_SESSION_MAX_VIEWPORT_WIDTH, 1920, 320),
      height: int(env.WEBPILOT_SESSION_MAX_VIEWPORT_HEIGHT, 1200, 240),
    },
  };
}
