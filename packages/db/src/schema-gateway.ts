import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./schema-auth.ts";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const micro = (name: string) => bigint(name, { mode: "bigint" });

/**
 * Passerelle de modèles (S5, D1/D14) : catalogue commercial (fournisseurs, modèles, prix, taux de
 * change), clés clientes et événements d'usage. Ces tables portent de l'argent et des identifiants
 * clients : elles vivent dans la base `app`, jamais dans Directus (D4). L'administration passe par
 * `/api/admin/catalog/*` (module Directus « Modèles »).
 */

export const PROVIDER_TYPES = [
  "openrouter",
  "openai_compatible",
  "litellm_upstream",
  "vllm",
  "ollama",
] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

/** Région d'hébergement déclarée (affichée au catalogue : « Hébergé au Québec »). */
export const REGIONS = [
  "quebec",
  "canada",
  "etats_unis",
  "europe",
  "autre",
] as const;
export type Region = (typeof REGIONS)[number];

export const HEALTH_STATES = ["unknown", "ok", "error"] as const;
export type HealthState = (typeof HEALTH_STATES)[number];

const inList = (values: readonly string[]) =>
  sql.raw(values.map((v) => `'${v}'`).join(", "));

/** Fournisseur amont. La clé n'est jamais ici : seulement sa référence dans le coffre (D2). */
export const modelProviders = pgTable(
  "model_providers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Identifiant stable en minuscules (sert de nom de crédential LiteLLM). */
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: text("type").$type<ProviderType>().notNull(),
    /** Adresse vue par l'app (test du fournisseur). */
    baseUrl: text("base_url").notNull(),
    /** Adresse vue par LiteLLM quand elle diffère (réseaux Docker différents). */
    litellmBaseUrl: text("litellm_base_url"),
    /** Référence du coffre (kind llm_provider) ; null = fournisseur sans clé (Ollama local). */
    secretRef: text("secret_ref"),
    region: text("region").$type<Region>().notNull(),
    dataPolicyFr: text("data_policy_fr").notNull().default(""),
    dataPolicyEn: text("data_policy_en").notNull().default(""),
    priority: integer("priority").notNull().default(100),
    enabled: boolean("enabled").notNull().default(true),
    healthState: text("health_state")
      .$type<HealthState>()
      .notNull()
      .default("unknown"),
    lastCheckedAt: ts("last_checked_at"),
    /** Résumé court du dernier contrôle (jamais de corps de réponse ni de secret). */
    lastCheckDetail: text("last_check_detail"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("model_providers_code_unique").on(t.code),
    check(
      "model_providers_type_check",
      sql`${t.type} IN (${inList(PROVIDER_TYPES)})`,
    ),
    check(
      "model_providers_region_check",
      sql`${t.region} IN (${inList(REGIONS)})`,
    ),
    check(
      "model_providers_health_check",
      sql`${t.healthState} IN (${inList(HEALTH_STATES)})`,
    ),
  ],
);

export const MODEL_KINDS = ["chat", "embedding"] as const;
export type ModelKind = (typeof MODEL_KINDS)[number];
export const MODEL_VISIBILITIES = ["public", "unlisted", "private"] as const;
export type ModelVisibility = (typeof MODEL_VISIBILITIES)[number];
export const MODEL_STATUSES = [
  "draft",
  "approved",
  "published",
  "retired",
] as const;
export type ModelStatus = (typeof MODEL_STATUSES)[number];

export interface ModelCapabilities {
  streaming?: boolean;
  tools?: boolean;
  vision?: boolean;
  reasoning?: boolean;
  json_mode?: boolean;
}

/** Modèle exposé par la passerelle, sous un identifiant public stable (ex. `nexora/glm-5-3`). */
export const models = pgTable(
  "models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: text("public_id").notNull(),
    name: text("name").notNull(),
    descriptionFr: text("description_fr").notNull().default(""),
    descriptionEn: text("description_en").notNull().default(""),
    kind: text("kind").$type<ModelKind>().notNull().default("chat"),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => modelProviders.id, { onDelete: "restrict" }),
    /** Identifiant du modèle chez le fournisseur. */
    upstreamId: text("upstream_id").notNull(),
    contextMax: integer("context_max").notNull(),
    /** Plafond de jetons de sortie ; null = 4096 par défaut. */
    maxOutputTokens: integer("max_output_tokens"),
    capabilities: jsonb("capabilities")
      .$type<ModelCapabilities>()
      .notNull()
      .default({}),
    residency: text("residency").$type<Region>().notNull(),
    visibility: text("visibility")
      .$type<ModelVisibility>()
      .notNull()
      .default("public"),
    status: text("status").$type<ModelStatus>().notNull().default("draft"),
    sunsetAt: ts("sunset_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("models_public_id_unique").on(t.publicId),
    index("models_provider_idx").on(t.providerId),
    check("models_kind_check", sql`${t.kind} IN (${inList(MODEL_KINDS)})`),
    check(
      "models_visibility_check",
      sql`${t.visibility} IN (${inList(MODEL_VISIBILITIES)})`,
    ),
    check(
      "models_status_check",
      sql`${t.status} IN (${inList(MODEL_STATUSES)})`,
    ),
    check(
      "models_residency_check",
      sql`${t.residency} IN (${inList(REGIONS)})`,
    ),
    check("models_context_pos", sql`${t.contextMax} > 0`),
  ],
);

/**
 * Prix d'un modèle, par MILLION de jetons. Lignes IMMUABLES (déclencheur SQL) : changer un prix
 * crée une nouvelle ligne avec une nouvelle date d'effet ; un prix ne change jamais pour une
 * requête passée. Coûts amont en micro-USD, prix de vente en micro-CAD.
 */
export const modelPrices = pgTable(
  "model_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelId: uuid("model_id")
      .notNull()
      .references(() => models.id, { onDelete: "restrict" }),
    upstreamInputUsdMicro: micro("upstream_input_usd_micro").notNull(),
    upstreamOutputUsdMicro: micro("upstream_output_usd_micro").notNull(),
    upstreamCacheUsdMicro: micro("upstream_cache_usd_micro"),
    sellInputCadMicro: micro("sell_input_cad_micro").notNull(),
    sellOutputCadMicro: micro("sell_output_cad_micro").notNull(),
    sellCacheCadMicro: micro("sell_cache_cad_micro"),
    /** Marge visée, en points de base (informative ; le plancher est contraignant). */
    marginBps: integer("margin_bps").notNull().default(0),
    /** Plancher de marge sur le coût amont converti : une publication sous ce plancher est refusée. */
    marginFloorBps: integer("margin_floor_bps").notNull().default(0),
    effectiveAt: ts("effective_at").notNull().defaultNow(),
    note: text("note").notNull().default(""),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("model_prices_model_idx").on(t.modelId, t.effectiveAt),
    check(
      "model_prices_nonneg",
      sql`${t.upstreamInputUsdMicro} >= 0 AND ${t.upstreamOutputUsdMicro} >= 0 AND ${t.sellInputCadMicro} >= 0 AND ${t.sellOutputCadMicro} >= 0 AND ${t.marginFloorBps} >= 0`,
    ),
  ],
);

/** Taux USD → CAD (micro-CAD par dollar américain). Utilisable seulement une fois approuvé. */
export const fxRates = pgTable(
  "fx_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usdToCadMicro: micro("usd_to_cad_micro").notNull(),
    effectiveAt: ts("effective_at").notNull().defaultNow(),
    approvedAt: ts("approved_at"),
    approvedBy: text("approved_by"),
    note: text("note").notNull().default(""),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("fx_rates_effective_idx").on(t.effectiveAt),
    check("fx_rates_positive", sql`${t.usdToCadMicro} > 0`),
  ],
);

/**
 * Clés clientes de la passerelle. Seule l'empreinte SHA-256 d'une clé de 256 bits aléatoires est
 * conservée : la valeur n'est affichée qu'une fois, à la création.
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    /** Début de la clé, affiché dans la liste (sans valeur d'authentification utilisable). */
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    /** Identifiants publics autorisés ; null = tous les modèles publiés. */
    allowedModels: jsonb("allowed_models").$type<string[] | null>(),
    /** Plafond de dépense cumulée de la clé (micro-CAD) ; null = aucun plafond propre. */
    spendCapMicro: micro("spend_cap_micro"),
    /** Dépense réglée + montants réservés des requêtes en cours (micro-CAD). */
    spentMicro: micro("spent_micro").notNull().default(sql`0`),
    rpmLimit: integer("rpm_limit"),
    tpmLimit: integer("tpm_limit"),
    expiresAt: ts("expires_at"),
    revokedAt: ts("revoked_at"),
    lastUsedAt: ts("last_used_at"),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("api_keys_hash_unique").on(t.keyHash),
    index("api_keys_org_idx").on(t.organizationId, t.createdAt),
    check("api_keys_spent_nonneg", sql`${t.spentMicro} >= 0`),
  ],
);

export const USAGE_STATUSES = ["ok", "error", "aborted"] as const;
export type UsageStatus = (typeof USAGE_STATUSES)[number];

/**
 * Événements d'usage : MÉTADONNÉES seulement (jamais le contenu des requêtes ni des réponses).
 * Idempotence par `request_id`.
 */
export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: text("request_id").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    apiKeyId: uuid("api_key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: "restrict" }),
    modelPublicId: text("model_public_id").notNull(),
    endpoint: text("endpoint").notNull(),
    configVersion: text("config_version").notNull(),
    status: text("status").$type<UsageStatus>().notNull(),
    httpStatus: integer("http_status").notNull(),
    errorCode: text("error_code"),
    stream: boolean("stream").notNull().default(false),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    cachedTokens: integer("cached_tokens").notNull().default(0),
    /** Prix de vente débité (micro-CAD) et coût amont (micro-USD). */
    costMicro: micro("cost_micro").notNull().default(sql`0`),
    /** Part de `cost_micro` facturée par exécution (agents hébergés, S7) ; 0 pour un modèle. */
    runFeeMicro: micro("run_fee_micro").notNull().default(sql`0`),
    upstreamCostUsdMicro: micro("upstream_cost_usd_micro")
      .notNull()
      .default(sql`0`),
    /** Prix par million appliqués (instantané de la version de catalogue). */
    priceInputMicro: micro("price_input_micro").notNull().default(sql`0`),
    priceOutputMicro: micro("price_output_micro").notNull().default(sql`0`),
    priceCacheMicro: micro("price_cache_micro"),
    latencyMs: integer("latency_ms").notNull().default(0),
    reservationId: uuid("reservation_id"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("usage_events_request_unique").on(t.requestId),
    index("usage_events_org_idx").on(t.organizationId, t.createdAt),
    index("usage_events_key_idx").on(t.apiKeyId, t.createdAt),
    check(
      "usage_events_status_check",
      sql`${t.status} IN (${inList(USAGE_STATUSES)})`,
    ),
    check(
      "usage_events_nonneg",
      sql`${t.costMicro} >= 0 AND ${t.promptTokens} >= 0 AND ${t.completionTokens} >= 0`,
    ),
  ],
);
