import { readFileSync } from "node:fs";
import type { AddressPolicy } from "./address.ts";

/**
 * Paramètres du service, lus dans l'environnement (jamais des prix). Valeurs de départ prudentes et provisoires.
 * Le secret partagé vient de `WEBPILOT_BROWSER_SECRET` ou du fichier `WEBPILOT_BROWSER_SECRET_FILE` (secret Docker).
 * La boucle locale n'est JAMAIS permise par l'environnement : seule une construction programmatique (essais) le peut.
 */
export interface ServiceConfig {
  host: string;
  port: number;
  secret: string;
  policy: AddressPolicy;
  maxSessions: number;
  maxSeconds: number;
  maxIdleSeconds: number;
  renderConcurrency: number;
  viewport: { width: number; height: number };
  locale: string;
  timezone: string;
  actionTimeoutMs: number;
  navTimeoutMs: number;
  batchTimeoutMs: number;
  maxActions: number;
  maxTextChars: number;
  maxWaitMs: number;
  maxHtmlBytes: number;
  maxScreenshotBytes: number;
  maxBodyBytes: number;
  /** Chromium lance son bac à sable (nécessite des espaces de noms utilisateur dans le conteneur). */
  chromiumSandbox: boolean;
  executablePath: string | null;
  contact: string | null;
}

const int = (raw: string | undefined, fallback: number, min = 1): number => {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= min ? n : fallback;
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function configFromEnv(
  env: Record<string, string | undefined> = process.env,
): ServiceConfig {
  let secret = env.WEBPILOT_BROWSER_SECRET?.trim() ?? "";
  const file = env.WEBPILOT_BROWSER_SECRET_FILE?.trim();
  if (!secret && file) {
    try {
      secret = readFileSync(file, "utf8").trim();
    } catch {
      throw new ConfigError("secret partagé illisible");
    }
  }
  if (secret.length < 32)
    throw new ConfigError(
      "WEBPILOT_BROWSER_SECRET (ou _FILE) requis : au moins 32 caractères",
    );
  const ports = (env.BROWSER_ALLOWED_PORTS ?? "80,443,8080,8443")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((p) => Number.isInteger(p) && p > 0 && p < 65536);
  return {
    host: env.HOST?.trim() || "0.0.0.0",
    port: int(env.PORT, 8700),
    secret,
    policy: {
      allowedPorts: ports.length ? ports : [80, 443],
      allowLoopback: false,
    },
    maxSessions: int(env.BROWSER_MAX_SESSIONS, 4),
    maxSeconds: int(env.BROWSER_MAX_SECONDS, 3600),
    maxIdleSeconds: int(env.BROWSER_MAX_IDLE_SECONDS, 600),
    renderConcurrency: int(env.BROWSER_RENDER_CONCURRENCY, 2),
    viewport: {
      width: int(env.BROWSER_VIEWPORT_WIDTH, 1280, 320),
      height: int(env.BROWSER_VIEWPORT_HEIGHT, 800, 240),
    },
    locale: env.BROWSER_LOCALE?.trim() || "fr-CA",
    timezone: env.BROWSER_TIMEZONE?.trim() || "America/Toronto",
    actionTimeoutMs: int(env.BROWSER_ACTION_TIMEOUT_MS, 15_000),
    navTimeoutMs: int(env.BROWSER_NAV_TIMEOUT_MS, 30_000),
    batchTimeoutMs: int(env.BROWSER_BATCH_TIMEOUT_MS, 90_000),
    maxActions: int(env.BROWSER_MAX_ACTIONS, 20),
    maxTextChars: int(env.BROWSER_MAX_TEXT_CHARS, 5_000),
    maxWaitMs: int(env.BROWSER_MAX_WAIT_MS, 10_000, 0),
    maxHtmlBytes: int(env.BROWSER_MAX_HTML_BYTES, 5_000_000),
    maxScreenshotBytes: int(env.BROWSER_MAX_SCREENSHOT_BYTES, 4_000_000),
    maxBodyBytes: int(env.BROWSER_MAX_BODY_BYTES, 200_000),
    chromiumSandbox: env.BROWSER_CHROMIUM_SANDBOX === "1",
    executablePath: env.BROWSER_EXECUTABLE_PATH?.trim() || null,
    contact: env.WEBPILOT_CONTACT?.trim() || null,
  };
}
