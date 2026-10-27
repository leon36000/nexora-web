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
import {
  HEALTH_STATES,
  type HealthState,
  MODEL_VISIBILITIES,
  type ModelVisibility,
  REGIONS,
  type Region,
} from "./schema-gateway.ts";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const micro = (name: string) => bigint(name, { mode: "bigint" });

/**
 * Agents hébergés (S7, D14) : les agents publiés sur une instance Nexora WorkStudio, vendus par la passerelle
 * sous `agent/<slug>`. Ces tables portent des prix et pointent vers une infrastructure : elles vivent dans la
 * base `app`, jamais dans Directus (D4, limite de 25 collections). L'administration passe par
 * `/api/admin/hosted-agents/*` (module Directus « Agents hébergés »). Aucune clé ici : seulement la RÉFÉRENCE
 * du coffre (D2).
 */

const inList = (values: readonly string[]) =>
  sql.raw(values.map((v) => `'${v}'`).join(", "));

/** Même cycle de vie et même visibilité que les modèles (brouillon → publié → retiré). */
export const AGENT_STATUSES = ["draft", "published", "retired"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];
export const AGENT_VISIBILITIES = MODEL_VISIBILITIES;
export type AgentVisibility = ModelVisibility;

/** Catégories affichées au catalogue ; leurs libellés viennent des dictionnaires. */
export const AGENT_CATEGORIES = [
  "general",
  "support",
  "documents",
  "ventes",
  "finance",
  "ressources_humaines",
  "autre",
] as const;
export type AgentCategory = (typeof AGENT_CATEGORIES)[number];

/** Instance WorkStudio amont. La clé d'espace (`sk-nexora-…`) n'est jamais ici : seulement `secret_ref`. */
export const hostedAgentInstances = pgTable(
  "hosted_agent_instances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Identifiant stable en minuscules. */
    code: text("code").notNull(),
    name: text("name").notNull(),
    /** Adresse vue par l'app (sans `/v1`), ex. `http://localhost:3200`. */
    baseUrl: text("base_url").notNull(),
    /** Référence du coffre (kind other) de la clé d'espace ; null = instance non utilisable. */
    secretRef: text("secret_ref"),
    /** Région d'hébergement déclarée par l'administrateur (affichée aux clients). */
    region: text("region").$type<Region>().notNull().default("quebec"),
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
    uniqueIndex("hosted_agent_instances_code_unique").on(t.code),
    check(
      "hosted_agent_instances_region_check",
      sql`${t.region} IN (${inList(REGIONS)})`,
    ),
    check(
      "hosted_agent_instances_health_check",
      sql`${t.healthState} IN (${inList(HEALTH_STATES)})`,
    ),
  ],
);

/** Agent hébergé, exposé sous l'identifiant public stable `agent/<slug>`. */
export const hostedAgents = pgTable(
  "hosted_agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    instanceId: uuid("instance_id")
      .notNull()
      .references(() => hostedAgentInstances.id, { onDelete: "restrict" }),
    /** Identifiant chez WorkStudio : `agent:<identifiant du workflow>` (stable) ou `agent:<nom>`. */
    upstreamId: text("upstream_id").notNull(),
    /** Nom vu à la dernière découverte (sert à retrouver l'agent si l'identifiant amont est remplacé). */
    upstreamName: text("upstream_name"),
    nameFr: text("name_fr").notNull().default(""),
    nameEn: text("name_en").notNull().default(""),
    descriptionFr: text("description_fr").notNull().default(""),
    descriptionEn: text("description_en").notNull().default(""),
    category: text("category")
      .$type<AgentCategory>()
      .notNull()
      .default("general"),
    status: text("status").$type<AgentStatus>().notNull().default("draft"),
    visibility: text("visibility")
      .$type<AgentVisibility>()
      .notNull()
      .default("public"),
    /**
     * Plafond de jetons (entrée + sortie) d'UNE exécution. Il borne le montant réservé au grand livre : un agent
     * consomme bien plus que le message reçu (consignes, connaissances, outils), et WorkStudio ne borne pas la
     * sortie. Le client n'est jamais débité au-delà de ce plafond.
     */
    runTokenCap: integer("run_token_cap").notNull().default(32000),
    lastSeenAt: ts("last_seen_at"),
    publishedAt: ts("published_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("hosted_agents_slug_unique").on(t.slug),
    uniqueIndex("hosted_agents_upstream_unique").on(t.instanceId, t.upstreamId),
    index("hosted_agents_instance_idx").on(t.instanceId),
    check(
      "hosted_agents_slug_check",
      sql`${t.slug} ~ '^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$'`,
    ),
    check("hosted_agents_upstream_check", sql`${t.upstreamId} LIKE 'agent:%'`),
    check(
      "hosted_agents_status_check",
      sql`${t.status} IN (${inList(AGENT_STATUSES)})`,
    ),
    check(
      "hosted_agents_visibility_check",
      sql`${t.visibility} IN (${inList(AGENT_VISIBILITIES)})`,
    ),
    check(
      "hosted_agents_category_check",
      sql`${t.category} IN (${inList(AGENT_CATEGORIES)})`,
    ),
    check(
      "hosted_agents_cap_check",
      sql`${t.runTokenCap} BETWEEN 1 AND 1000000`,
    ),
  ],
);

/**
 * Prix d'un agent (micro-CAD) : par MILLION de jetons (entrée, sortie) et/ou par exécution. Lignes IMMUABLES
 * (déclencheur SQL, comme `model_prices`) : changer un prix crée une ligne avec une nouvelle date d'effet.
 * `is_trial` marque une valeur d'ESSAI : elle s'affiche comme telle au public et n'est jamais une offre.
 */
export const hostedAgentPrices = pgTable(
  "hosted_agent_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => hostedAgents.id, { onDelete: "restrict" }),
    inputCadMicro: micro("input_cad_micro").notNull().default(sql`0`),
    outputCadMicro: micro("output_cad_micro").notNull().default(sql`0`),
    perRunCadMicro: micro("per_run_cad_micro").notNull().default(sql`0`),
    isTrial: boolean("is_trial").notNull().default(true),
    note: text("note").notNull().default(""),
    effectiveAt: ts("effective_at").notNull().defaultNow(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("hosted_agent_prices_agent_idx").on(t.agentId, t.effectiveAt),
    check(
      "hosted_agent_prices_nonneg",
      sql`${t.inputCadMicro} >= 0 AND ${t.outputCadMicro} >= 0 AND ${t.perRunCadMicro} >= 0`,
    ),
    // Jamais 0 $ (D3) : au moins une composante est positive.
    check(
      "hosted_agent_prices_not_free",
      sql`${t.inputCadMicro} > 0 OR ${t.outputCadMicro} > 0 OR ${t.perRunCadMicro} > 0`,
    ),
  ],
);

export const EMBED_POSITIONS = ["right", "left"] as const;
export type EmbedPosition = (typeof EMBED_POSITIONS)[number];

/**
 * Réglage de la bulle WorkStudio sur le site (une seule ligne `main`). `origin` est l'origine PUBLIQUE de
 * l'instance (celle que voit le navigateur), distincte de l'adresse interne d'une instance d'agents.
 */
export const workstudioEmbedSettings = pgTable(
  "workstudio_embed_settings",
  {
    id: text("id").primaryKey().default("main"),
    enabled: boolean("enabled").notNull().default(false),
    origin: text("origin"),
    chatIdentifier: text("chat_identifier"),
    /** Chemins du site (sans langue) où la bulle s'affiche, ex. `/agents`. */
    pages: jsonb("pages").$type<string[]>().notNull().default([]),
    position: text("position")
      .$type<EmbedPosition>()
      .notNull()
      .default("right"),
    /** Couleur hexadécimale (`#4F46E5`) ; null = couleur par défaut de la bulle. */
    color: text("color"),
    labelFr: text("label_fr"),
    labelEn: text("label_en"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("workstudio_embed_settings_single", sql`${t.id} = 'main'`),
    check(
      "workstudio_embed_settings_position_check",
      sql`${t.position} IN (${inList(EMBED_POSITIONS)})`,
    ),
  ],
);
