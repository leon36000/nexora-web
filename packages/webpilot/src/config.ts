/**
 * Paramètres du client HTTP de sortie et de l'exploration, communs au site et au worker (mêmes variables
 * d'environnement). Valeurs par défaut provisoires, jamais des prix (voir docs/webpilot.md).
 */
export const ROBOT_TOKEN = "NexoraWebPilot";

const int = (raw: string | undefined, fallback: number, min = 1): number => {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= min ? n : fallback;
};

export interface ClientConfig {
  userAgent: string;
  allowedPorts: number[];
  maxBytes: number;
  timeoutMs: number;
  maxRedirects: number;
}

export function clientConfigFromEnv(
  env: Record<string, string | undefined>,
): ClientConfig {
  const contact = env.WEBPILOT_CONTACT?.trim();
  const ports = (env.WEBPILOT_ALLOWED_PORTS ?? "80,443,8080,8443")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((p) => Number.isInteger(p) && p > 0 && p < 65536);
  return {
    userAgent: `${ROBOT_TOKEN}/1.0${contact ? ` (+${contact})` : ""}`,
    allowedPorts: ports.length ? ports : [80, 443],
    maxBytes: int(env.WEBPILOT_MAX_BYTES, 5_000_000),
    timeoutMs: int(env.WEBPILOT_TIMEOUT_MS, 20_000),
    maxRedirects: int(env.WEBPILOT_MAX_REDIRECTS, 5, 0),
  };
}

export interface CrawlSettings {
  resultRetentionMs: number;
  /** Pages tentées par lot (un lot = un règlement). */
  batchSize: number;
  /** Pause entre deux lectures d'un même site. */
  delayMs: number;
  /** Durée d'une tranche de travail avant de rendre la main. */
  sliceMs: number;
}

export function crawlSettingsFromEnv(
  env: Record<string, string | undefined>,
): CrawlSettings {
  return {
    resultRetentionMs: int(env.WEBPILOT_RESULT_RETENTION_HOURS, 24) * 3_600_000,
    batchSize: int(env.WEBPILOT_CRAWL_BATCH_SIZE, 5),
    delayMs: int(env.WEBPILOT_CRAWL_DELAY_MS, 500, 0),
    sliceMs: int(env.WEBPILOT_CRAWL_SLICE_MS, 120_000),
  };
}
