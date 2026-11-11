import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./schema-auth.ts";
import { apiKeys, usageEvents } from "./schema-gateway.ts";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const micro = (name: string) => bigint(name, { mode: "bigint" });
const inList = (values: readonly string[]) =>
  sql.raw(values.map((v) => `'${v}'`).join(", "));

/**
 * Journal d'INTENTION de la passerelle (audit F-01). Une ligne `pending` est écrite dans la MÊME transaction que la
 * réservation du grand livre, donc AVANT l'appel amont : un arrêt du serveur entre la réservation et le règlement
 * laisse désormais une trace durable (avant : une réservation sans événement d'usage, libérée à zéro au bout de 30
 * minutes, invisible pour le client comme pour les contrôles internes).
 *
 * La ligne garde l'instantané de prix et le coût de l'invite estimée : la reprise (`recoverStaleIntents`) règle une
 * requête perdue sans dépendre du code de la passerelle. `usage_events` est en ajout seulement (déclencheur) : le
 * statut qui change vit ici, jamais là-bas. Métadonnées seulement : jamais le contenu d'une requête.
 */
export const INTENT_STATUSES = [
  "pending",
  "settled",
  "recovered",
  "anomaly",
] as const;
export type IntentStatus = (typeof INTENT_STATUSES)[number];

export const usageIntents = pgTable(
  "usage_intents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: text("request_id").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    apiKeyId: uuid("api_key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: "restrict" }),
    /** Réservation du grand livre ; null pour une organisation « maison » (aucun débit). */
    reservationId: uuid("reservation_id"),
    modelPublicId: text("model_public_id").notNull(),
    endpoint: text("endpoint").notNull(),
    configVersion: text("config_version").notNull(),
    stream: boolean("stream").notNull().default(false),
    /**
     * Identifiant d'appel envoyé à LiteLLM (`x-litellm-call-id`, honoré par la v1.106.2) AVANT l'appel : il permet de
     * retrouver la dépense dans `LiteLLM_SpendLogs` même si le serveur s'arrête avant d'avoir lu la réponse.
     * Null pour un agent hébergé (aucune dépense LiteLLM rattachable).
     */
    litellmCallId: text("litellm_call_id"),
    promptEstimate: integer("prompt_estimate").notNull(),
    /** Ce que la reprise facture à une requête perdue : l'invite estimée au prix figé (jamais plus que la réservation). */
    recoveryCostMicro: micro("recovery_cost_micro").notNull(),
    recoveryUpstreamCostUsdNano: micro("recovery_upstream_cost_usd_nano")
      .notNull()
      .default(sql`0`),
    /** Prix par million appliqués (instantané de la version de catalogue) et change du catalogue. */
    priceInputMicro: micro("price_input_micro").notNull().default(sql`0`),
    priceOutputMicro: micro("price_output_micro").notNull().default(sql`0`),
    priceCacheMicro: micro("price_cache_micro"),
    priceCacheWriteMicro: micro("price_cache_write_micro"),
    priceWindow: text("price_window"),
    fxUsdToCadMicro: micro("fx_usd_to_cad_micro"),
    status: text("status").$type<IntentStatus>().notNull().default("pending"),
    createdAt: ts("created_at").notNull().defaultNow(),
    resolvedAt: ts("resolved_at"),
  },
  (t) => [
    uniqueIndex("usage_intents_request_unique").on(t.requestId),
    index("usage_intents_pending_idx")
      .on(t.createdAt)
      .where(sql`${t.status} = 'pending'`),
    check(
      "usage_intents_status_check",
      sql`${t.status} IN (${inList(INTENT_STATUSES)})`,
    ),
    check("usage_intents_recovery_nonneg", sql`${t.recoveryCostMicro} >= 0`),
  ],
);

/**
 * Types d'écart de la réconciliation (voir `docs/recherche/facturation-exacte-chantiers-1-5.md`).
 * - `lost_reservation` : une réservation de la passerelle a été libérée sans règlement et sans trace d'intention
 *   exploitable (antérieure au journal, ou agent hébergé) : perte possible, invisible autrement ;
 * - `recovered_in_flight` : requête perdue (arrêt du serveur) réglée à l'estimé par la reprise : à comparer à l'amont ;
 * - `unbilled_upstream` : l'amont a une dépense, Nexora n'a aucune ligne (perte) ;
 * - `billed_no_upstream` : facturé au client, rien chez l'amont (sur-facturation possible) ;
 * - `token_mismatch` : jetons facturés ≠ jetons natifs de l'amont ;
 * - `cost_mismatch` : coût rapporté dans la réponse ≠ coût de l'enregistrement amont ;
 * - `negative_margin` : CAD facturés < USD amont × change ;
 * - `aggregate_drift` : écart agrégé (fournisseur, jour, modèle) au-delà de 0,5 % ou de 1 USD ;
 * - `ledger_mismatch` : invariant interne rompu (somme des lignes ≠ grand livre, solde ≠ somme des écritures).
 */
export const FINDING_KINDS = [
  "lost_reservation",
  "recovered_in_flight",
  "unbilled_upstream",
  "billed_no_upstream",
  "token_mismatch",
  "cost_mismatch",
  "negative_margin",
  "aggregate_drift",
  "ledger_mismatch",
] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];

export const FINDING_STATUSES = ["open", "reviewed"] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

/**
 * Écarts constatés par la réconciliation et par la reprise des requêtes perdues. Une ligne par anomalie, idempotente
 * par `dedupe_key` (rejouer un jour met à jour la ligne au lieu d'en créer une autre). Observation seulement : aucun
 * écart ne modifie le grand livre tout seul ; une personne les révise (`status = reviewed`).
 */
export const reconciliationFindings = pgTable(
  "reconciliation_findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Exécution du job qui a constaté l'écart ; null pour une anomalie constatée par la reprise du grand livre. */
    runId: uuid("run_id"),
    dedupeKey: text("dedupe_key").notNull(),
    kind: text("kind").$type<FindingKind>().notNull(),
    status: text("status").$type<FindingStatus>().notNull().default("open"),
    foundAt: ts("found_at").notNull().defaultNow(),
    organizationId: text("organization_id"),
    requestId: text("request_id"),
    generationId: text("generation_id"),
    litellmCallId: text("litellm_call_id"),
    provider: text("provider"),
    model: text("model"),
    /** Jour UTC de l'événement (le jour de l'amont est UTC). */
    day: date("day", { mode: "string" }),
    expectedUsdNano: micro("expected_usd_nano"),
    actualUsdNano: micro("actual_usd_nano"),
    deltaUsdNano: micro("delta_usd_nano"),
    deltaPct: numeric("delta_pct", { precision: 12, scale: 4 }),
    /** Détails sans contenu : montants, jetons, identifiants, provenance. */
    detail: jsonb("detail")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    reviewedAt: ts("reviewed_at"),
    reviewedBy: text("reviewed_by"),
    note: text("note"),
  },
  (t) => [
    uniqueIndex("reconciliation_findings_dedupe_unique").on(t.dedupeKey),
    index("reconciliation_findings_open_idx")
      .on(t.foundAt)
      .where(sql`${t.status} = 'open'`),
    index("reconciliation_findings_kind_idx").on(t.kind, t.day),
    check(
      "reconciliation_findings_kind_check",
      sql`${t.kind} IN (${inList(FINDING_KINDS)})`,
    ),
    check(
      "reconciliation_findings_status_check",
      sql`${t.status} IN (${inList(FINDING_STATUSES)})`,
    ),
  ],
);

/**
 * Résultat de la réconciliation d'un événement d'usage avec l'amont : conforme, écart (jetons ou coût) ou rien chez
 * l'amont. Table à part : `usage_events` est en ajout seulement (déclencheur), on n'y réécrit jamais rien. Une ligne par
 * événement (la dernière réconciliation), rejouable.
 */
export const RECONCILE_STATUSES = [
  "ok",
  "mismatch",
  "missing_upstream",
] as const;
export type ReconcileStatus = (typeof RECONCILE_STATUSES)[number];

export const UPSTREAM_SOURCES = ["openrouter", "litellm"] as const;
export type UpstreamSource = (typeof UPSTREAM_SOURCES)[number];

export const usageReconciliations = pgTable(
  "usage_reconciliations",
  {
    usageEventId: uuid("usage_event_id")
      .primaryKey()
      .references(() => usageEvents.id, { onDelete: "cascade" }),
    requestId: text("request_id").notNull(),
    runId: uuid("run_id"),
    status: text("status").$type<ReconcileStatus>().notNull(),
    /** Source amont qui a servi à la comparaison ; null si rien n'a été trouvé. */
    source: text("source").$type<UpstreamSource>(),
    upstreamCostUsdNano: micro("upstream_cost_usd_nano"),
    /** Jetons NATIFS de l'amont (OpenRouter `native_tokens_*`) ou ceux de LiteLLM (`LiteLLM_SpendLogs`). */
    nativePromptTokens: integer("native_prompt_tokens"),
    nativeCompletionTokens: integer("native_completion_tokens"),
    nativeReasoningTokens: integer("native_reasoning_tokens"),
    nativeCachedTokens: integer("native_cached_tokens"),
    upstreamProvider: text("upstream_provider"),
    /** Génération annulée côté amont (OpenRouter `cancelled`). */
    cancelled: boolean("cancelled").notNull().default(false),
    reconciledAt: ts("reconciled_at").notNull().defaultNow(),
  },
  (t) => [
    index("usage_reconciliations_status_idx").on(t.status, t.reconciledAt),
    check(
      "usage_reconciliations_status_check",
      sql`${t.status} IN (${inList(RECONCILE_STATUSES)})`,
    ),
  ],
);

export const RECONCILIATION_RUN_STATUSES = [
  "running",
  "ok",
  "alert",
  "failed",
] as const;
export type ReconciliationRunStatus =
  (typeof RECONCILIATION_RUN_STATUSES)[number];

/** Journal des exécutions du job `reconcile.daily` : une ligne par exécution (rejeu compris), avec son résumé sans contenu. */
export const reconciliationRuns = pgTable(
  "reconciliation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Jour UTC réconcilié (AAAA-MM-JJ) : le jour de l'amont est UTC. */
    day: date("day", { mode: "string" }).notNull(),
    status: text("status")
      .$type<ReconciliationRunStatus>()
      .notNull()
      .default("running"),
    startedAt: ts("started_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
    /** Comptes seulement : lignes comparées, écarts par type, sources indisponibles, alerte. */
    summary: jsonb("summary")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
  },
  (t) => [
    index("reconciliation_runs_day_idx").on(t.day, t.startedAt),
    check(
      "reconciliation_runs_status_check",
      sql`${t.status} IN (${inList(RECONCILIATION_RUN_STATUSES)})`,
    ),
  ],
);
