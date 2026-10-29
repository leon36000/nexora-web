import { chromium } from "playwright-core";
import { createBrowserRuntime } from "./browser.ts";
import { ConfigError, configFromEnv } from "./config.ts";
import { createEgressProxy } from "./proxy.ts";
import { createServer } from "./server.ts";
import { SessionManager } from "./sessions.ts";

/**
 * Point d'entrée du service de navigateur de Nexora WebPilot. Ne démarre pas sans secret partagé. Journal : une ligne
 * par événement de cycle de vie, jamais d'adresse complète, de texte saisi, de contenu de page ni de secret.
 */
function log(event: string, data: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({ time: new Date().toISOString(), event, ...data }),
  );
}

async function main() {
  const config = configFromEnv();
  const proxy = createEgressProxy({
    policy: config.policy,
    // Refus journalisés par hôte seulement (jamais l'adresse résolue ni le chemin).
    onBlocked: (host, reason) =>
      log("sortie_refusee", { host: host.slice(0, 100), reason }),
  });
  const { port: proxyPort } = await proxy.listen();
  const runtime = createBrowserRuntime({ config, chromium, proxyPort, proxy });
  const manager = new SessionManager({
    driver: runtime.driver,
    now: () => Date.now(),
    maxSessions: config.maxSessions,
    maxSeconds: config.maxSeconds,
    maxIdleSeconds: config.maxIdleSeconds,
    tombstoneMs: 10 * 60_000,
  });
  const server = createServer({ config, manager, render: runtime.render });
  server.requestTimeout = 120_000;
  server.listen(config.port, config.host, () =>
    log("demarrage", { port: config.port, maxSessions: config.maxSessions }),
  );
  const timer = setInterval(() => {
    manager.sweep().catch(() => log("balayage_en_echec"));
  }, 1000);
  timer.unref();

  let stopping = false;
  const stop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    log("arret", { signal });
    clearInterval(timer);
    server.close();
    manager
      .closeAll()
      .then(() => runtime.close())
      .finally(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));
}

main().catch((error: unknown) => {
  log("demarrage_impossible", {
    reason: error instanceof ConfigError ? error.message : "erreur interne",
  });
  process.exit(1);
});
