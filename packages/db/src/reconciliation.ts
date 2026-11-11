import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { Database } from "./client.ts";
import { type FindingInput, recordFinding } from "./intents.ts";
import type { UsageSource } from "./schema-gateway.ts";
import { usageEvents } from "./schema-gateway.ts";
import {
  type FindingKind,
  type ReconcileStatus,
  reconciliationFindings,
  reconciliationRuns,
  type UpstreamSource,
  usageIntents,
  usageReconciliations,
} from "./schema-reconciliation.ts";

/**
 * Réconciliation quotidienne du grand livre avec les sources amont (audit F-06, F-09, F-17).
 *
 * Principe : le grand livre (`credit_entries`) et `usage_events` restent la seule vérité de facturation du client ; la
 * réconciliation est un CONTRÔLE INDÉPENDANT qui compare ce que Nexora a facturé à ce que l'amont dit avoir produit, et
 * consigne les écarts (`reconciliation_findings`). Elle ne modifie JAMAIS le grand livre : toute correction est une
 * décision humaine (écriture de crédit explicite). La logique de comparaison est pure (testable avec des fixtures) ; les
 * lecteurs des sources amont sont injectés par le worker.
 *
 * Seuils : écart agrégé (source, jour, modèle) au-delà de 0,5 % OU de 1 USD ; écart unitaire de coût au-delà de
 * max(0,5 %, 2 000 nano-USD) pour ne pas alerter sur l'arrondi.
 */

export interface LedgerRow {
  eventId: string;
  requestId: string;
  organizationId: string;
  model: string;
  /** Jour UTC AAAA-MM-JJ (le jour de l'amont est UTC). */
  day: string;
  status: "ok" | "aborted" | "error";
  billed: boolean;
  upstreamGenerationId: string | null;
  litellmCallId: string | null;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  usageSource: UsageSource | null;
  /** Coût facturé au client, micro-CAD. */
  billedMicroCad: bigint;
  /** Coût rapporté dans la réponse (`usage.cost` / `estimated_cost`), nano-USD. */
  reportedUsdNano: bigint | null;
  /** Coût rapporté par LiteLLM (`x-litellm-response-cost`), nano-USD. */
  litellmResponseCostNano: bigint | null;
  /** Coût amont calculé avec NOS prix de route, nano-USD. */
  computedUsdNano: bigint | null;
  fxUsdToCadMicro: bigint | null;
  provider: string | null;
}

export interface UpstreamRecord {
  /** `gen-…` (OpenRouter) ou identifiant d'appel LiteLLM. */
  id: string;
  source: UpstreamSource;
  day: string;
  model: string;
  totalCostUsdNano: bigint;
  nativePrompt: number | null;
  nativeCompletion: number | null;
  nativeCached: number | null;
  nativeReasoning: number | null;
  cancelled: boolean;
  provider: string | null;
}

export interface EventResult {
  eventId: string;
  requestId: string;
  status: ReconcileStatus;
  source: UpstreamSource | null;
  upstreamCostUsdNano: bigint | null;
  nativePrompt: number | null;
  nativeCompletion: number | null;
  nativeCached: number | null;
  nativeReasoning: number | null;
  cancelled: boolean;
  provider: string | null;
}

export interface ReconcileOptions {
  /** Écart relatif de coût toléré (0,005). */
  relativeTolerance?: number;
  /** Écart agrégé absolu toléré, nano-USD (1 USD). */
  absoluteToleranceUsdNano?: bigint;
  /** Sous ce seuil, un écart de coût unitaire est du bruit d'arrondi (2 000 nano-USD). */
  unitFloorNano?: bigint;
  /** Sous ce seuil, un écart relatif AGRÉGÉ est du bruit (100 000 nano-USD = 0,0001 USD). */
  aggregateFloorNano?: bigint;
}

export interface Availability {
  openrouter: boolean;
  litellm: boolean;
}

const abs = (n: bigint) => (n < 0n ? -n : n);
const pct = (num: bigint, den: bigint) =>
  den === 0n ? 0 : Number((num * 1_000_000n) / den) / 10_000;

/** Tolérance relative sur les jetons selon la provenance (estimés : 25 % ; OpenRouter : 5 % ; LiteLLM : exacts). */
function tokenTolerance(
  usageSource: UsageSource | null,
  source: UpstreamSource,
): number {
  if (usageSource && usageSource !== "provider" && usageSource !== "none")
    return 0.25;
  return source === "openrouter" ? 0.05 : 0;
}

const outside = (billed: number, native: number, tolerance: number) =>
  tolerance === 0
    ? billed !== native
    : Math.abs(billed - native) > Math.max(2, native * tolerance);

const isOpenRouterId = (id: string | null) => id?.startsWith("gen-") === true;

/**
 * Compare les lignes du grand livre d'un jour aux enregistrements amont. `unbilled` : dépenses amont du jour sans ligne
 * chez nous (déjà filtrées par l'appelant). `availability` : une source qui n'a pas pu être lue ne conclut RIEN (ni
 * « manquant », ni écart) : l'événement n'est pas marqué et sera repris au prochain passage.
 */
export function reconcile(
  ledger: readonly LedgerRow[],
  upstream: readonly UpstreamRecord[],
  unbilled: readonly UpstreamRecord[],
  availability: Availability,
  options: ReconcileOptions = {},
): { findings: FindingInput[]; results: EventResult[] } {
  const rel = options.relativeTolerance ?? 0.005;
  const absTol = options.absoluteToleranceUsdNano ?? 1_000_000_000n;
  const floor = options.unitFloorNano ?? 2_000n;
  const aggFloor = options.aggregateFloorNano ?? 100_000n;
  const findings: FindingInput[] = [];
  const results: EventResult[] = [];
  const byId = new Map<string, UpstreamRecord>();
  for (const u of upstream) byId.set(`${u.source}:${u.id}`, u);

  const agg = new Map<string, { expected: bigint; actual: bigint }>();

  for (const l of ledger) {
    if (l.status === "error") continue;
    const base = {
      organizationId: l.organizationId,
      requestId: l.requestId,
      model: l.model,
      day: l.day,
      litellmCallId: l.litellmCallId,
      generationId: l.upstreamGenerationId,
    };
    const matches: UpstreamRecord[] = [];
    const orRecord =
      isOpenRouterId(l.upstreamGenerationId) && l.upstreamGenerationId
        ? byId.get(`openrouter:${l.upstreamGenerationId}`)
        : undefined;
    const llRecord = l.litellmCallId
      ? byId.get(`litellm:${l.litellmCallId}`)
      : undefined;
    if (orRecord) matches.push(orRecord);
    if (llRecord) matches.push(llRecord);
    const applicable = [
      ...(isOpenRouterId(l.upstreamGenerationId) && availability.openrouter
        ? ["openrouter"]
        : []),
      ...(l.litellmCallId && availability.litellm ? ["litellm"] : []),
    ];

    if (matches.length === 0) {
      if (applicable.length === 0) continue; // aucune source lisible : rien n'est conclu
      results.push({
        eventId: l.eventId,
        requestId: l.requestId,
        status: "missing_upstream",
        source: null,
        upstreamCostUsdNano: null,
        nativePrompt: null,
        nativeCompletion: null,
        nativeCached: null,
        nativeReasoning: null,
        cancelled: false,
        provider: null,
      });
      findings.push({
        ...base,
        dedupeKey: `billed_no_upstream:${l.requestId}`,
        kind: "billed_no_upstream",
        detail: {
          billedMicroCad: l.billedMicroCad.toString(),
          usageSource: l.usageSource,
          sources: applicable,
          note: "facturé au client, aucun enregistrement chez l'amont : surfacturation possible (annulation avant l'envoi ?)",
        },
      });
      continue;
    }

    let mismatch = false;
    for (const u of matches) {
      // 1) Jetons : les natifs de l'amont font foi, pas notre estimation.
      if (u.nativePrompt !== null && u.nativeCompletion !== null) {
        const tol = tokenTolerance(l.usageSource, u.source);
        if (
          outside(l.promptTokens, u.nativePrompt, tol) ||
          outside(l.completionTokens, u.nativeCompletion, tol)
        ) {
          mismatch = true;
          findings.push({
            ...base,
            dedupeKey: `token_mismatch:${l.requestId}:${u.source}`,
            kind: "token_mismatch",
            provider: u.provider,
            detail: {
              billed: [l.promptTokens, l.completionTokens],
              native: [u.nativePrompt, u.nativeCompletion],
              source: u.source,
              usageSource: l.usageSource,
              // Complément de sortie à facturer en cas d'estimation (correction manuelle, jamais automatique).
              complementCompletionTokens: Math.max(
                0,
                u.nativeCompletion - l.completionTokens,
              ),
              cancelled: u.cancelled,
            },
          });
        }
      }
      // 2) Coût rapporté (réponse ou en-tête LiteLLM) contre l'enregistrement amont.
      const reported =
        u.source === "openrouter"
          ? l.reportedUsdNano
          : l.litellmResponseCostNano;
      if (reported !== null) {
        const d = reported - u.totalCostUsdNano;
        if (abs(d) > floor && pct(abs(d), u.totalCostUsdNano) / 100 > rel) {
          mismatch = true;
          findings.push({
            ...base,
            dedupeKey: `cost_mismatch:${l.requestId}:${u.source}`,
            kind: "cost_mismatch",
            provider: u.provider,
            expectedUsdNano: u.totalCostUsdNano,
            actualUsdNano: reported,
            deltaUsdNano: d,
            deltaPct: pct(d, u.totalCostUsdNano),
          });
        }
      }
      // 3) Marge : ce qu'on a facturé (CAD) couvre-t-il l'amont réel converti au change figé de l'événement ?
      if (l.billed && l.fxUsdToCadMicro !== null) {
        const upstreamCadMicro =
          (u.totalCostUsdNano * l.fxUsdToCadMicro) / 1_000_000_000n;
        if (l.billedMicroCad < upstreamCadMicro) {
          mismatch = true;
          findings.push({
            ...base,
            dedupeKey: `negative_margin:${l.requestId}:${u.source}`,
            kind: "negative_margin",
            provider: u.provider,
            expectedUsdNano: u.totalCostUsdNano,
            detail: {
              billedMicroCad: l.billedMicroCad.toString(),
              upstreamMicroCad: upstreamCadMicro.toString(),
              fxUsdToCadMicro: l.fxUsdToCadMicro.toString(),
            },
          });
        }
      }
      // 4) Agrégat (source, jour, modèle) : notre coût amont calculé contre ce que l'amont dit avoir facturé.
      if (l.computedUsdNano !== null) {
        const k = `${u.source}|${l.day}|${l.model}`;
        const a = agg.get(k) ?? { expected: 0n, actual: 0n };
        a.expected += l.computedUsdNano;
        a.actual += u.totalCostUsdNano;
        agg.set(k, a);
      }
    }
    const primary = orRecord ?? llRecord;
    if (primary)
      results.push({
        eventId: l.eventId,
        requestId: l.requestId,
        status: mismatch ? "mismatch" : "ok",
        source: primary.source,
        upstreamCostUsdNano: primary.totalCostUsdNano,
        nativePrompt: primary.nativePrompt,
        nativeCompletion: primary.nativeCompletion,
        nativeCached: primary.nativeCached,
        nativeReasoning: primary.nativeReasoning,
        cancelled: primary.cancelled,
        provider: primary.provider,
      });
  }

  for (const u of unbilled)
    findings.push({
      dedupeKey: `unbilled_upstream:${u.id}`,
      kind: "unbilled_upstream",
      litellmCallId: u.source === "litellm" ? u.id : null,
      generationId: u.source === "openrouter" ? u.id : null,
      provider: u.provider,
      model: u.model,
      day: u.day,
      actualUsdNano: u.totalCostUsdNano,
      detail: {
        source: u.source,
        cancelled: u.cancelled,
        note: "dépense amont sans aucune ligne chez nous : arrêt du serveur, base indisponible ou retry LiteLLM",
      },
    });

  for (const [k, a] of agg) {
    const d = a.expected - a.actual;
    const over =
      abs(d) > absTol ||
      (abs(d) > aggFloor && a.actual > 0n && pct(abs(d), a.actual) / 100 > rel);
    if (!over) continue;
    const [source, day, model] = k.split("|") as [string, string, string];
    findings.push({
      dedupeKey: `aggregate_drift:${source}:${day}:${model}`,
      kind: "aggregate_drift",
      provider: source,
      model,
      day,
      expectedUsdNano: a.expected,
      actualUsdNano: a.actual,
      deltaUsdNano: d,
      deltaPct: pct(d, a.actual),
      detail: {
        note: "somme de nos coûts amont calculés ≠ somme de l'enregistrement de l'amont (table de prix périmée ?)",
      },
    });
  }
  return { findings, results };
}

/** Types d'écart qui déclenchent l'alerte (les autres restent consultables sans réveiller personne). */
export const ALERT_KINDS: readonly FindingKind[] = [
  "aggregate_drift",
  "unbilled_upstream",
  "negative_margin",
  "ledger_mismatch",
  "lost_reservation",
];

/** Bornes UTC d'un jour AAAA-MM-JJ. */
export function dayBounds(day: string): { start: Date; end: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day))
    throw new RangeError(`jour illisible : ${day}`);
  const start = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()))
    throw new RangeError(`jour illisible : ${day}`);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

/** Lignes du grand livre d'un jour (UTC) qui portent un identifiant amont, hors échecs. */
export async function loadLedgerRows(
  db: Database,
  day: string,
): Promise<LedgerRow[]> {
  const { start, end } = dayBounds(day);
  const rows = await db
    .select()
    .from(usageEvents)
    .where(
      and(
        gte(usageEvents.createdAt, start),
        lt(usageEvents.createdAt, end),
        sql`${usageEvents.status} <> 'error'`,
        sql`(${usageEvents.litellmCallId} IS NOT NULL OR ${usageEvents.upstreamGenerationId} IS NOT NULL)`,
      ),
    );
  return rows.map((e) => ({
    eventId: e.id,
    requestId: e.requestId,
    organizationId: e.organizationId,
    model: e.modelPublicId,
    day,
    status: e.status,
    billed: e.billed,
    upstreamGenerationId: e.upstreamGenerationId,
    litellmCallId: e.litellmCallId,
    promptTokens: e.promptTokens,
    completionTokens: e.completionTokens,
    cachedTokens: e.cachedTokens,
    usageSource: e.usageSource,
    billedMicroCad: e.costMicro,
    reportedUsdNano: e.reportedCostUsdNano,
    litellmResponseCostNano: e.litellmResponseCostNano,
    computedUsdNano: e.upstreamCostUsdNano,
    fxUsdToCadMicro: e.fxUsdToCadMicro,
    provider: e.upstreamProvider,
  }));
}

/** Nombre d'événements d'un jour qui portent un identifiant amont mais n'ont encore aucun résultat de réconciliation. */
export async function countUnreconciled(
  db: Database,
  day: string,
): Promise<number> {
  const { start, end } = dayBounds(day);
  const [row] = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM usage_events e
    WHERE e.created_at >= ${start.toISOString()}::timestamptz AND e.created_at < ${end.toISOString()}::timestamptz
      AND e.status <> 'error' AND (e.litellm_call_id IS NOT NULL OR e.upstream_generation_id IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM usage_reconciliations r WHERE r.usage_event_id = e.id)`);
  return row?.n ?? 0;
}

/** Appels LiteLLM connus (événements et intentions) parmi `ids` : le reste est une dépense sans ligne chez nous. */
export async function knownCallIds(
  db: Database,
  ids: readonly string[],
): Promise<Set<string>> {
  const known = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    if (chunk.length === 0) continue;
    const list = sql.join(
      chunk.map((id) => sql`${id}`),
      sql`, `,
    );
    const rows = await db.execute<{ id: string }>(sql`
      SELECT litellm_call_id AS id FROM usage_events WHERE litellm_call_id IN (${list})
      UNION
      SELECT litellm_call_id AS id FROM usage_intents WHERE litellm_call_id IN (${list})
    `);
    for (const r of rows) known.add(r.id);
  }
  return known;
}

export interface InvariantFinding extends FindingInput {
  kind: "ledger_mismatch";
}

/**
 * Invariants INTERNES du grand livre, sur le jour `day` (UTC) :
 *  1. pour chaque réservation de la passerelle réglée ce jour-là, le règlement du grand livre = le coût de l'événement
 *     d'usage (la somme des lignes d'usage ne dérive pas du grand livre) ;
 *  2. pour chaque organisation ayant des écritures ce jour-là, le solde et le retenu en cache = la somme des écritures.
 */
export async function checkLedgerInvariants(
  db: Database,
  day: string,
): Promise<InvariantFinding[]> {
  const { start, end } = dayBounds(day);
  const out: InvariantFinding[] = [];
  const reservations = await db.execute<{
    id: string;
    organization_id: string;
    request_id: string | null;
    settled: string;
    event_cost: string;
  }>(sql`
    SELECT r.id::text AS id, r.organization_id, e.request_id,
           r.settled_micro::text AS settled, COALESCE(e.cost_micro, 0)::text AS event_cost
    FROM credit_reservations r
    LEFT JOIN usage_events e ON e.reservation_id = r.id
    WHERE r.idempotency_key LIKE 'gw:%'
      AND r.settled_micro IS NOT NULL
      AND r.closed_at >= ${start.toISOString()}::timestamptz AND r.closed_at < ${end.toISOString()}::timestamptz
      AND r.settled_micro IS DISTINCT FROM COALESCE(e.cost_micro, 0)
  `);
  for (const r of reservations)
    out.push({
      dedupeKey: `ledger_mismatch:reservation:${r.id}`,
      kind: "ledger_mismatch",
      organizationId: r.organization_id,
      requestId: r.request_id,
      day,
      detail: {
        check: "settled_vs_usage_event",
        settledMicro: r.settled,
        eventCostMicro: r.event_cost,
      },
    });
  const balances = await db.execute<{
    organization_id: string;
    balance: string;
    derived_balance: string;
    held: string;
    derived_held: string;
  }>(sql`
    SELECT a.organization_id, a.balance_micro::text AS balance, a.held_micro::text AS held,
           COALESCE(s.balance, 0)::text AS derived_balance, COALESCE(s.held, 0)::text AS derived_held
    FROM credit_accounts a
    LEFT JOIN (
      SELECT organization_id, SUM(balance_delta_micro) AS balance, SUM(held_delta_micro) AS held
      FROM credit_entries GROUP BY organization_id
    ) s ON s.organization_id = a.organization_id
    WHERE a.organization_id IN (
      SELECT DISTINCT organization_id FROM credit_entries
      WHERE created_at >= ${start.toISOString()}::timestamptz AND created_at < ${end.toISOString()}::timestamptz
    )
    AND (a.balance_micro <> COALESCE(s.balance, 0) OR a.held_micro <> COALESCE(s.held, 0))
  `);
  for (const b of balances)
    out.push({
      dedupeKey: `ledger_mismatch:balance:${b.organization_id}:${day}`,
      kind: "ledger_mismatch",
      organizationId: b.organization_id,
      day,
      detail: {
        check: "account_vs_entries",
        balanceMicro: b.balance,
        derivedBalanceMicro: b.derived_balance,
        heldMicro: b.held,
        derivedHeldMicro: b.derived_held,
      },
    });
  return out;
}

export async function startRun(db: Database, day: string): Promise<string> {
  const [run] = await db
    .insert(reconciliationRuns)
    .values({ day })
    .returning({ id: reconciliationRuns.id });
  if (!run) throw new Error("exécution non créée");
  return run.id;
}

export async function finishRun(
  db: Database,
  runId: string,
  status: "ok" | "alert" | "failed",
  summary: Record<string, unknown>,
): Promise<void> {
  await db
    .update(reconciliationRuns)
    .set({ status, finishedAt: sql`now()`, summary })
    .where(eq(reconciliationRuns.id, runId));
}

/** Enregistre les résultats par événement (dernier passage) et les écarts, dans UNE transaction. Idempotent. */
export async function saveReconciliation(
  db: Database,
  runId: string,
  results: readonly EventResult[],
  findings: readonly FindingInput[],
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const r of results)
      await tx
        .insert(usageReconciliations)
        .values({
          usageEventId: r.eventId,
          requestId: r.requestId,
          runId,
          status: r.status,
          source: r.source,
          upstreamCostUsdNano: r.upstreamCostUsdNano,
          nativePromptTokens: r.nativePrompt,
          nativeCompletionTokens: r.nativeCompletion,
          nativeReasoningTokens: r.nativeReasoning,
          nativeCachedTokens: r.nativeCached,
          upstreamProvider: r.provider,
          cancelled: r.cancelled,
        })
        .onConflictDoUpdate({
          target: usageReconciliations.usageEventId,
          set: {
            runId,
            status: r.status,
            source: r.source,
            upstreamCostUsdNano: r.upstreamCostUsdNano,
            nativePromptTokens: r.nativePrompt,
            nativeCompletionTokens: r.nativeCompletion,
            nativeReasoningTokens: r.nativeReasoning,
            nativeCachedTokens: r.nativeCached,
            upstreamProvider: r.provider,
            cancelled: r.cancelled,
            reconciledAt: sql`now()`,
          },
        });
    for (const f of findings) await recordFinding(tx, { ...f, runId });
  });
}

/** Écarts ouverts (les plus récents d'abord), pour la page d'administration. */
export async function listFindings(
  db: Database,
  options: {
    status?: "open" | "reviewed";
    kind?: FindingKind;
    limit?: number;
  } = {},
) {
  const where = [
    options.status
      ? eq(reconciliationFindings.status, options.status)
      : undefined,
    options.kind ? eq(reconciliationFindings.kind, options.kind) : undefined,
  ].filter((w) => w !== undefined);
  return db
    .select()
    .from(reconciliationFindings)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(
      sql`${reconciliationFindings.foundAt} DESC`,
      reconciliationFindings.id,
    )
    .limit(Math.min(options.limit ?? 200, 1000));
}

/** Dernière exécution du job (pour l'en-tête de la page d'administration). */
export async function lastRun(db: Database) {
  const [run] = await db
    .select()
    .from(reconciliationRuns)
    .orderBy(sql`${reconciliationRuns.startedAt} DESC`)
    .limit(1);
  return run;
}

/** Efface les intentions RÉGLÉES de plus de `olderThan` (le journal garde les « pending » et les anomalies). */
export async function purgeSettledIntents(
  db: Database,
  olderThan: Date,
): Promise<number> {
  const rows = await db
    .delete(usageIntents)
    .where(
      and(
        eq(usageIntents.status, "settled"),
        lt(usageIntents.createdAt, olderThan),
      ),
    )
    .returning({ id: usageIntents.id });
  return rows.length;
}
