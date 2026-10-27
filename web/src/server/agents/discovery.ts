import type { DiscoveredAgent } from "./catalog";

/**
 * Lecture de `GET /v1/models` d'une instance WorkStudio avec sa clé d'espace (coffre) : les agents publiés visibles
 * par la clé ont un identifiant `agent:<nom ou identifiant du workflow>`. Les résumés d'échec sont courts et ne
 * contiennent ni corps de réponse ni secret.
 */

export interface InstanceToReach {
  baseUrl: string;
  secretRef: string | null;
}

export interface DiscoveryDeps {
  getSecret: (ref: string) => Promise<string>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export type DiscoveryOutcome =
  | { ok: true; agents: DiscoveredAgent[]; detail: string }
  | { ok: false; detail: string };

const MAX_AGENTS = 500;
const MAX_TEXT = 2000;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export async function discoverAgents(
  instance: InstanceToReach,
  deps: DiscoveryDeps,
): Promise<DiscoveryOutcome> {
  if (!instance.secretRef)
    return { ok: false, detail: "aucune clé associée à l'instance (coffre)" };
  let key: string;
  try {
    key = await deps.getSecret(instance.secretRef);
  } catch {
    return {
      ok: false,
      detail: "clé introuvable ou révoquée dans le coffre",
    };
  }
  const started = performance.now();
  let res: Response;
  try {
    res = await (deps.fetch ?? fetch)(
      `${instance.baseUrl.replace(/\/+$/, "")}/v1/models`,
      {
        headers: { authorization: `Bearer ${key}`, accept: "application/json" },
        signal: AbortSignal.timeout(deps.timeoutMs ?? 15_000),
      },
    );
  } catch {
    return {
      ok: false,
      detail: "instance injoignable (réseau ou délai dépassé)",
    };
  }
  const ms = Math.round(performance.now() - started);
  if (res.status === 401 || res.status === 403)
    return {
      ok: false,
      detail: `clé refusée par l'instance (HTTP ${res.status}) : vérifiez la clé d'espace et l'option « Agents publiés »`,
    };
  if (!res.ok) return { ok: false, detail: `HTTP ${res.status} en ${ms} ms` };
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return {
      ok: false,
      detail: "réponse de l'instance illisible (JSON attendu)",
    };
  }
  const list = isObject(json) && Array.isArray(json.data) ? json.data : null;
  if (!list) return { ok: false, detail: "réponse de l'instance inattendue" };
  const agents: DiscoveredAgent[] = [];
  for (const item of list) {
    if (!isObject(item) || typeof item.id !== "string") continue;
    if (!/^agent:\S/.test(item.id)) continue;
    agents.push({
      upstreamId: item.id.slice(0, 200),
      name: (typeof item.name === "string" && item.name.trim()
        ? item.name.trim()
        : item.id.slice("agent:".length)
      ).slice(0, 120),
      description:
        typeof item.description === "string"
          ? item.description.slice(0, MAX_TEXT)
          : "",
    });
    if (agents.length >= MAX_AGENTS) break;
  }
  return {
    ok: true,
    agents,
    detail: `HTTP ${res.status} en ${ms} ms, ${agents.length} agent(s) publié(s) visible(s) par la clé`,
  };
}

/** « Tester la connexion » : même appel, résumé seulement. */
export async function checkInstance(
  instance: InstanceToReach,
  deps: DiscoveryDeps,
): Promise<{ ok: boolean; detail: string }> {
  const outcome = await discoverAgents(instance, deps);
  return { ok: outcome.ok, detail: outcome.detail };
}
