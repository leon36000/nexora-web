import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./schema-auth.ts";
import { apiKeys } from "./schema-gateway.ts";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const micro = (name: string) => bigint(name, { mode: "bigint" });

/**
 * Nexora WebPilot (API de recherche, de lecture, d'exploration et d'extraction du Web) : feuille de prix versionnée
 * et tâches asynchrones. Contrat : docs/superpowers/specs/2026-10-29-webpilot-contrat-api.md. Ces tables portent des
 * montants et des identifiants clients : elles vivent dans la base `app`, jamais dans Directus (D4). Les prix sont
 * des PARAMÈTRES du catalogue (aucun prix n'est fixé dans le code) ; les clés, le solde et le grand livre sont ceux de
 * la passerelle (`api_keys`, `credit_*`, `usage_events`).
 */

const inList = (values: readonly string[]) =>
  sql.raw(values.map((v) => `'${v}'`).join(", "));

/** Unités facturées : une page lue sans navigateur, une page rendue par navigateur, une minute de session. */
export const WEBPILOT_UNITS = [
  "page_static",
  "page_browser",
  "browser_minute",
] as const;
export type WebpilotUnit = (typeof WEBPILOT_UNITS)[number];

/** Opérations qu'une clé peut recevoir (permission `webpilot`, à cocher : désactivée par défaut). */
export const WEBPILOT_OPERATIONS = [
  "search",
  "scrape",
  "crawl",
  "extract",
  "sessions",
] as const;
export type WebpilotOperation = (typeof WEBPILOT_OPERATIONS)[number];

export const WEBPILOT_SHEET_STATUSES = ["draft", "published"] as const;
export type WebpilotSheetStatus = (typeof WEBPILOT_SHEET_STATUSES)[number];

/**
 * Feuille de prix : un ensemble de prix par unité, avec sa date d'entrée en vigueur. Brouillon → publié (une seule
 * fois, déclencheur SQL) ; une feuille publiée ne change jamais, ses lignes non plus : changer un prix crée une
 * nouvelle feuille. Sans feuille publiée en vigueur, WebPilot répond 503 aux organisations clientes.
 */
export const webpilotPriceSheets = pgTable(
  "webpilot_price_sheets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    version: integer("version").notNull().generatedAlwaysAsIdentity(),
    status: text("status")
      .$type<WebpilotSheetStatus>()
      .notNull()
      .default("draft"),
    effectiveAt: ts("effective_at").notNull().defaultNow(),
    /** Plancher de marge sur le coût amont converti (points de base) : une publication sous ce plancher est refusée. */
    marginFloorBps: integer("margin_floor_bps").notNull().default(0),
    note: text("note").notNull().default(""),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    publishedAt: ts("published_at"),
  },
  (t) => [
    uniqueIndex("webpilot_price_sheets_version_unique").on(t.version),
    index("webpilot_price_sheets_effective_idx").on(t.status, t.effectiveAt),
    check(
      "webpilot_price_sheets_status_check",
      sql`${t.status} IN (${inList(WEBPILOT_SHEET_STATUSES)})`,
    ),
    check("webpilot_price_sheets_floor_nonneg", sql`${t.marginFloorBps} >= 0`),
  ],
);

/** Prix d'une unité dans une feuille : vente en micro-CAD, coût amont en micro-USD. Lignes immuables. */
export const webpilotPriceItems = pgTable(
  "webpilot_price_items",
  {
    sheetId: uuid("sheet_id")
      .notNull()
      .references(() => webpilotPriceSheets.id, { onDelete: "restrict" }),
    unit: text("unit").$type<WebpilotUnit>().notNull(),
    sellCadMicro: micro("sell_cad_micro").notNull(),
    upstreamUsdMicro: micro("upstream_usd_micro").notNull().default(sql`0`),
  },
  (t) => [
    primaryKey({ columns: [t.sheetId, t.unit] }),
    check(
      "webpilot_price_items_unit_check",
      sql`${t.unit} IN (${inList(WEBPILOT_UNITS)})`,
    ),
    check(
      "webpilot_price_items_nonneg",
      sql`${t.sellCadMicro} >= 0 AND ${t.upstreamUsdMicro} >= 0`,
    ),
  ],
);

export const WEBPILOT_TASK_KINDS = ["crawl"] as const;
export type WebpilotTaskKind = (typeof WEBPILOT_TASK_KINDS)[number];
export const WEBPILOT_TASK_STATUSES = [
  "queued",
  "running",
  "completed",
  "cancelled",
  "failed",
] as const;
export type WebpilotTaskStatus = (typeof WEBPILOT_TASK_STATUSES)[number];

/** Paramètres d'une exploration (copie de ce que l'appelant a demandé, après validation). */
export interface WebpilotCrawlParams {
  url: string;
  limit: number;
  maxDepth: number;
  includePaths: string[];
  excludePaths: string[];
  sameOriginOnly: boolean;
  formats: string[];
  onlyMainContent: boolean;
}

/** Frontière d'une exploration : adresses à lire (avec profondeur) et empreintes des adresses déjà vues. */
export interface WebpilotCrawlState {
  queue: { url: string; depth: number }[];
  seen: string[];
}

/**
 * Tâches asynchrones de WebPilot (exploration). Les résultats sont gardés le temps nécessaire à la lecture
 * (`expires_at`, paramétrable) puis effacés par le worker. La réservation courante (`reservation_id`) couvre les
 * pages restantes : à chaque lot, le worker règle la tranche et en réserve une nouvelle dans la même transaction.
 */
export const webpilotTasks = pgTable(
  "webpilot_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    apiKeyId: uuid("api_key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: "restrict" }),
    kind: text("kind").$type<WebpilotTaskKind>().notNull(),
    status: text("status")
      .$type<WebpilotTaskStatus>()
      .notNull()
      .default("queued"),
    params: jsonb("params").$type<WebpilotCrawlParams>().notNull(),
    state: jsonb("state")
      .$type<WebpilotCrawlState>()
      .notNull()
      .default({ queue: [], seen: [] }),
    pagesLimit: integer("pages_limit").notNull(),
    pagesDone: integer("pages_done").notNull().default(0),
    /** Pages écartées sans être lues ni facturées (robots.txt, politique, erreur de la cible). */
    pagesSkipped: integer("pages_skipped").notNull().default(0),
    /** Nombre de lots réglés : sert à rendre chaque lot (clé d'idempotence) unique et rejouable. */
    batchesDone: integer("batches_done").notNull().default(0),
    /** Prix figés à la création (une exploration garde son prix de départ). */
    sellCadMicro: micro("sell_cad_micro").notNull().default(sql`0`),
    upstreamUsdMicro: micro("upstream_usd_micro").notNull().default(sql`0`),
    configVersion: text("config_version").notNull(),
    /** Faux pour une organisation « maison » : aucune réservation ni débit. */
    billed: boolean("billed").notNull().default(true),
    reservationId: uuid("reservation_id"),
    reservedMicro: micro("reserved_micro").notNull().default(sql`0`),
    costMicro: micro("cost_micro").notNull().default(sql`0`),
    privacyDecision: text("privacy_decision"),
    policyVersion: text("policy_version"),
    errorCode: text("error_code"),
    cancelRequested: boolean("cancel_requested").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
    startedAt: ts("started_at"),
    finishedAt: ts("finished_at"),
    /** Fin de conservation des résultats ; fixée à la fin de la tâche. */
    expiresAt: ts("expires_at"),
  },
  (t) => [
    index("webpilot_tasks_org_idx").on(t.organizationId, t.createdAt),
    index("webpilot_tasks_status_idx").on(t.status),
    index("webpilot_tasks_expiry_idx").on(t.expiresAt),
    check(
      "webpilot_tasks_kind_check",
      sql`${t.kind} IN (${inList(WEBPILOT_TASK_KINDS)})`,
    ),
    check(
      "webpilot_tasks_status_check",
      sql`${t.status} IN (${inList(WEBPILOT_TASK_STATUSES)})`,
    ),
    check(
      "webpilot_tasks_counts",
      sql`${t.pagesLimit} > 0 AND ${t.pagesDone} >= 0 AND ${t.pagesSkipped} >= 0 AND ${t.costMicro} >= 0`,
    ),
  ],
);

/** Une page lue par une exploration. Effacée avec la tâche. */
export const webpilotTaskResults = pgTable(
  "webpilot_task_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => webpilotTasks.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    url: text("url").notNull(),
    httpStatus: integer("http_status").notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("webpilot_task_results_seq_unique").on(t.taskId, t.seq)],
);
