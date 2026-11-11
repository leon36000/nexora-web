import { createLogger } from "@nexora/log";
import { drainGateway, inflightCount } from "./inflight";

/**
 * Branche l'arrêt propre de la passerelle sur SIGTERM et SIGINT (appelée par `instrumentation.ts`). Next.js ferme
 * lui-même le serveur HTTP et attend la fin des connexions ; ce gestionnaire s'ajoute au sien : après la période de
 * grâce (`GATEWAY_DRAIN_GRACE_MS`, 20 s par défaut, à garder sous le `stop_grace_period` du conteneur), les requêtes
 * encore en vol sont réglées de force, ce qui libère aussi leurs connexions et permet à Next.js de sortir.
 */
const DEFAULT_GRACE_MS = 20_000;

export function drainGraceMs(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = Number(env.GATEWAY_DRAIN_GRACE_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_GRACE_MS;
}

let installed = false;

export function installGatewayDrain(): void {
  if (installed) return;
  installed = true;
  const log = createLogger({ name: "web" });
  const onSignal = (signal: string) => {
    const inFlight = inflightCount();
    if (inFlight === 0) return;
    log.warn("passerelle : arrêt demandé, requêtes en vol", {
      signal,
      inFlight,
    });
    void drainGateway({ graceMs: drainGraceMs() })
      .then((out) =>
        log.warn("passerelle : arrêt propre terminé", {
          signal,
          forced: out.forced,
          remaining: out.remaining,
        }),
      )
      .catch((error) =>
        log.error("passerelle : arrêt propre impossible", {
          errorName: error instanceof Error ? error.name : typeof error,
        }),
      );
  };
  process.once("SIGTERM", () => onSignal("SIGTERM"));
  process.once("SIGINT", () => onSignal("SIGINT"));
}
