import {
  type Database,
  eq,
  apiKeys as keysTable,
  releaseReservation,
  settleReservation,
  sql,
  type UsageStatus,
  usageEvents,
} from "@nexora/db";
import { type PerMillion, requestCost } from "./pricing";

/**
 * Règlement d'une requête (D1) : grand livre + événement d'usage, dans UNE transaction et de façon
 * idempotente par `requestId`. Le règlement est au coût RÉEL : au-delà du montant réservé, le grand
 * livre débite le dépassement (le solde peut devenir négatif, l'API répond alors 402). La dépense de la
 * clé (`spent_micro`) est ajustée par le grand livre, dans la même transaction. L'événement ne contient
 * que des métadonnées : jamais le contenu de la requête ni de la réponse.
 */

export interface FinalizeInput {
  requestId: string;
  organizationId: string;
  apiKeyId: string;
  modelPublicId: string;
  endpoint: "chat.completions" | "embeddings";
  configVersion: string;
  stream: boolean;
  status: UsageStatus;
  httpStatus: number;
  errorCode?: string | null;
  tokens: {
    prompt: number;
    completion: number;
    cached: number;
    cacheWrite?: number;
    reasoning?: number;
    reportedUsdMicro?: number;
  };
  price: PerMillion;
  upstreamPrice: PerMillion;
  /** Étiquette de la plage horaire appliquée, null = prix de base. */
  priceWindow?: string | null;
  /** Route qui a servi : 0 = principale, n = route de secours n. */
  routePosition?: number;
  reservationId: string;
  /**
   * Frais par exécution (agents hébergés, S7), en plus des jetons ; 0 pour un modèle. Dus dès qu'une exécution a
   * eu lieu (statut « ok » ou « aborted »), jamais sur un échec.
   */
  runFeeMicro?: bigint;
  latencyMs: number;
}

export interface FinalizeResult {
  /** Coût réel facturé (peut dépasser le montant réservé). */
  costMicro: bigint;
  /** Part du coût au-delà de la réservation (0 le plus souvent). */
  overageMicro: bigint;
  replayed: boolean;
}

/** Coût rapporté par l'amont, gardé à part du coût calculé ; null si l'amont n'en donne pas ou si la requête a échoué. */
const reportedOf = (input: {
  status: string;
  tokens: { reportedUsdMicro?: number };
}): bigint | null =>
  input.status === "error" || input.tokens.reportedUsdMicro === undefined
    ? null
    : BigInt(input.tokens.reportedUsdMicro);

export async function finalizeRequest(
  db: Database,
  input: FinalizeInput,
): Promise<FinalizeResult> {
  return db.transaction(async (tx) => {
    let charged = 0n;
    let overage = 0n;
    const runFee = input.status === "error" ? 0n : (input.runFeeMicro ?? 0n);
    if (input.status === "error") {
      await releaseReservation(tx, {
        organizationId: input.organizationId,
        reservationId: input.reservationId,
      });
    } else {
      const wanted = requestCost(input.tokens, input.price) + runFee;
      const settled = await settleReservation(tx, {
        organizationId: input.organizationId,
        reservationId: input.reservationId,
        actualMicro: wanted,
      });
      charged = settled.chargedMicro;
      overage = settled.overageEntry
        ? -settled.overageEntry.balanceDeltaMicro
        : 0n;
    }
    const upstreamUsd =
      input.status === "error"
        ? 0n
        : requestCost(input.tokens, input.upstreamPrice);
    const [inserted] = await tx
      .insert(usageEvents)
      .values({
        requestId: input.requestId,
        organizationId: input.organizationId,
        apiKeyId: input.apiKeyId,
        modelPublicId: input.modelPublicId,
        endpoint: input.endpoint,
        configVersion: input.configVersion,
        status: input.status,
        httpStatus: input.httpStatus,
        errorCode: input.errorCode ?? null,
        stream: input.stream,
        promptTokens: input.tokens.prompt,
        completionTokens: input.tokens.completion,
        cachedTokens: input.tokens.cached,
        cacheWriteTokens: input.tokens.cacheWrite ?? 0,
        reasoningTokens: input.tokens.reasoning ?? 0,
        costMicro: charged,
        valueMicro: charged,
        runFeeMicro: runFee < charged ? runFee : charged,
        upstreamCostUsdMicro: upstreamUsd,
        priceInputMicro: input.price.input,
        priceOutputMicro: input.price.output,
        priceCacheMicro: input.price.cache,
        priceCacheWriteMicro: input.price.cacheWrite ?? null,
        priceWindow: input.priceWindow ?? null,
        routePosition: input.routePosition ?? 0,
        reportedCostUsdMicro: reportedOf(input),
        latencyMs: input.latencyMs,
        reservationId: input.reservationId,
      })
      .onConflictDoNothing({ target: usageEvents.requestId })
      .returning({ id: usageEvents.id, costMicro: usageEvents.costMicro });
    if (!inserted) {
      const [existing] = await tx
        .select({ costMicro: usageEvents.costMicro })
        .from(usageEvents)
        .where(eq(usageEvents.requestId, input.requestId));
      return {
        costMicro: existing?.costMicro ?? charged,
        overageMicro: overage,
        replayed: true,
      };
    }
    await tx
      .update(keysTable)
      .set({ lastUsedAt: new Date() })
      .where(eq(keysTable.id, input.apiKeyId));
    return { costMicro: charged, overageMicro: overage, replayed: false };
  });
}

/**
 * Règlement d'une requête d'une organisation « maison » (G9) : aucune réservation, aucun débit. L'événement
 * d'usage garde les jetons, la valeur au prix public (ce qu'une organisation ordinaire aurait payé) et le coût
 * amont réel ; `billed` est faux et `cost_micro` vaut 0. Idempotent par `requestId`.
 */
export async function finalizeHouseRequest(
  db: Database,
  input: Omit<FinalizeInput, "reservationId">,
): Promise<FinalizeResult> {
  const failed = input.status === "error";
  const runFee = failed ? 0n : (input.runFeeMicro ?? 0n);
  const value = failed ? 0n : requestCost(input.tokens, input.price) + runFee;
  const upstreamUsd = failed
    ? 0n
    : requestCost(input.tokens, input.upstreamPrice);
  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(usageEvents)
      .values({
        requestId: input.requestId,
        organizationId: input.organizationId,
        apiKeyId: input.apiKeyId,
        modelPublicId: input.modelPublicId,
        endpoint: input.endpoint,
        configVersion: input.configVersion,
        status: input.status,
        httpStatus: input.httpStatus,
        errorCode: input.errorCode ?? null,
        stream: input.stream,
        promptTokens: input.tokens.prompt,
        completionTokens: input.tokens.completion,
        cachedTokens: input.tokens.cached,
        cacheWriteTokens: input.tokens.cacheWrite ?? 0,
        reasoningTokens: input.tokens.reasoning ?? 0,
        costMicro: 0n,
        billed: false,
        valueMicro: value,
        runFeeMicro: 0n,
        upstreamCostUsdMicro: upstreamUsd,
        priceInputMicro: input.price.input,
        priceOutputMicro: input.price.output,
        priceCacheMicro: input.price.cache,
        priceCacheWriteMicro: input.price.cacheWrite ?? null,
        priceWindow: input.priceWindow ?? null,
        routePosition: input.routePosition ?? 0,
        reportedCostUsdMicro: reportedOf(input),
        latencyMs: input.latencyMs,
        reservationId: null,
      })
      .onConflictDoNothing({ target: usageEvents.requestId })
      .returning({ id: usageEvents.id });
    if (inserted)
      await tx
        .update(keysTable)
        .set({ lastUsedAt: new Date() })
        .where(eq(keysTable.id, input.apiKeyId));
    return { costMicro: 0n, overageMicro: 0n, replayed: !inserted };
  });
}

export interface UsageRow {
  day: string;
  model: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  costMicro: bigint;
}

/** Usage de l'organisation par jour (fuseau de Montréal) et par modèle, sur `days` jours. */
export async function usageByDayAndModel(
  db: Database,
  organizationId: string,
  days = 30,
  now: Date = new Date(),
): Promise<UsageRow[]> {
  const since = new Date(now.getTime() - days * 86_400_000);
  const rows = await db.execute<{
    day: string;
    model: string;
    requests: string;
    prompt: string;
    completion: string;
    cost: string;
  }>(sql`
    SELECT to_char((created_at AT TIME ZONE 'America/Toronto')::date, 'YYYY-MM-DD') AS day,
           model_public_id AS model,
           count(*)::text AS requests,
           COALESCE(sum(prompt_tokens), 0)::text AS prompt,
           COALESCE(sum(completion_tokens), 0)::text AS completion,
           COALESCE(sum(cost_micro), 0)::text AS cost
    FROM usage_events
    WHERE organization_id = ${organizationId} AND created_at >= ${since.toISOString()}::timestamptz
    GROUP BY 1, 2
    ORDER BY 1 DESC, 2 ASC
  `);
  return [...rows].map((r) => ({
    day: r.day,
    model: r.model,
    requests: Number(r.requests),
    promptTokens: Number(r.prompt),
    completionTokens: Number(r.completion),
    costMicro: BigInt(r.cost),
  }));
}

export interface ReconciliationRow {
  model: string;
  requests: number;
  /** Total débité aux clients (micro-CAD). */
  billedMicro: bigint;
  /** Valeur offerte aux organisations « maison » (micro-CAD). */
  offeredMicro: bigint;
  /** Coût amont calculé avec nos prix de route (micro-USD). */
  upstreamComputedUsdMicro: bigint;
  /** Requêtes pour lesquelles l'amont a rapporté son coût (OpenRouter). */
  reportedRequests: number;
  upstreamReportedUsdMicro: bigint;
  /** Rapporté moins calculé, sur les seules requêtes qui ont un coût rapporté : positif = on sous-estime nos coûts. */
  driftUsdMicro: bigint;
}

/** Rapprochement par modèle sur `days` jours : ce qui est facturé, offert, et ce que coûte l'amont (calculé et rapporté). */
export async function reconciliationByModel(
  db: Database,
  days = 30,
  now: Date = new Date(),
): Promise<ReconciliationRow[]> {
  const since = new Date(now.getTime() - days * 86_400_000);
  const rows = await db.execute<{
    model: string;
    requests: string;
    billed: string;
    offered: string;
    computed: string;
    reported_requests: string;
    reported: string;
    computed_for_reported: string;
  }>(sql`
    SELECT model_public_id AS model,
           count(*)::text AS requests,
           COALESCE(sum(cost_micro) FILTER (WHERE billed), 0)::text AS billed,
           COALESCE(sum(value_micro) FILTER (WHERE NOT billed), 0)::text AS offered,
           COALESCE(sum(upstream_cost_usd_micro), 0)::text AS computed,
           (count(*) FILTER (WHERE reported_cost_usd_micro IS NOT NULL))::text AS reported_requests,
           COALESCE(sum(reported_cost_usd_micro), 0)::text AS reported,
           COALESCE(sum(upstream_cost_usd_micro) FILTER (WHERE reported_cost_usd_micro IS NOT NULL), 0)::text AS computed_for_reported
    FROM usage_events
    WHERE created_at >= ${since.toISOString()}::timestamptz AND status <> 'error'
    GROUP BY 1
    ORDER BY 1
  `);
  return [...rows].map((r) => ({
    model: r.model,
    requests: Number(r.requests),
    billedMicro: BigInt(r.billed),
    offeredMicro: BigInt(r.offered),
    upstreamComputedUsdMicro: BigInt(r.computed),
    reportedRequests: Number(r.reported_requests),
    upstreamReportedUsdMicro: BigInt(r.reported),
    driftUsdMicro: BigInt(r.reported) - BigInt(r.computed_for_reported),
  }));
}
