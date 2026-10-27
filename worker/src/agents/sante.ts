import type { Database } from "@nexora/db";
import { and, eq, modelProviders, models, siteAgents } from "@nexora/db";
import type { AgentImpl } from "./context.ts";

/**
 * Santé des modèles : AUCUN appel de modèle. Trois sondes légères et gratuites :
 *  - la passerelle publie-t-elle (`GET /v1/models`, sans clé) les modèles « publiés » du catalogue ?
 *  - l'état du fournisseur de chaque modèle (dernier contrôle enregistré par le module « Modèles ») ;
 *  - la vivacité de LiteLLM (`/health/liveliness`, sans authentification) quand son adresse est connue.
 * Un ping de modèle (1 jeton) n'est PAS fait : il exigerait une clé de passerelle pour cet agent ; l'état le dit.
 */
export interface HealthDeps {
  db: Database;
  gatewayBaseUrl: string;
  litellmBaseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface HealthRow {
  target: string;
  status: "ok" | "error" | "missing" | "unknown";
  detail: string;
  latencyMs?: number;
}

async function timed(
  doFetch: typeof fetch,
  url: string,
): Promise<{ ok: boolean; status: number; ms: number; json: unknown }> {
  const t0 = Date.now();
  try {
    const res = await doFetch(url, { signal: AbortSignal.timeout(8_000) });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      /* non JSON */
    }
    return { ok: res.ok, status: res.status, ms: Date.now() - t0, json };
  } catch {
    return { ok: false, status: 0, ms: Date.now() - t0, json: null };
  }
}

export async function probeHealth(deps: HealthDeps): Promise<HealthRow[]> {
  const doFetch = deps.fetchImpl ?? fetch;
  const rows: HealthRow[] = [];

  const listed = await timed(
    doFetch,
    `${deps.gatewayBaseUrl.replace(/\/+$/, "")}/v1/models`,
  );
  const listedIds = new Set(
    ((listed.json as { data?: { id?: string }[] } | null)?.data ?? []).flatMap(
      (m) => (m.id ? [m.id] : []),
    ),
  );
  rows.push({
    target: "passerelle /v1/models",
    status: listed.ok ? "ok" : "error",
    detail: listed.ok
      ? `${listedIds.size} modèle(s) listé(s)`
      : `réponse ${listed.status || "aucune"}`,
    latencyMs: listed.ms,
  });

  const published = await deps.db
    .select({
      publicId: models.publicId,
      providerName: modelProviders.name,
      health: modelProviders.healthState,
    })
    .from(models)
    .innerJoin(modelProviders, eq(modelProviders.id, models.providerId))
    .where(and(eq(models.status, "published")));
  for (const m of published) {
    if (listed.ok && !listedIds.has(m.publicId)) {
      rows.push({
        target: m.publicId,
        status: "missing",
        detail: "publié au catalogue mais absent de /v1/models",
      });
    } else if (m.health === "error") {
      rows.push({
        target: m.publicId,
        status: "error",
        detail: `fournisseur « ${m.providerName} » en erreur à son dernier contrôle`,
      });
    } else {
      rows.push({
        target: m.publicId,
        status: m.health === "ok" ? "ok" : "unknown",
        detail:
          m.health === "ok"
            ? `listé ; fournisseur « ${m.providerName} » sain au dernier contrôle`
            : `listé ; fournisseur « ${m.providerName} » jamais contrôlé`,
      });
    }
  }

  if (!deps.litellmBaseUrl) {
    rows.push({
      target: "LiteLLM (réseau interne)",
      status: "missing",
      detail: "LITELLM_BASE_URL n'est pas défini pour le worker : sonde non faite",
    });
  } else {
    const live = await timed(
      doFetch,
      `${deps.litellmBaseUrl.replace(/\/+$/, "")}/health/liveliness`,
    );
    rows.push({
      target: "LiteLLM (réseau interne)",
      status: live.ok ? "ok" : "error",
      detail: live.ok ? "répond" : `réponse ${live.status || "aucune"}`,
      latencyMs: live.ms,
    });
  }
  return rows;
}

export function createSanteAgent(
  deps: Omit<HealthDeps, "db"> & { db: Database },
): AgentImpl {
  return async (ctx) => {
    const rows = await probeHealth(deps);
    ctx.output.health = rows;
    const bad = rows.filter(
      (r) => r.status === "error" || r.status === "missing",
    );
    ctx.event(
      bad.length ? "warn" : "info",
      `${rows.length} sonde(s) : ${rows.length - bad.length} sans problème, ${bad.length} à examiner`,
    );
    if (bad.length)
      await deps.db
        .update(siteAgents)
        .set({
          lastError: `${bad.length} cible(s) en défaut : ${bad
            .map((b) => b.target)
            .join(", ")
            .slice(0, 300)}`,
        })
        .where(eq(siteAgents.key, "sante"));
  };
}
