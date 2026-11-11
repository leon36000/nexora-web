import { readFileSync } from "node:fs";
import {
  ALERT_KINDS,
  checkLedgerInvariants,
  countUnreconciled,
  createDb,
  type Database,
  finishRun,
  knownCallIds,
  loadLedgerRows,
  modelProviders,
  purgeSettledIntents,
  reconcile,
  reconciliationFindings,
  saveReconciliation,
  sql,
  startRun,
  type UpstreamRecord,
  usdToNano,
} from "@nexora/db";
import type { Logger } from "@nexora/log";
import { loadKeyring } from "@nexora/vault/crypto";
import { secretHostProblem } from "@nexora/vault/scope";
import { readSecretForScope } from "@nexora/vault/store";
import type { HandlerRegistry } from "./registry.ts";

/**
 * Tâche `reconcile.daily` (audit F-06, F-09, F-17) : chaque jour à 03:00 (America/Toronto), compare le grand livre du
 * JOUR UTC PRÉCÉDENT aux sources amont (journal de dépenses de LiteLLM par identifiant d'appel, génération OpenRouter par
 * identifiant), vérifie les invariants internes et consigne les écarts dans `reconciliation_findings`. Rejouable
 * (écarts idempotents par clé, résultat d'événement écrasé), JAMAIS de correction automatique du grand livre : une
 * personne révise chaque écart. Une source illisible ne conclut rien (ni « manquant » ni écart).
 *
 * Variables (toutes facultatives ; sans elles la source correspondante est « indisponible » et le dit dans le résumé) :
 *  - LITELLM_SPEND_DATABASE_URL (ou _FILE) : base `litellm`, rôle en LECTURE SEULE sur "LiteLLM_SpendLogs" ;
 *  - RECONCILE_LITELLM_KEY_HASHES : jetons hachés (colonne api_key) de la clé maîtresse de la passerelle ; sans eux, la
 *    détection des dépenses sans ligne chez nous (`unbilled_upstream`) est désactivée (d'autres clients de LiteLLM
 *    produiraient de faux positifs) ;
 *  - NEXORA_VAULT_MASTER_KEY : la clé OpenRouter est lue dans le coffre (fournisseur de type openrouter, portée
 *    « model-provider », hôte vérifié) ; jamais journalisée.
 */

export interface LitellmSpendReader {
  /** Enregistrements de dépense pour ces identifiants d'appel. */
  byCallIds(ids: readonly string[]): Promise<UpstreamRecord[]>;
  /** Dépenses du jour de la clé de la passerelle ; null : détection désactivée (aucun filtre de clé configuré). */
  forDay: ((day: string) => Promise<UpstreamRecord[]>) | null;
}

export interface OpenRouterReader {
  /** null : génération introuvable (404 après les reprises) ; lève une erreur si l'API est en panne. */
  generation(id: string): Promise<UpstreamRecord | null>;
}

export interface ReconcileDeps {
  db: Database;
  log: Logger;
  litellm: LitellmSpendReader | null;
  openrouter: OpenRouterReader | null;
  now?: () => Date;
  /** Alerte (courriel…) : comptes seulement, jamais de contenu. */
  notify?: (subject: string, text: string) => Promise<void>;
}

const CHUNK = 500;
const INTENT_RETENTION_DAYS = 60;

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;

/** Jour UTC précédent AAAA-MM-JJ (le jour de l'amont est UTC). */
export function previousUtcDay(now: Date): string {
  return new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
}

// ─── Adaptateurs ────────────────────────────────────────────────────────────────

/** LiteLLM : lecture seule de "LiteLLM_SpendLogs" (la dépense `spend` est le calcul de LiteLLM, en USD flottant). */
export function createLitellmSpendReader(
  db: Database,
  options: { keyHashes?: readonly string[] } = {},
): LitellmSpendReader {
  type Row = {
    id: string;
    spend: string;
    prompt_tokens: number | null;
    completion_tokens: number | null;
    model: string | null;
    provider: string | null;
    day: string;
  };
  const toRecord = (r: Row): UpstreamRecord | null => {
    const cost = usdToNano(r.spend);
    if (cost === null) return null;
    return {
      id: r.id,
      source: "litellm",
      day: r.day,
      model: r.model ?? "",
      totalCostUsdNano: cost,
      nativePrompt: num(r.prompt_tokens),
      nativeCompletion: num(r.completion_tokens),
      nativeCached: null,
      nativeReasoning: null,
      cancelled: false,
      provider: r.provider || null,
    };
  };
  const columns = sql`litellm_call_id AS id, spend::text AS spend, prompt_tokens, completion_tokens,
    model_group AS model, custom_llm_provider AS provider, to_char("startTime" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day`;
  const hashes = options.keyHashes ?? [];
  return {
    async byCallIds(ids) {
      const out: UpstreamRecord[] = [];
      for (let i = 0; i < ids.length; i += CHUNK) {
        const list = sql.join(
          ids.slice(i, i + CHUNK).map((id) => sql`${id}`),
          sql`, `,
        );
        const rows = await db.execute<Row>(
          sql`SELECT ${columns} FROM "LiteLLM_SpendLogs" WHERE litellm_call_id IN (${list})`,
        );
        for (const r of rows) {
          const rec = toRecord(r);
          if (rec) out.push(rec);
        }
      }
      return out;
    },
    forDay:
      hashes.length === 0
        ? null
        : async (day) => {
            const start = `${day}T00:00:00Z`;
            const list = sql.join(
              hashes.map((h) => sql`${h}`),
              sql`, `,
            );
            const rows = await db.execute<Row>(sql`
              SELECT ${columns} FROM "LiteLLM_SpendLogs"
              WHERE "startTime" >= ${start}::timestamptz AND "startTime" < (${start}::timestamptz + interval '1 day')
                AND litellm_call_id IS NOT NULL AND api_key IN (${list})`);
            const out: UpstreamRecord[] = [];
            for (const r of rows) {
              const rec = toRecord(r);
              if (rec) out.push(rec);
            }
            return out;
          },
  };
}

/**
 * OpenRouter : `GET /api/v1/generation?id=gen-…` (coût total, jetons natifs, annulation, fournisseur ; jamais le
 * contenu). La génération apparaît avec quelques secondes de retard : quelques reprises sur 404. Format relevé dans la
 * documentation publique d'OpenRouter ; à revérifier à la première exécution réelle.
 */
export function createOpenRouterReader(options: {
  key: () => Promise<string>;
  fetch?: typeof fetch;
  retries?: number;
  retryDelayMs?: number;
}): OpenRouterReader {
  const doFetch = options.fetch ?? fetch;
  const retries = options.retries ?? 3;
  const delay = options.retryDelayMs ?? 1000;
  return {
    async generation(id) {
      const key = await options.key();
      for (let attempt = 0; attempt <= retries; attempt++) {
        const res = await doFetch(
          `https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(id)}`,
          {
            headers: { authorization: `Bearer ${key}` },
            redirect: "error",
            signal: AbortSignal.timeout(20_000),
          },
        );
        if (res.status === 404) {
          if (attempt < retries)
            await new Promise((r) => setTimeout(r, delay * 2 ** attempt));
          continue;
        }
        if (!res.ok)
          throw new Error(`openrouter generation : HTTP ${res.status}`);
        const body = (await res.json()) as { data?: Record<string, unknown> };
        const d = body.data;
        if (!d || typeof d !== "object") return null;
        const cost = usdToNano(d.total_cost);
        if (cost === null) return null;
        return {
          id,
          source: "openrouter",
          day: String(d.created_at ?? "").slice(0, 10),
          model: typeof d.model === "string" ? d.model : "",
          totalCostUsdNano: cost,
          nativePrompt: num(d.native_tokens_prompt),
          nativeCompletion: num(d.native_tokens_completion),
          nativeCached: num(d.native_tokens_cached),
          nativeReasoning: num(d.native_tokens_reasoning),
          cancelled: d.cancelled === true,
          provider:
            typeof d.provider_name === "string" ? d.provider_name : null,
        };
      }
      return null;
    },
  };
}

const readEnvOrFile = (
  env: Record<string, string | undefined>,
  name: string,
): string | null => {
  const direct = env[name]?.trim();
  if (direct) return direct;
  const file = env[`${name}_FILE`]?.trim();
  if (!file) return null;
  try {
    return readFileSync(file, "utf8").trim() || null;
  } catch {
    return null;
  }
};

/** Sources de production selon l'environnement ; chacune est `null` (indisponible) quand sa configuration manque. */
export function reconcileSourcesFromEnv(
  db: Database,
  log: Logger,
  env: Record<string, string | undefined> = process.env,
): { litellm: LitellmSpendReader | null; openrouter: OpenRouterReader | null } {
  const spendUrl = readEnvOrFile(env, "LITELLM_SPEND_DATABASE_URL");
  const hashes = (env.RECONCILE_LITELLM_KEY_HASHES ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  const litellm = spendUrl
    ? createLitellmSpendReader(createDb(spendUrl, { max: 2 }).db, {
        keyHashes: hashes,
      })
    : null;
  if (!litellm)
    log.warn(
      "réconciliation : LITELLM_SPEND_DATABASE_URL absent, journal LiteLLM indisponible",
    );
  let openrouter: OpenRouterReader | null = null;
  if (env.NEXORA_VAULT_MASTER_KEY) {
    const keyring = loadKeyring(env);
    openrouter = createOpenRouterReader({
      key: async () => {
        const problem = secretHostProblem(
          "model-provider",
          "https://openrouter.ai",
          env,
        );
        if (problem) throw new Error(`clé OpenRouter non envoyée : ${problem}`);
        const [provider] = await db
          .select({ ref: modelProviders.secretRef })
          .from(modelProviders)
          .where(
            sql`${modelProviders.type} = 'openrouter' AND ${modelProviders.enabled} AND ${modelProviders.secretRef} IS NOT NULL`,
          )
          .limit(1);
        if (!provider?.ref)
          throw new Error("aucun fournisseur OpenRouter avec clé");
        return readSecretForScope(db, keyring, provider.ref, "model-provider");
      },
    });
  } else
    log.warn(
      "réconciliation : NEXORA_VAULT_MASTER_KEY absente, OpenRouter indisponible",
    );
  return { litellm, openrouter };
}

// ─── Job ───────────────────────────────────────────────────────────────────────

export interface ReconcileSummary {
  day: string;
  runId: string;
  ledgerRows: number;
  upstreamRecords: number;
  results: number;
  findings: Record<string, number>;
  unavailable: string[];
  unbilledChecked: boolean;
  intentsPurged: number;
  alerted: boolean;
}

/** Réconcilie UN jour UTC. Rejouable ; ne modifie jamais le grand livre. */
export async function reconcileDay(
  deps: ReconcileDeps,
  day: string,
): Promise<ReconcileSummary> {
  const { db, log } = deps;
  const now = deps.now ?? (() => new Date());
  const runId = await startRun(db, day);
  try {
    const unavailable: string[] = [];
    const ledger = await loadLedgerRows(db, day);
    const invariants = await checkLedgerInvariants(db, day);

    // Journal de dépenses de LiteLLM : couvre OpenRouter ET DeepInfra par l'identifiant d'appel.
    const records: UpstreamRecord[] = [];
    let litellmOk = false;
    const callIds = [
      ...new Set(
        ledger.flatMap((l) => (l.litellmCallId ? [l.litellmCallId] : [])),
      ),
    ];
    if (deps.litellm) {
      try {
        records.push(...(await deps.litellm.byCallIds(callIds)));
        litellmOk = true;
      } catch (error) {
        unavailable.push("litellm");
        log.error("réconciliation : journal LiteLLM illisible", {
          errorName: error instanceof Error ? error.name : typeof error,
        });
      }
    } else unavailable.push("litellm");

    // OpenRouter : une requête par génération « gen-… » (4 en parallèle).
    let openrouterOk = false;
    const genIds = [
      ...new Set(
        ledger.flatMap((l) =>
          l.upstreamGenerationId?.startsWith("gen-")
            ? [l.upstreamGenerationId]
            : [],
        ),
      ),
    ];
    if (deps.openrouter) {
      openrouterOk = true;
      const queue = [...genIds];
      const worker = async () => {
        for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
          if (!openrouterOk) return;
          try {
            const rec = await deps.openrouter?.generation(id);
            if (rec) records.push(rec);
          } catch (error) {
            log.error("réconciliation : génération OpenRouter illisible", {
              errorName: error instanceof Error ? error.name : typeof error,
            });
            // Une panne de l'API : on n'insiste pas et rien n'est conclu pour OpenRouter (repris au prochain passage).
            openrouterOk = false;
          }
        }
      };
      if (genIds.length > 0)
        await Promise.all([worker(), worker(), worker(), worker()]);
      if (!openrouterOk) unavailable.push("openrouter");
    } else if (genIds.length > 0) unavailable.push("openrouter");

    // Dépenses LiteLLM du jour sans ligne chez nous (seulement avec un filtre de clé configuré).
    let unbilled: UpstreamRecord[] = [];
    const unbilledChecked = litellmOk && deps.litellm?.forDay != null;
    if (unbilledChecked && deps.litellm?.forDay) {
      const spent = await deps.litellm.forDay(day);
      const known = await knownCallIds(
        db,
        spent.map((s) => s.id),
      );
      unbilled = spent.filter((s) => !known.has(s.id));
    }

    const { findings, results } = reconcile(ledger, records, unbilled, {
      openrouter: openrouterOk,
      litellm: litellmOk,
    });
    const all = [...invariants, ...findings];
    await saveReconciliation(db, runId, results, all);

    const byKind: Record<string, number> = {};
    for (const f of all) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
    // Écarts d'alerte : ceux de ce passage, plus les requêtes perdues consignées par la reprise depuis hier.
    const since = new Date(now().getTime() - 36 * 3_600_000);
    const [recentLost] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(reconciliationFindings)
      .where(
        sql`${reconciliationFindings.kind} = 'lost_reservation' AND ${reconciliationFindings.status} = 'open' AND ${reconciliationFindings.foundAt} >= ${since.toISOString()}::timestamptz`,
      );
    const alertCount =
      all.filter((f) => ALERT_KINDS.includes(f.kind)).length +
      (recentLost?.n ?? 0);
    const intentsPurged = await purgeSettledIntents(
      db,
      new Date(now().getTime() - INTENT_RETENTION_DAYS * 86_400_000),
    );
    const alerted = alertCount > 0;
    const summary: ReconcileSummary = {
      day,
      runId,
      ledgerRows: ledger.length,
      upstreamRecords: records.length,
      results: results.length,
      findings: byKind,
      unavailable,
      unbilledChecked,
      intentsPurged,
      alerted,
    };
    await finishRun(db, runId, alerted ? "alert" : "ok", { ...summary });
    const level = alerted ? "warn" : "info";
    log[level]("réconciliation : terminée", { ...summary });
    if (alerted && deps.notify)
      await deps
        .notify(
          `Nexora : écarts de facturation à réviser (${day})`,
          `La réconciliation du ${day} (UTC) a consigné ${alertCount} écart(s) à examiner : ${JSON.stringify(byKind)}. ` +
            `Sources indisponibles : ${unavailable.join(", ") || "aucune"}. Page d'administration : /compte/ecarts-facturation.`,
        )
        .catch((error) =>
          log.error("réconciliation : alerte non envoyée", {
            errorName: error instanceof Error ? error.name : typeof error,
          }),
        );
    return summary;
  } catch (error) {
    await finishRun(db, runId, "failed", {
      day,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    throw error;
  }
}

export function registerReconcileHandlers(
  registry: HandlerRegistry,
  deps: ReconcileDeps,
): HandlerRegistry {
  registry.register("reconcile.daily", async (job) => {
    const now = deps.now ?? (() => new Date());
    // Jour explicite (rejeu manuel) : celui-là seulement. Sinon le jour UTC précédent, plus les deux jours d'avant
    // s'il leur reste des événements sans résultat (source indisponible lors d'un passage précédent) : la reprise.
    if (typeof job.payload.day === "string") {
      await reconcileDay(deps, job.payload.day);
      return;
    }
    const last = previousUtcDay(now());
    const lastMs = new Date(`${last}T00:00:00Z`).getTime();
    for (const back of [2, 1]) {
      const day = new Date(lastMs - back * 86_400_000)
        .toISOString()
        .slice(0, 10);
      if ((await countUnreconciled(deps.db, day)) > 0)
        await reconcileDay(deps, day);
    }
    await reconcileDay(deps, last);
  });
  return registry;
}
