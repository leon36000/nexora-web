import "server-only";
import { randomUUID } from "node:crypto";
import {
  type BrowserService,
  createBrowserService,
  createHttpRenderer,
  createRobotsChecker,
  createSafeHttpClient,
  type ReaderDeps,
  type SafeHttpClient,
} from "@nexora/webpilot";
import { getDb } from "../db";
import { gatewayDeps } from "../gateway/deps";
import { handleChatCompletions } from "../gateway/proxy";
import { log } from "../log";
import { getPrivacyRouter } from "../privacy";
import {
  type PrivacyRouter,
  PrivacyRouterUnavailableError,
} from "../privacy/types";
import { ROBOT_TOKEN, webpilotConfig } from "./config";
import type { WebpilotDeps } from "./types";

/**
 * Porte qui refuse toute sortie (échec fermé, 503 `privacy_router_unavailable`) : réservée aux essais de l'échec
 * fermé. WebPilot utilise le vrai Privacy Router du site (`getPrivacyRouter()`).
 */
export const failClosedPrivacy: PrivacyRouter = {
  evaluate: async () => {
    throw new PrivacyRouterUnavailableError(
      "Nexora Privacy Router n'est pas branché sur WebPilot",
    );
  },
};

interface Runtime {
  reader: ReaderDeps;
  searchClient: SafeHttpClient | null;
  browser: BrowserService | null;
}
let runtime: { key: string; value: Runtime } | null = null;

function buildRuntime(config: ReturnType<typeof webpilotConfig>): Runtime {
  const base = {
    userAgent: config.userAgent,
    allowedPorts: config.allowedPorts,
    maxBytes: config.maxBytes,
    timeoutMs: config.timeoutMs,
    maxRedirects: config.maxRedirects,
  };
  const client = createSafeHttpClient(base);
  // Services internes nommés par l'opérateur : seuls leurs hôtes sont approuvés, avec leur port.
  const internal = (
    raw: string | null,
    over: { timeoutMs?: number; maxBytes?: number } = {},
  ) => {
    if (!raw) return null;
    try {
      const url = new URL(raw);
      return createSafeHttpClient({
        ...base,
        ...over,
        allowedPorts: [
          Number(url.port) || (url.protocol === "https:" ? 443 : 80),
        ],
        maxRedirects: 0,
        trustedHosts: [url.hostname],
      });
    } catch {
      return null;
    }
  };
  // Le service de navigateur reçoit le secret de service à service : seul son hôte nommé est approuvé.
  const browserClient =
    config.browserUrl && config.browserSecret
      ? // Un lot d'actions peut durer plus d'une minute et rendre du HTML et une capture : plafonds propres au service.
        internal(config.browserUrl, {
          timeoutMs: 150_000,
          maxBytes: 12_000_000,
        })
      : null;
  const browserReady =
    browserClient && config.browserUrl && config.browserSecret;
  return {
    reader: {
      client,
      robots: createRobotsChecker({ client, userAgentToken: ROBOT_TOKEN }),
      renderer: browserReady
        ? createHttpRenderer(
            browserClient,
            config.browserUrl as string,
            config.browserSecret as string,
          )
        : null,
    },
    searchClient: internal(config.searchUrl),
    browser: browserReady
      ? createBrowserService(
          browserClient,
          config.browserUrl as string,
          config.browserSecret as string,
        )
      : null,
  };
}

/** Dépendances de production de `/v1/webpilot/*` : paramètres lus dans l'environnement, clients mis en cache. */
export function webpilotDeps(): WebpilotDeps {
  const config = webpilotConfig();
  const key = JSON.stringify(config);
  if (!runtime || runtime.key !== key)
    runtime = { key, value: buildRuntime(config) };
  return {
    db: getDb,
    privacy: getPrivacyRouter(),
    log,
    now: () => new Date(),
    requestId: () => `req_${randomUUID().replaceAll("-", "")}`,
    config,
    reader: runtime.value.reader,
    searchClient: runtime.value.searchClient,
    browser: runtime.value.browser,
    chat: (request) => handleChatCompletions(request, gatewayDeps()),
  };
}
