/**
 * Requêtes de la passerelle en vol, et arrêt propre (audit F-01). Au signal d'arrêt du serveur, `drainGateway` attend la
 * fin des requêtes pendant une période de grâce, puis RÈGLE de force celles qui restent (appel amont coupé, facturation de
 * l'invite estimée et de ce qui a été livré) au lieu de laisser le conteneur être tué au milieu d'un flux, ce qui
 * laissait la réservation ouverte jusqu'à la libération du worker.
 *
 * Le registre vit sur `globalThis` : l'instrumentation de Next.js (où le signal est capté) et les routes `/v1/*` sont
 * compilées en modules distincts, mais partagent le même processus.
 */

export interface InflightEntry {
  requestId: string;
  /** Coupe l'appel amont et règle la requête (statut « aborted », code « server_shutdown »). Remplacé quand un flux démarre. */
  shutdown: () => Promise<void>;
}

const KEY = Symbol.for("nexora.gateway.inflight");
type Holder = { [KEY]?: Map<string, InflightEntry> };

function registry(): Map<string, InflightEntry> {
  const holder = globalThis as Holder;
  holder[KEY] ??= new Map();
  return holder[KEY];
}

/** Enregistre une requête en vol ; renvoie la fonction qui la retire (idempotente). */
export function trackInflight(entry: InflightEntry): () => void {
  const map = registry();
  map.set(entry.requestId, entry);
  return () => {
    if (map.get(entry.requestId) === entry) map.delete(entry.requestId);
  };
}

export function inflightCount(): number {
  return registry().size;
}

export interface DrainOutcome {
  /** Requêtes réglées de force à la fin de la grâce. */
  forced: number;
  /** Requêtes encore en vol à la sortie (0 sauf règlement impossible). */
  remaining: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Attend `graceMs` la fin naturelle des requêtes en vol, puis force le règlement de celles qui restent (au plus
 * `forceTimeoutMs` chacune). Ne refuse aucune nouvelle requête : le serveur HTTP cesse déjà d'en accepter.
 */
export async function drainGateway(options: {
  graceMs: number;
  forceTimeoutMs?: number;
  pollMs?: number;
}): Promise<DrainOutcome> {
  const map = registry();
  const poll = options.pollMs ?? 50;
  const deadline = Date.now() + options.graceMs;
  while (map.size > 0 && Date.now() < deadline) await sleep(poll);
  const left = [...map.values()];
  if (left.length === 0) return { forced: 0, remaining: 0 };
  const limit = options.forceTimeoutMs ?? 10_000;
  await Promise.allSettled(
    left.map((entry) =>
      Promise.race([entry.shutdown(), sleep(limit)]).catch(() => undefined),
    ),
  );
  return { forced: left.length, remaining: map.size };
}
