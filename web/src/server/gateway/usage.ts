import {
  and,
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
 * Règlement d'une requête (D1) : grand livre + événement d'usage + dépense de la clé, dans UNE
 * transaction et de façon idempotente par `requestId`. L'événement ne contient que des
 * métadonnées : jamais le contenu de la requête ni de la réponse.
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
  tokens: { prompt: number; completion: number; cached: number };
  price: PerMillion;
  upstreamPrice: PerMillion;
  reservationId: string;
  /** Montant réservé au grand livre et, le cas échéant, sur le plafond de la clé. */
  reservedMicro: bigint;
  keyReserved: boolean;
  latencyMs: number;
}

export interface FinalizeResult {
  costMicro: bigint;
  replayed: boolean;
}

export async function finalizeRequest(
  db: Database,
  input: FinalizeInput,
): Promise<FinalizeResult> {
  return db.transaction(async (tx) => {
    let charged = 0n;
    if (input.status === "error") {
      await releaseReservation(tx, {
        organizationId: input.organizationId,
        reservationId: input.reservationId,
      });
    } else {
      const wanted = requestCost(input.tokens, input.price);
      const { entry } = await settleReservation(tx, {
        organizationId: input.organizationId,
        reservationId: input.reservationId,
        actualMicro: wanted,
      });
      charged = -entry.balanceDeltaMicro;
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
        costMicro: charged,
        upstreamCostUsdMicro: upstreamUsd,
        priceInputMicro: input.price.input,
        priceOutputMicro: input.price.output,
        priceCacheMicro: input.price.cache,
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
      return { costMicro: existing?.costMicro ?? charged, replayed: true };
    }
    // La dépense de la clé passe de « réservé » à « réglé » (ou revient en arrière en cas d'échec).
    const delta = charged - (input.keyReserved ? input.reservedMicro : 0n);
    await tx
      .update(keysTable)
      .set({
        spentMicro: sql`GREATEST(${keysTable.spentMicro} + ${delta.toString()}::bigint, 0)`,
        lastUsedAt: new Date(),
      })
      .where(eq(keysTable.id, input.apiKeyId));
    return { costMicro: charged, replayed: false };
  });
}

/** Réserve atomiquement `amount` sur le plafond de dépense de la clé ; false si le plafond serait dépassé. */
export async function reserveKeySpend(
  db: Database,
  keyId: string,
  amountMicro: bigint,
): Promise<boolean> {
  const rows = await db
    .update(keysTable)
    .set({
      spentMicro: sql`${keysTable.spentMicro} + ${amountMicro.toString()}::bigint`,
    })
    .where(
      and(
        eq(keysTable.id, keyId),
        sql`(${keysTable.spendCapMicro} IS NULL OR ${keysTable.spentMicro} + ${amountMicro.toString()}::bigint <= ${keysTable.spendCapMicro})`,
      ),
    )
    .returning({ id: keysTable.id });
  return rows.length > 0;
}

export async function releaseKeySpend(
  db: Database,
  keyId: string,
  amountMicro: bigint,
): Promise<void> {
  await db
    .update(keysTable)
    .set({
      spentMicro: sql`GREATEST(${keysTable.spentMicro} - ${amountMicro.toString()}::bigint, 0)`,
    })
    .where(eq(keysTable.id, keyId));
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
