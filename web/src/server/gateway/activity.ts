import {
  type Database,
  sql,
  USAGE_STATUSES,
  type UsageStatus,
} from "@nexora/db";
import type { SQL } from "drizzle-orm";

/**
 * Activité de la passerelle d'UNE organisation (espace client, façon OpenRouter) : synthèse, répartitions par
 * modèle, par agent, par clé et par jour, journal des requêtes avec curseur, et itération pour l'export.
 *
 * Source unique : la table `usage_events`, qui ne contient que des métadonnées (jamais le contenu d'une requête ni
 * d'une réponse). Chaque requête SQL commence par `organization_id = …` : l'organisation vient de la session,
 * jamais d'un paramètre, et la jointure sur `api_keys` est elle-même bornée à la même organisation. Les montants
 * (micro-CAD) sont lus en texte puis convertis en `bigint` : aucun flottant ne touche un montant.
 */

/** Périodes proposées dans l'interface ; la valeur sert aussi de paramètre `period` de l'API. */
export const ACTIVITY_PERIODS = ["24h", "7d", "30d", "90d"] as const;
export type ActivityPeriod = (typeof ACTIVITY_PERIODS)[number];

const DAY_MS = 86_400_000;
const PERIOD_MS: Record<ActivityPeriod, number> = {
  "24h": DAY_MS,
  "7d": 7 * DAY_MS,
  "30d": 30 * DAY_MS,
  "90d": 90 * DAY_MS,
};
export const DEFAULT_PERIOD: ActivityPeriod = "30d";

/** Largeur maximale d'une période personnalisée. */
export const MAX_RANGE_DAYS = 366;
export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;
/** Nombre maximal de lignes d'un export CSV (les plus récentes d'abord). */
export const MAX_EXPORT_ROWS = 100_000;
/** Taille des paquets lus pour un export : borne la mémoire, quel que soit le nombre de lignes. */
const EXPORT_PAGE_SIZE = 1000;
/** Nombre maximal de lignes d'une répartition par modèle, agent ou clé. */
const BREAKDOWN_LIMIT = 50;
const MODEL_LIST_LIMIT = 200;

/** Jour calendaire du tableau d'usage existant (`usageByDayAndModel`). */
const DAY_TIME_ZONE = "America/Toronto";

/** Fenêtre de temps : `from` inclus, `to` exclu. */
export interface ActivityWindow {
  from: Date;
  to: Date;
}

/** Ce que l'utilisateur choisit (tout sauf l'organisation, qui vient de la session). */
export interface ActivityCriteria extends ActivityWindow {
  model?: string;
  apiKeyId?: string;
  status?: UsageStatus;
}

export interface ActivityFilter extends ActivityCriteria {
  organizationId: string;
}

export interface ActivityCursor {
  /** Horodatage exact de PostgreSQL, à la microseconde : `2026-10-29T12:34:56.123456Z`. */
  createdAt: string;
  id: string;
}

export type ActivityQueryError =
  | "invalid_period"
  | "invalid_range"
  | "range_too_long"
  | "invalid_model"
  | "invalid_key"
  | "invalid_status"
  | "invalid_limit"
  | "invalid_cursor";

export type ParsedActivityQuery =
  | {
      ok: true;
      period: ActivityPeriod | "custom";
      filter: ActivityCriteria;
      limit: number;
      cursor: ActivityCursor | null;
    }
  | { ok: false; error: ActivityQueryError };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/;
const CURSOR_RE = /^[A-Za-z0-9_-]{1,200}$/;
const CURSOR_TS_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.\d{6}Z$/;

const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Vrai si les composantes forment une date et une heure réelles (le 31 février n'existe pas). */
function validParts(
  y: number,
  mo: number,
  d: number,
  h = 0,
  mi = 0,
  s = 0,
): boolean {
  return (
    y >= 1970 &&
    mo >= 1 &&
    mo <= 12 &&
    d >= 1 &&
    d <= daysInMonth(y, mo) &&
    h <= 23 &&
    mi <= 59 &&
    s <= 59
  );
}

/** Date ISO 8601 : « 2026-10-01 » (minuit UTC) ou date-heure AVEC fuseau (« Z » ou « +HH:MM »). */
function parseBound(text: string): Date | null {
  const m = DATE_RE.exec(text);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6]].map((v) =>
    v === undefined ? 0 : Number(v),
  ) as [number, number, number, number, number, number];
  if (!validParts(y, mo, d, h, mi, s)) return null;
  const zone = m[7];
  if (zone && zone !== "Z") {
    const [zh, zm] = zone.slice(1).split(":").map(Number) as [number, number];
    if (zh > 23 || zm > 59) return null;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function validModel(text: string): boolean {
  if (text.length < 1 || text.length > 200) return false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return false;
  }
  return true;
}

export function encodeCursor(cursor: ActivityCursor): string {
  return Buffer.from(`${cursor.createdAt}|${cursor.id}`, "utf8").toString(
    "base64url",
  );
}

/** Décode un curseur produit par `encodeCursor` ; null pour tout autre texte (jamais d'exception). */
export function decodeCursor(text: string): ActivityCursor | null {
  if (!CURSOR_RE.test(text)) return null;
  const parts = Buffer.from(text, "base64url").toString("utf8").split("|");
  if (parts.length !== 2) return null;
  const [createdAt, id] = parts as [string, string];
  const ts = CURSOR_TS_RE.exec(createdAt);
  if (!ts || !UUID_RE.test(id)) return null;
  const [y, mo, d, h, mi, s] = ts.slice(1, 7).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (!validParts(y, mo, d, h, mi, s)) return null;
  return { createdAt, id: id.toLowerCase() };
}

/**
 * Lecture et validation des paramètres de l'URL (page et API partagent le même vocabulaire) :
 * `period` (24h, 7d, 30d, 90d) OU `from` + `to` (au plus 366 jours), `model`, `key`, `status`, `limit`, `cursor`.
 * Une valeur vide équivaut à l'absence du paramètre (un formulaire GET envoie les listes sur « tous »).
 */
export function parseActivityParams(
  params: URLSearchParams,
  now: Date,
): ParsedActivityQuery {
  const get = (name: string) => {
    const value = params.get(name);
    return value === null || value === "" ? undefined : value;
  };
  const fail = (error: ActivityQueryError) => ({ ok: false, error }) as const;

  const period = get("period");
  const fromText = get("from");
  const toText = get("to");
  let window: ActivityWindow;
  let label: ActivityPeriod | "custom";
  if (fromText !== undefined || toText !== undefined) {
    if (period !== undefined || fromText === undefined || toText === undefined)
      return fail("invalid_range");
    const from = parseBound(fromText);
    const to = parseBound(toText);
    if (!from || !to || to.getTime() <= from.getTime())
      return fail("invalid_range");
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS)
      return fail("range_too_long");
    window = { from, to };
    label = "custom";
  } else {
    const chosen = period ?? DEFAULT_PERIOD;
    if (!(ACTIVITY_PERIODS as readonly string[]).includes(chosen))
      return fail("invalid_period");
    label = chosen as ActivityPeriod;
    window = {
      from: new Date(now.getTime() - PERIOD_MS[label]),
      to: now,
    };
  }

  const filter: ActivityCriteria = { ...window };
  const model = get("model");
  if (model !== undefined) {
    if (!validModel(model)) return fail("invalid_model");
    filter.model = model;
  }
  const key = get("key");
  if (key !== undefined) {
    if (!UUID_RE.test(key)) return fail("invalid_key");
    filter.apiKeyId = key.toLowerCase();
  }
  const status = get("status");
  if (status !== undefined) {
    if (!(USAGE_STATUSES as readonly string[]).includes(status))
      return fail("invalid_status");
    filter.status = status as UsageStatus;
  }

  let limit = DEFAULT_LIMIT;
  const limitText = get("limit");
  if (limitText !== undefined) {
    if (!/^[1-9]\d{0,2}$/.test(limitText) || Number(limitText) > MAX_LIMIT)
      return fail("invalid_limit");
    limit = Number(limitText);
  }

  let cursor: ActivityCursor | null = null;
  const cursorText = get("cursor");
  if (cursorText !== undefined) {
    cursor = decodeCursor(cursorText);
    if (!cursor) return fail("invalid_cursor");
  }
  return { ok: true, period: label, filter, limit, cursor };
}

/** Condition commune de toutes les lectures : l'organisation d'abord, puis la fenêtre et les filtres. */
function whereOf(f: ActivityFilter, withFilters = true): SQL {
  const parts: SQL[] = [
    sql`e.organization_id = ${f.organizationId}`,
    sql`e.created_at >= ${f.from.toISOString()}::timestamptz`,
    sql`e.created_at < ${f.to.toISOString()}::timestamptz`,
  ];
  if (withFilters) {
    if (f.model !== undefined) parts.push(sql`e.model_public_id = ${f.model}`);
    if (f.apiKeyId !== undefined)
      parts.push(sql`e.api_key_id = ${f.apiKeyId}::uuid`);
    if (f.status !== undefined) parts.push(sql`e.status = ${f.status}`);
  }
  return sql.join(parts, sql` AND `);
}

export interface ActivitySummary {
  requests: number;
  errors: number;
  promptTokens: number;
  completionTokens: number;
  /** Jetons d'entrée servis par le cache (déjà comptés dans `promptTokens`). */
  cachedTokens: number;
  /** Dépense facturée (micro-CAD). */
  costMicro: bigint;
  /** Valeur au prix public (micro-CAD) : égale à la dépense, sauf pour une organisation « maison » (dépense nulle). */
  valueMicro: bigint;
  /** Latence moyenne de toutes les requêtes de la période, en millisecondes entières ; null sans requête. */
  avgLatencyMs: number | null;
}

export async function activitySummary(
  db: Database,
  filter: ActivityFilter,
): Promise<ActivitySummary> {
  const rows = await db.execute<{
    requests: string;
    errors: string;
    prompt: string;
    completion: string;
    cached: string;
    cost: string;
    value: string;
    latency: string | null;
  }>(sql`
    SELECT count(*)::text AS requests,
           (count(*) FILTER (WHERE e.status = 'error'))::text AS errors,
           COALESCE(sum(e.prompt_tokens), 0)::text AS prompt,
           COALESCE(sum(e.completion_tokens), 0)::text AS completion,
           COALESCE(sum(e.cached_tokens), 0)::text AS cached,
           COALESCE(sum(e.cost_micro), 0)::text AS cost,
           COALESCE(sum(e.value_micro), 0)::text AS value,
           round(avg(e.latency_ms))::text AS latency
    FROM usage_events e
    WHERE ${whereOf(filter)}
  `);
  const r = [...rows][0];
  if (!r) throw new Error("synthèse de l'activité : aucune ligne");
  return {
    requests: Number(r.requests),
    errors: Number(r.errors),
    promptTokens: Number(r.prompt),
    completionTokens: Number(r.completion),
    cachedTokens: Number(r.cached),
    costMicro: BigInt(r.cost),
    valueMicro: BigInt(r.value),
    avgLatencyMs: r.latency === null ? null : Number(r.latency),
  };
}

export type BreakdownDimension = "model" | "agent" | "key" | "day";

export interface BreakdownRow {
  /** Modèle, `agent/<identifiant>`, identifiant de clé ou jour (AAAA-MM-JJ, heure de Montréal). */
  key: string;
  /** Texte à afficher : le nom de la clé, sinon la clé elle-même. */
  label: string;
  /** Début de la clé d'API (dimension « key » seulement). */
  keyPrefix: string | null;
  requests: number;
  errors: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  costMicro: bigint;
  valueMicro: bigint;
}

const AGENT_PREFIX_LIKE = "agent/%";

/**
 * Répartition de la période. « model » exclut les agents (`agent/…`) et « agent » ne garde qu'eux ; les modèles et
 * les agents sont classés par dépense décroissante, les jours par ordre chronologique.
 */
export async function activityBreakdown(
  db: Database,
  filter: ActivityFilter,
  dimension: BreakdownDimension,
): Promise<BreakdownRow[]> {
  const extra =
    dimension === "model"
      ? sql` AND e.model_public_id NOT LIKE ${AGENT_PREFIX_LIKE}`
      : dimension === "agent"
        ? sql` AND e.model_public_id LIKE ${AGENT_PREFIX_LIKE}`
        : sql``;
  const keyExpr =
    dimension === "key"
      ? sql`e.api_key_id::text`
      : dimension === "day"
        ? sql`to_char((e.created_at AT TIME ZONE ${sql.raw(`'${DAY_TIME_ZONE}'`)})::date, 'YYYY-MM-DD')`
        : sql`e.model_public_id`;
  // Position (1) plutôt que l'expression : une valeur liée ($n) dans le SELECT et une autre dans le GROUP BY
  // ne seraient pas reconnues comme identiques par PostgreSQL.
  const group =
    dimension === "key" ? sql`e.api_key_id, k.name, k.prefix` : sql`1`;
  const order =
    dimension === "day"
      ? sql`ORDER BY 1 ASC`
      : sql`ORDER BY sum(e.cost_micro) DESC, count(*) DESC, 1 ASC LIMIT ${BREAKDOWN_LIMIT}`;
  const rows = await db.execute<{
    key: string;
    label: string | null;
    prefix: string | null;
    requests: string;
    errors: string;
    prompt: string;
    completion: string;
    cached: string;
    cost: string;
    value: string;
  }>(sql`
    SELECT ${keyExpr} AS key,
           ${dimension === "key" ? sql`k.name` : sql`NULL::text`} AS label,
           ${dimension === "key" ? sql`k.prefix` : sql`NULL::text`} AS prefix,
           count(*)::text AS requests,
           (count(*) FILTER (WHERE e.status = 'error'))::text AS errors,
           COALESCE(sum(e.prompt_tokens), 0)::text AS prompt,
           COALESCE(sum(e.completion_tokens), 0)::text AS completion,
           COALESCE(sum(e.cached_tokens), 0)::text AS cached,
           COALESCE(sum(e.cost_micro), 0)::text AS cost,
           COALESCE(sum(e.value_micro), 0)::text AS value
    FROM usage_events e
    ${
      dimension === "key"
        ? sql`LEFT JOIN api_keys k ON k.id = e.api_key_id AND k.organization_id = e.organization_id`
        : sql``
    }
    WHERE ${whereOf(filter)}${extra}
    GROUP BY ${group}
    ${order}
  `);
  return [...rows].map((r) => ({
    key: r.key,
    label: r.label ?? r.key,
    keyPrefix: r.prefix,
    requests: Number(r.requests),
    errors: Number(r.errors),
    promptTokens: Number(r.prompt),
    completionTokens: Number(r.completion),
    cachedTokens: Number(r.cached),
    costMicro: BigInt(r.cost),
    valueMicro: BigInt(r.value),
  }));
}

/** Modèles et agents vus dans la fenêtre (sans tenir compte des autres filtres), pour la liste de choix. */
export async function listActivityModels(
  db: Database,
  filter: ActivityFilter,
): Promise<string[]> {
  const rows = await db.execute<{ model: string }>(sql`
    SELECT DISTINCT e.model_public_id AS model
    FROM usage_events e
    WHERE ${whereOf(filter, false)}
    ORDER BY 1
    LIMIT ${MODEL_LIST_LIMIT}
  `);
  return [...rows].map((r) => r.model);
}

/** Une requête du journal : métadonnées seulement, la liste des propriétés est fermée. */
export interface ActivityRow {
  id: string;
  requestId: string;
  createdAt: Date;
  model: string;
  endpoint: string;
  apiKeyId: string;
  apiKeyName: string;
  apiKeyPrefix: string;
  status: UsageStatus;
  httpStatus: number;
  errorCode: string | null;
  stream: boolean;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  costMicro: bigint;
  valueMicro: bigint;
  /** Faux pour une organisation « maison » : rien n'a été débité. */
  billed: boolean;
  latencyMs: number;
}

export interface ActivityPage {
  rows: ActivityRow[];
  /** Curseur de la page suivante, null à la dernière page. */
  nextCursor: string | null;
}

type RawRow = {
  id: string;
  request_id: string;
  ts: string;
  model: string;
  endpoint: string;
  api_key_id: string;
  key_name: string | null;
  key_prefix: string | null;
  status: UsageStatus;
  http_status: number;
  error_code: string | null;
  stream: boolean;
  prompt: number;
  completion: number;
  cached: number;
  reasoning: number;
  cost: string;
  value: string;
  billed: boolean;
  latency: number;
};

/**
 * Journal des requêtes, du plus récent au plus ancien, ordre total (created_at, id). Le curseur est la dernière
 * ligne rendue (horodatage exact à la microseconde + identifiant) : une requête arrivée entre deux pages ne décale
 * rien, et deux requêtes au même instant sont départagées par l'identifiant.
 */
export async function listActivity(
  db: Database,
  filter: ActivityFilter,
  options: { limit?: number; cursor?: ActivityCursor | null } = {},
): Promise<ActivityPage> {
  const limit = Math.min(
    Math.max(options.limit ?? DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  );
  return readPage(db, filter, limit, options.cursor ?? null);
}

async function readPage(
  db: Database,
  filter: ActivityFilter,
  limit: number,
  cursor: ActivityCursor | null,
): Promise<ActivityPage> {
  const after = cursor
    ? sql` AND (e.created_at, e.id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
    : sql``;
  const raw = [
    ...(await db.execute<RawRow>(sql`
      SELECT e.id::text AS id,
             e.request_id,
             to_char(e.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS ts,
             e.model_public_id AS model,
             e.endpoint,
             e.api_key_id::text AS api_key_id,
             k.name AS key_name,
             k.prefix AS key_prefix,
             e.status,
             e.http_status,
             e.error_code,
             e.stream,
             e.prompt_tokens AS prompt,
             e.completion_tokens AS completion,
             e.cached_tokens AS cached,
             e.reasoning_tokens AS reasoning,
             e.cost_micro::text AS cost,
             e.value_micro::text AS value,
             e.billed,
             e.latency_ms AS latency
      FROM usage_events e
      LEFT JOIN api_keys k ON k.id = e.api_key_id AND k.organization_id = e.organization_id
      WHERE ${whereOf(filter)}${after}
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT ${limit + 1}
    `)),
  ];
  const page = raw.slice(0, limit);
  const last = page.at(-1);
  return {
    rows: page.map((r) => ({
      id: r.id,
      requestId: r.request_id,
      // Le Date de JavaScript s'arrête à la milliseconde : le curseur, lui, garde les six décimales.
      createdAt: new Date(`${r.ts.slice(0, 23)}Z`),
      model: r.model,
      endpoint: r.endpoint,
      apiKeyId: r.api_key_id,
      apiKeyName: r.key_name ?? "",
      apiKeyPrefix: r.key_prefix ?? "",
      status: r.status,
      httpStatus: r.http_status,
      errorCode: r.error_code,
      stream: r.stream,
      promptTokens: r.prompt,
      completionTokens: r.completion,
      cachedTokens: r.cached,
      reasoningTokens: r.reasoning,
      costMicro: BigInt(r.cost),
      valueMicro: BigInt(r.value),
      billed: r.billed,
      latencyMs: r.latency,
    })),
    nextCursor:
      raw.length > limit && last
        ? encodeCursor({ createdAt: last.ts, id: last.id })
        : null,
  };
}

/** Parcourt le journal par paquets (export CSV), du plus récent au plus ancien, jusqu'à `maxRows` lignes. */
export async function* iterateActivity(
  db: Database,
  filter: ActivityFilter,
  options: { pageSize?: number; maxRows?: number } = {},
): AsyncGenerator<ActivityRow> {
  const pageSize = Math.min(
    Math.max(options.pageSize ?? EXPORT_PAGE_SIZE, 1),
    EXPORT_PAGE_SIZE,
  );
  const maxRows = options.maxRows ?? MAX_EXPORT_ROWS;
  let emitted = 0;
  let cursor: ActivityCursor | null = null;
  while (emitted < maxRows) {
    const page: ActivityPage = await readPage(
      db,
      filter,
      Math.min(pageSize, maxRows - emitted),
      cursor,
    );
    for (const row of page.rows) {
      yield row;
      emitted += 1;
    }
    if (!page.nextCursor) return;
    cursor = decodeCursor(page.nextCursor);
  }
}
