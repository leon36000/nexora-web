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

const ts = (name: string) => timestamp(name, { withTimezone: true });
const micro = (name: string) => bigint(name, { mode: "bigint" });

/**
 * Autogestion IA et SEO (S8, D9/D14). Ces tables vivent dans la base `app` (jamais dans Directus : limite de
 * 25 collections sans licence, et elles portent des montants). Aucune ne contient de secret : les clés des agents
 * et des adaptateurs sont des RÉFÉRENCES du Coffre (`vault_secrets.ref`).
 */

const inList = (values: readonly string[]) =>
  sql.raw(values.map((v) => `'${v}'`).join(", "));

/* -------------------------------------------------------------------------- */
/* Audits planifiés                                                             */
/* -------------------------------------------------------------------------- */

export const SEO_AUDIT_KINDS = [
  "structure",
  "links",
  "a11y",
  "perf",
  "all",
] as const;
export type SeoAuditKind = (typeof SEO_AUDIT_KINDS)[number];
export const SEO_AUDIT_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
] as const;
export type SeoAuditStatus = (typeof SEO_AUDIT_STATUSES)[number];

/** Un passage d'audit (liens, accessibilité, performance, structure SEO) sur les pages publiées. */
export const seoAudits = pgTable(
  "seo_audits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").$type<SeoAuditKind>().notNull(),
    status: text("status").$type<SeoAuditStatus>().notNull().default("queued"),
    /** `schedule` (nuit) ou `manual` (module Directus). */
    trigger: text("trigger").notNull().default("schedule"),
    baseUrl: text("base_url"),
    pagesChecked: integer("pages_checked").notNull().default(0),
    issuesFound: integer("issues_found").notNull().default(0),
    /** Détails par volet : { links: {...}, a11y: {...}, perf: {...}, structure: {...} } (jamais de secret). */
    summary: jsonb("summary")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    error: text("error"),
    createdAt: ts("created_at").notNull().defaultNow(),
    startedAt: ts("started_at"),
    finishedAt: ts("finished_at"),
  },
  (t) => [
    index("seo_audits_created_idx").on(t.createdAt),
    check(
      "seo_audits_kind_check",
      sql`${t.kind} IN (${inList(SEO_AUDIT_KINDS)})`,
    ),
    check(
      "seo_audits_status_check",
      sql`${t.status} IN (${inList(SEO_AUDIT_STATUSES)})`,
    ),
  ],
);

export const SEO_ISSUE_SEVERITIES = ["error", "warning", "info"] as const;
export type SeoIssueSeverity = (typeof SEO_ISSUE_SEVERITIES)[number];
export const SEO_ISSUE_STATUSES = ["open", "resolved", "ignored"] as const;
export type SeoIssueStatus = (typeof SEO_ISSUE_STATUSES)[number];

/**
 * Un problème constaté. Dédoublonné par `fingerprint` (volet + règle + URL + élément) : un audit qui le retrouve met
 * à jour `last_seen_at` et `audit_id` ; un audit qui ne le retrouve plus le passe à `resolved`.
 * Un problème `ignored` (décision humaine) n'est jamais rouvert par un audit.
 */
export const seoIssues = pgTable(
  "seo_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    auditId: uuid("audit_id").references(() => seoAudits.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull(),
    severity: text("severity").$type<SeoIssueSeverity>().notNull(),
    rule: text("rule").notNull(),
    url: text("url").notNull(),
    message: text("message").notNull(),
    detail: jsonb("detail")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    fingerprint: text("fingerprint").notNull(),
    status: text("status").$type<SeoIssueStatus>().notNull().default("open"),
    firstSeenAt: ts("first_seen_at").notNull().defaultNow(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    resolvedAt: ts("resolved_at"),
  },
  (t) => [
    uniqueIndex("seo_issues_fingerprint_unique").on(t.fingerprint),
    index("seo_issues_status_idx").on(t.status, t.severity, t.lastSeenAt),
    index("seo_issues_audit_idx").on(t.auditId),
    check(
      "seo_issues_severity_check",
      sql`${t.severity} IN (${inList(SEO_ISSUE_SEVERITIES)})`,
    ),
    check(
      "seo_issues_status_check",
      sql`${t.status} IN (${inList(SEO_ISSUE_STATUSES)})`,
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/* Indexation et adaptateurs off-page                                           */
/* -------------------------------------------------------------------------- */

/** Réglages SEO clé/valeur non secrets (ex. clé IndexNow, publique par conception : elle est servie à la racine). */
export const seoSettings = pgTable("seo_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const SEO_ADAPTER_KEYS = [
  "indexnow",
  "bing",
  "searchconsole",
  "dataforseo",
  "postiz",
] as const;
export type SeoAdapterKey = (typeof SEO_ADAPTER_KEYS)[number];

/**
 * État vérifié d'un adaptateur externe. L'état affiché (non connecté / connecté en lecture / autorisé en écriture)
 * se DÉDUIT de : clé présente dans le Coffre, dernière vérification réussie, et `write_enabled` (autorisation
 * humaine explicite, jamais donnée par un agent).
 */
export const seoAdapters = pgTable("seo_adapters", {
  key: text("key").$type<SeoAdapterKey>().primaryKey(),
  writeEnabled: boolean("write_enabled").notNull().default(false),
  lastCheckAt: ts("last_check_at"),
  /** `ok`, `error` ou `never`. */
  lastCheckStatus: text("last_check_status").notNull().default("never"),
  /** Message court, sans secret. */
  lastCheckDetail: text("last_check_detail"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Photographie du sitemap (URL → lastmod) au moment d'une indexation : base du diff suivant. */
export const sitemapSnapshots = pgTable(
  "sitemap_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    takenAt: ts("taken_at").notNull().defaultNow(),
    urls: jsonb("urls")
      .$type<Record<string, string | null>>()
      .notNull()
      .default({}),
    urlCount: integer("url_count").notNull().default(0),
  },
  (t) => [index("sitemap_snapshots_taken_idx").on(t.takenAt)],
);

export const INDEXING_STATUSES = [
  "dry_run",
  "submitted",
  "failed",
  "skipped",
] as const;
export type IndexingStatus = (typeof INDEXING_STATUSES)[number];

/** Journal des soumissions d'URL aux moteurs. `skipped` : aucune clé ou adaptateur non autorisé en écriture. */
export const indexingSubmissions = pgTable(
  "indexing_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engine: text("engine").notNull(),
    trigger: text("trigger").notNull(),
    urlCount: integer("url_count").notNull().default(0),
    /** Échantillon des URL (au plus 50) : le journal n'est pas une copie du sitemap. */
    urlsSample: jsonb("urls_sample").$type<string[]>().notNull().default([]),
    status: text("status").$type<IndexingStatus>().notNull(),
    httpStatus: integer("http_status"),
    detail: text("detail"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("indexing_submissions_created_idx").on(t.createdAt),
    check(
      "indexing_submissions_status_check",
      sql`${t.status} IN (${inList(INDEXING_STATUSES)})`,
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/* Agents du site (D9)                                                          */
/* -------------------------------------------------------------------------- */

export const SITE_AGENT_KEYS = [
  "redacteur",
  "traducteur",
  "seo",
  "veille",
  "sante",
] as const;
export type SiteAgentKey = (typeof SITE_AGENT_KEYS)[number];

export const SITE_AGENT_STATES = [
  "idle",
  "running",
  "error",
  "budget_exceeded",
  "disabled",
] as const;
export type SiteAgentState = (typeof SITE_AGENT_STATES)[number];

/**
 * Un agent du site : mission, modèle, budget mensuel (micro-CAD), activé, dernier passage, jetons, coût, état, erreur.
 * `gateway_key_ref` et `directus_token_ref` sont des références du Coffre (jamais les valeurs).
 */
export const siteAgents = pgTable(
  "site_agents",
  {
    key: text("key").$type<SiteAgentKey>().primaryKey(),
    name: text("name").notNull(),
    mission: text("mission").notNull(),
    /** Identifiant PUBLIC du modèle de la passerelle (ex. `nexora/glm-5-3`) ; null pour un agent sans modèle. */
    model: text("model"),
    enabled: boolean("enabled").notNull().default(false),
    /** Budget MENSUEL en micro-CAD (1 CAD = 1 000 000). 0 = aucun appel de modèle possible. */
    budgetMicro: micro("budget_micro").notNull().default(sql`0`),
    state: text("state").$type<SiteAgentState>().notNull().default("disabled"),
    lastRunAt: ts("last_run_at"),
    promptTokensTotal: bigint("prompt_tokens_total", { mode: "number" })
      .notNull()
      .default(0),
    completionTokensTotal: bigint("completion_tokens_total", { mode: "number" })
      .notNull()
      .default(0),
    costTotalMicro: micro("cost_total_micro").notNull().default(sql`0`),
    lastError: text("last_error"),
    /** Clé de la passerelle (`api_keys.id`) créée pour cet agent dans l'organisation interne. */
    gatewayKeyId: uuid("gateway_key_id"),
    gatewayKeyRef: text("gateway_key_ref"),
    directusTokenRef: text("directus_token_ref"),
    /** Réglages propres à l'agent (ex. URL de source de la veille). Jamais de secret. */
    config: jsonb("config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "site_agents_state_check",
      sql`${t.state} IN (${inList(SITE_AGENT_STATES)})`,
    ),
    check("site_agents_budget_nonneg", sql`${t.budgetMicro} >= 0`),
  ],
);

export const SITE_AGENT_RUN_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "stopped",
  "budget_exceeded",
] as const;
export type SiteAgentRunStatus = (typeof SITE_AGENT_RUN_STATUSES)[number];

export interface SiteAgentRunEvent {
  at: string;
  /** `info`, `warn` ou `error`. */
  level: string;
  message: string;
}

/** Une exécution d'agent : entrée (brief), sortie (références, jamais de secret), jetons, coût, journal borné. */
export const siteAgentRuns = pgTable(
  "site_agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentKey: text("agent_key")
      .$type<SiteAgentKey>()
      .notNull()
      .references(() => siteAgents.key, { onDelete: "restrict" }),
    /** `manual`, `schedule` ou `event`. */
    trigger: text("trigger").notNull().default("manual"),
    status: text("status")
      .$type<SiteAgentRunStatus>()
      .notNull()
      .default("queued"),
    input: jsonb("input")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    output: jsonb("output")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    model: text("model"),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    costMicro: micro("cost_micro").notNull().default(sql`0`),
    error: text("error"),
    events: jsonb("events").$type<SiteAgentRunEvent[]>().notNull().default([]),
    jobId: uuid("job_id"),
    requestedBy: text("requested_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    startedAt: ts("started_at"),
    finishedAt: ts("finished_at"),
  },
  (t) => [
    index("site_agent_runs_agent_idx").on(t.agentKey, t.createdAt),
    index("site_agent_runs_status_idx").on(t.status),
    check(
      "site_agent_runs_status_check",
      sql`${t.status} IN (${inList(SITE_AGENT_RUN_STATUSES)})`,
    ),
    check("site_agent_runs_cost_nonneg", sql`${t.costMicro} >= 0`),
  ],
);

export type SiteAgent = typeof siteAgents.$inferSelect;
export type SiteAgentRun = typeof siteAgentRuns.$inferSelect;
export type SeoAudit = typeof seoAudits.$inferSelect;
export type SeoIssue = typeof seoIssues.$inferSelect;
