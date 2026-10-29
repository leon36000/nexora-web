import "server-only";
import { randomUUID } from "node:crypto";
import {
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
import {
  type PrivacyRouter,
  PrivacyRouterUnavailableError,
} from "../privacy/types";
import { ROBOT_TOKEN, webpilotConfig } from "./config";
import type { WebpilotDeps } from "./types";

/**
 * Nexora Privacy Router n'est pas encore branché sur WebPilot : tant qu'il ne l'est pas, TOUTE sortie est refusée
 * (échec fermé, 503 `privacy_router_unavailable`). Le branchement remplace cette constante par l'implémentation de
 * `PrivacyRouter` (web/src/server/privacy) ; rien d'autre ne change.
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
  const internal = (raw: string | null) => {
    if (!raw) return null;
    try {
      const url = new URL(raw);
      return createSafeHttpClient({
        ...base,
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
  const rendererClient = internal(config.rendererUrl);
  return {
    reader: {
      client,
      robots: createRobotsChecker({ client, userAgentToken: ROBOT_TOKEN }),
      renderer:
        rendererClient && config.rendererUrl
          ? createHttpRenderer(rendererClient, config.rendererUrl)
          : null,
    },
    searchClient: internal(config.searchUrl),
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
    privacy: failClosedPrivacy,
    log,
    now: () => new Date(),
    requestId: () => `req_${randomUUID().replaceAll("-", "")}`,
    config,
    reader: runtime.value.reader,
    searchClient: runtime.value.searchClient,
    chat: (request) => handleChatCompletions(request, gatewayDeps()),
  };
}
