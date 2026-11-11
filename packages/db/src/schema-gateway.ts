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

export const MODEL_KINDS = ["chat", "embedding", "rerank"] as const;
export type ModelKind = (typeof MODEL_KINDS)[number];
export const MODEL_VISIBILITIES = ["public", "unlisted", "private"] as const;
export type ModelVisibility = (typeof MODEL_VISIBILITIES)[number];
/**
 * Disponibilité à l'appel. `live` : appelable (la clé du fournisseur est exigée à la publication). `preview` :
 * « aperçu », visible au catalogue public avec sa fiche et ses prix, mais pas encore appelable : la clé du
 * fournisseur n'est pas exigée, `/v1/models` ne le liste pas, LiteLLM ne le reçoit pas et un appel répond 404.
 */
export const MODEL_AVAILABILITIES = ["live", "preview"] as const;
export type ModelAvailability = (typeof MODEL_AVAILABILITIES)[number];
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

export const MODALITIES = [
  "text",
  "image",
  "video",
  "audio",
  "embedding",
] as const;
export type Modality = (typeof MODALITIES)[number];

/**
 * Étiquettes de tri du catalogue public (filtres façon OpenRouter). Vocabulaire fermé : une étiquette n'est posée que
 * si la fiche ou les capacités du modèle la justifient.
 */
export const MODEL_TAGS = [
  "raisonnement",
  "code",
  "agents",
  "vision",
  "multilingue",
  "contexte-long",
  "rapide",
  "economique",
  "poids-ouverts",
  "embeddings",
] as const;
export type ModelTag = (typeof MODEL_TAGS)[number];

/** Une mesure publiée : toujours rattachée à celui qui l'a publiée et à une page que l'on peut relire. */
export interface ModelBenchmark {
  name: string;
  score: number;
  /** « % », « points », « Elo »… */
  unit: string;
  /** Qui a publié ce chiffre (l'éditeur du modèle ou un tiers). */
  publisher: string;
  sourceUrl: string;
  measuredAt?: string;
  /** Regroupement d'affichage : « Code », « Raisonnement », « Agents », « Connaissances »… */
  category?: string;
}

/**
 * Fiche publique d'un modèle (S5, G3) : ce qu'un client voit au catalogue. Tout chiffre y est
 * sourcé (éditeur et page) ; un champ inconnu reste absent plutôt qu'inventé.
 */
export interface ModelSheet {
  /** Éditeur du modèle (« DeepSeek », « Z.ai », « Qwen »…). */
  author?: string;
  family?: string;
  /** Étiquettes de tri du catalogue public. */
  tags?: ModelTag[];
  /** Précision de calcul chez l'hébergeur (« fp8 », « fp4 », « bf16 »). */
  quantization?: string;
  /** Page du modèle chez l'éditeur ou sur Hugging Face. */
  homepageUrl?: string;
  /** AAAA-MM-JJ */
  releasedAt?: string;
  /** AAAA-MM */
  knowledgeCutoff?: string;
  /** `name` reste absent tant que le texte de la licence n'a pas été lu. */
  license?: { name?: string; openWeights: boolean; url?: string };
  /** Milliards de paramètres ; `activeB` pour les modèles à experts. */
  parameters?: { totalB?: number; activeB?: number };
  modalities?: { input: Modality[]; output: Modality[] };
  benchmarks?: ModelBenchmark[];
  sources?: { label: string; url: string; readAt: string }[];
  notesFr?: string;
  notesEn?: string;
}

/**
 * Consignes de routage transmises au fournisseur amont (OpenRouter), jamais montrées aux clients.
 * Les montants sont des micro-USD par million de jetons, en chaînes décimales.
 */
export interface ModelRouting {
  dataCollection?: "allow" | "deny";
  zdr?: boolean;
  allowFallbacks?: boolean;
  order?: string[];
  only?: string[];
  ignore?: string[];
  quantizations?: string[];
  maxPriceUsdMicro?: { input: string; output: string };
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
    availability: text("availability")
      .$type<ModelAvailability>()
      .notNull()
      .default("live"),
    sunsetAt: ts("sunset_at"),
    /** Fiche publique : licence, paramètres, mesures sourcées (G3). */
    sheet: jsonb("sheet").$type<ModelSheet>().notNull().default({}),
    /** Consignes de routage amont (OpenRouter) : collecte des données, prix plafond, hébergeurs. */
    routing: jsonb("routing").$type<ModelRouting>().notNull().default({}),
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
      "models_availability_check",
      sql`${t.availability} IN (${inList(MODEL_AVAILABILITIES)})`,
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

/** Quatre tarifs par million de jetons, en chaînes décimales (micro-unités). */
export interface PriceSetRow {
  input: string;
  output: string;
  cache: string | null;
  cacheWrite: string | null;
}

/**
 * Plage horaire UTC où le prix baisse (DeepSeek : creux). `upstream` en micro-USD, `sell` en micro-CAD.
 * Une plage ne peut que baisser le prix de base.
 */
export interface PriceWindowRow {
  label: string;
  days: number[];
  startMinute: number;
  endMinute: number;
  upstream: PriceSetRow;
  sell: PriceSetRow;
}

/**
 * Route de secours d'un modèle (G6) : le même modèle chez un autre fournisseur (DeepInfra, OpenRouter…), essayé
 * quand la route principale (`models.provider_id` / `upstream_id`) échoue. `position` ≥ 1 donne l'ordre.
 * Prix amont propre à la route en micro-USD par million (null = comme le prix du modèle) : il sert à
 * garantir le plancher de marge sur CHAQUE route et à calculer le coût amont quand elle a servi.
 */
export const modelRoutes = pgTable(
  "model_routes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelId: uuid("model_id")
      .notNull()
      .references(() => models.id, { onDelete: "restrict" }),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => modelProviders.id, { onDelete: "restrict" }),
    upstreamId: text("upstream_id").notNull(),
    position: integer("position").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    upstreamInputUsdMicro: micro("upstream_input_usd_micro"),
    upstreamOutputUsdMicro: micro("upstream_output_usd_micro"),
    upstreamCacheUsdMicro: micro("upstream_cache_usd_micro"),
    note: text("note").notNull().default(""),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("model_routes_position_unique").on(t.modelId, t.position),
    index("model_routes_provider_idx").on(t.providerId),
    check("model_routes_position_pos", sql`${t.position} >= 1`),
    check(
      "model_routes_price_pair",
      sql`(${t.upstreamInputUsdMicro} IS NULL) = (${t.upstreamOutputUsdMicro} IS NULL)`,
    ),
    check(
      "model_routes_price_nonneg",
      sql`COALESCE(${t.upstreamInputUsdMicro}, 0) >= 0 AND COALESCE(${t.upstreamOutputUsdMicro}, 0) >= 0`,
    ),
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
    /** Écriture du cache facturée à part par l'éditeur (Kimi) ; null : tarif d'entrée. */
    upstreamCacheWriteUsdMicro: micro("upstream_cache_write_usd_micro"),
    sellCacheWriteCadMicro: micro("sell_cache_write_cad_micro"),
    /** Plages horaires UTC où le prix baisse ; vide : un seul prix toute la semaine. */
    windows: jsonb("windows").$type<PriceWindowRow[]>().notNull().default([]),
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
    /**
     * Permission WebPilot : opérations permises (`search`, `scrape`, `crawl`, `extract`, `sessions`). Null (défaut) :
     * la clé n'a PAS accès à WebPilot tant qu'une personne ne l'a pas cochée.
     */
    webpilotOperations: jsonb("webpilot_operations").$type<string[] | null>(),
    /**
     * Permission RAG : bases accessibles et droits (`read` ou `write`). Null (défaut) : la clé n'a PAS accès au RAG.
     * Les bases appartiennent toutes à l'organisation de la clé (vérifié à la création et à chaque requête).
     */
    ragAccess: jsonb("rag_access").$type<{
      bases: string[];
      mode: "read" | "write";
    } | null>(),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("api_keys_hash_unique").on(t.keyHash),
    index("api_keys_org_idx").on(t.organizationId, t.createdAt),
    check("api_keys_spent_nonneg", sql`${t.spentMicro} >= 0`),
  ],
);

export const BILLING_MODES = ["standard", "house"] as const;
export type BillingMode = (typeof BILLING_MODES)[number];

/**
 * Mode de facturation d'une organisation. Absente de cette table = `standard`. `house` : organisation
 * « maison » (accès gratuit du fondateur et de l'équipe) : ses requêtes passent sans solde et sans
 * débit ; l'usage, la valeur offerte et le coût amont réel sont comptés comme pour les autres.
 * Table à part : celles de l'authentification suivent le schéma de Better Auth.
 */
export const organizationBilling = pgTable(
  "organization_billing",
  {
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    mode: text("mode").$type<BillingMode>().notNull().default("standard"),
    setBy: text("set_by"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "organization_billing_mode_check",
      sql`${t.mode} IN (${inList(BILLING_MODES)})`,
    ),
  ],
);

export const USAGE_STATUSES = ["ok", "error", "aborted"] as const;
export type UsageStatus = (typeof USAGE_STATUSES)[number];

/**
 * D'où viennent les jetons facturés d'un événement d'usage (audit de précision F-02, F-03, F-13) :
 * - `provider` : le bloc `usage` de l'amont, complet et cohérent ;
 * - `estimated_missing` : usage absent, nul ou incomplet alors qu'une réponse a été livrée (repli estimé) ;
 * - `estimated_aborted` : le client a annulé (ou le serveur s'est arrêté) avant la fin : invite estimée, rien de plus ;
 * - `estimated_interrupted` : l'amont a coupé le flux sans bloc `usage` ni `[DONE]` ;
 * - `settled_by_recovery` : requête perdue (arrêt du serveur entre la réservation et le règlement), réglée au repli
 *   estimé (invite seule) par la reprise du grand livre ; la réconciliation compare ensuite à l'amont ;
 * - `none` : aucune facturation (échec avant toute réponse de l'amont).
 * NULL : événement antérieur à cette colonne (provenance inconnue).
 */
export const USAGE_SOURCES = [
  "provider",
  "estimated_missing",
  "estimated_aborted",
  "estimated_interrupted",
  "settled_by_recovery",
  "none",
] as const;
export type UsageSource = (typeof USAGE_SOURCES)[number];

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
    /** Jetons d'invite écrits en cache (inclus dans `prompt_tokens`). */
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    /** Jetons de raisonnement (inclus dans `completion_tokens`) : information, déjà facturés en sortie. */
    reasoningTokens: integer("reasoning_tokens").notNull().default(0),
    /** Prix de vente débité (micro-CAD) et coût amont (micro-USD). */
    costMicro: micro("cost_micro").notNull().default(sql`0`),
    /** Part de `cost_micro` facturée par exécution (agents hébergés, S7) ; 0 pour un modèle. */
    runFeeMicro: micro("run_fee_micro").notNull().default(sql`0`),
    /** Faux pour une organisation « maison » : rien n'a été débité (`cost_micro` = 0). */
    billed: boolean("billed").notNull().default(true),
    /** Valeur de la requête au prix public (micro-CAD) ; égale à `cost_micro` quand elle est facturée. */
    valueMicro: micro("value_micro").notNull().default(sql`0`),
    upstreamCostUsdMicro: micro("upstream_cost_usd_micro")
      .notNull()
      .default(sql`0`),
    /** Prix par million appliqués (instantané de la version de catalogue). */
    priceInputMicro: micro("price_input_micro").notNull().default(sql`0`),
    priceOutputMicro: micro("price_output_micro").notNull().default(sql`0`),
    priceCacheMicro: micro("price_cache_micro"),
    priceCacheWriteMicro: micro("price_cache_write_micro"),
    /** Étiquette de la plage horaire appliquée (« creux »), null = prix de base. */
    priceWindow: text("price_window"),
    /** Route qui a servi : 0 = principale, n = route de secours n (G6). */
    routePosition: integer("route_position").notNull().default(0),
    /** Coût rapporté par l'amont pour la requête (OpenRouter : `usage.cost`), micro-USD ; null = non rapporté. */
    reportedCostUsdMicro: micro("reported_cost_usd_micro"),
    /**
     * Coût rapporté par l'amont (OpenRouter : `usage.cost` ; DeepInfra : `usage.estimated_cost`) en NANO-USD, converti
     * sans flottant ; null = non rapporté (jamais 0 pour « absent »). Remplace `reported_cost_usd_micro` (arrondi, F-07),
     * conservé pour les lecteurs existants et le retour arrière.
     */
    reportedCostUsdNano: micro("reported_cost_usd_nano"),
    /** Coût amont calculé avec nos prix de route, en nano-USD (comparable au coût rapporté sans bruit d'arrondi). */
    upstreamCostUsdNano: micro("upstream_cost_usd_nano"),
    /** Provenance des jetons facturés (voir `USAGE_SOURCES`) ; null avant la migration. */
    usageSource: text("usage_source").$type<UsageSource>(),
    /** Identifiant d'appel LiteLLM (`x-litellm-call-id`) : clé de jointure vers `LiteLLM_SpendLogs.litellm_call_id`. */
    litellmCallId: text("litellm_call_id"),
    /** Coût rapporté par LiteLLM (`x-litellm-response-cost`), nano-USD ; second coût amont, indépendant de `usage.cost`. */
    litellmResponseCostNano: micro("litellm_response_cost_nano"),
    /** Identifiant de génération amont (OpenRouter « gen-… » : `id` du corps ou du premier fragment du flux). */
    upstreamGenerationId: text("upstream_generation_id"),
    /** Fournisseur réellement servi, tel que rapporté par l'amont (`provider` du corps) ; jamais montré au client. */
    upstreamProvider: text("upstream_provider"),
    /** Taux USD → CAD (micro-CAD par dollar) du catalogue en vigueur à la requête : change historisé par événement. */
    fxUsdToCadMicro: micro("fx_usd_to_cad_micro"),
    latencyMs: integer("latency_ms").notNull().default(0),
    reservationId: uuid("reservation_id"),
    /** WebPilot : unités facturées (pages lues sans navigateur, pages rendues par navigateur, minutes de session). */
    unitsPageStatic: integer("units_page_static").notNull().default(0),
    unitsPageBrowser: integer("units_page_browser").notNull().default(0),
    unitsBrowserMinute: integer("units_browser_minute").notNull().default(0),
    /** WebPilot : HÔTE visité (jamais l'adresse complète), pour l'audit du client (décision O-6). */
    destinationHost: text("destination_host"),
    /** Nexora Privacy Router : décision (`allow`, `mask`) et version de la politique appliquée. */
    privacyDecision: text("privacy_decision"),
    policyVersion: text("policy_version"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("usage_events_request_unique").on(t.requestId),
    index("usage_events_org_idx").on(t.organizationId, t.createdAt),
    index("usage_events_key_idx").on(t.apiKeyId, t.createdAt),
    // Jointures de la réconciliation : seulement les lignes qui portent l'identifiant (les autres n'ont rien à joindre).
    index("usage_events_generation_idx")
      .on(t.upstreamGenerationId)
      .where(sql`${t.upstreamGenerationId} IS NOT NULL`),
    index("usage_events_litellm_call_idx")
      .on(t.litellmCallId)
      .where(sql`${t.litellmCallId} IS NOT NULL`),
    index("usage_events_reconcilable_idx")
      .on(t.createdAt)
      .where(
        sql`${t.status} <> 'error' AND (${t.litellmCallId} IS NOT NULL OR ${t.upstreamGenerationId} IS NOT NULL)`,
      ),
    check(
      "usage_events_status_check",
      sql`${t.status} IN (${inList(USAGE_STATUSES)})`,
    ),
    check(
      "usage_events_usage_source_check",
      sql`${t.usageSource} IS NULL OR ${t.usageSource} IN (${inList(USAGE_SOURCES)})`,
    ),
    check(
      "usage_events_nonneg",
      sql`${t.costMicro} >= 0 AND ${t.promptTokens} >= 0 AND ${t.completionTokens} >= 0`,
    ),
  ],
);
