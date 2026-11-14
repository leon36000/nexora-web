import { isSameOriginRequest } from "../auth/origin";
import { consumeRateLimit } from "../billing/rate-limit";
import type { AccountContext, AccountKeysDeps } from "./account-handlers";
import {
  type ActivityFilter,
  type ActivityRow,
  type ActivitySummary,
  activityBreakdown,
  activitySummary,
  type BreakdownRow,
  iterateActivity,
  listActivity,
  MAX_EXPORT_ROWS,
  parseActivityParams,
} from "./activity";
import { activityCsvHeader, activityCsvRow, CSV_BOM } from "./activity-csv";
import { authenticateApiKey } from "./keys";

/**
 * Activité de l'espace client :
 *  - `GET /api/account/activity` : synthèse, répartitions (modèle, agent, clé, jour) et une page du journal ;
 *  - `GET /api/account/activity/export` : le journal en CSV.
 *
 * Mêmes règles que les clés d'API (`account-handlers.ts`) : contrôle d'origine (CSRF), session confrontée aux
 * adhésions, l'organisation vient de la session et jamais de l'adresse. Un appel serveur à serveur portant
 * `Authorization: Bearer nxk_…` remplace session et contrôle d'origine : l'organisation vient de la clé. Contrairement aux clés, tout membre
 * de l'organisation peut LIRE son activité (la page « Clés » la montrait déjà à tous). Les lectures ne contiennent
 * que des métadonnées de `usage_events` : jamais le contenu d'une requête.
 *
 * Paramètres : `period` (24h, 7d, 30d, 90d) OU `from` et `to` (ISO 8601, au plus 366 jours), `model`, `key`,
 * `status` (ok, error, aborted), `limit` (1 à 100) et `cursor` (journal seulement). Les montants sont des chaînes
 * en micro-CAD (entiers exacts). Avec `cursor`, la réponse ne contient que `rows` et `nextCursor`.
 */

export interface ActivityDeps extends AccountKeysDeps {
  /** Plafond de lignes d'un export (essais) ; défaut : `MAX_EXPORT_ROWS`. */
  exportMaxRows?: number;
}

const NO_STORE = { "cache-control": "no-store" };
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: NO_STORE });

/** Lectures : 120 par minute et par utilisateur ; exports : 10 par minute (chacun parcourt tout le journal). */
const READ_LIMIT = { limit: 120, windowSeconds: 60 } as const;
const EXPORT_LIMIT = { limit: 10, windowSeconds: 60 } as const;

type Authorized = { response: Response } | { ctx: AccountContext };

async function authorize(
  request: Request,
  deps: ActivityDeps,
  bucket: "read" | "export",
): Promise<Authorized> {
  let ctx: AccountContext;
  // Appel serveur à serveur : une clé API (`Authorization: Bearer nxk_…`) remplace session et contrôle d'origine.
  const authorization = request.headers.get("authorization");
  if (authorization && authorization.trim() !== "") {
    const match = /^Bearer\s+(nxk_\S+)$/i.exec(authorization);
    if (!match?.[1])
      return { response: json({ error: "unauthenticated" }, 401) };
    const principal = await authenticateApiKey(
      deps.db(),
      match[1],
      deps.now(),
    );
    if (!principal.ok)
      return { response: json({ error: "unauthenticated" }, 401) };
    ctx = {
      userId: `key:${principal.key.id}`,
      organizationId: principal.key.organizationId,
      role: "member",
    };
  } else {
    if (!isSameOriginRequest(request, deps.siteUrl))
      return { response: json({ error: "invalid_origin" }, 403) };
    const session = await deps.getContext(request.headers);
    if (!session) return { response: json({ error: "unauthenticated" }, 401) };
    ctx = session;
  }
  const limit = await consumeRateLimit(
    deps.db(),
    `acct-activity-${bucket}:${ctx.userId}`,
    {
      ...(bucket === "read" ? READ_LIMIT : EXPORT_LIMIT),
      now: deps.now(),
    },
  );
  if (!limit.allowed)
    return {
      response: Response.json(
        { error: "rate_limited" },
        {
          status: 429,
          headers: {
            ...NO_STORE,
            "retry-after": String(limit.retryAfterSeconds),
          },
        },
      ),
    };
  return { ctx };
}

const summaryJson = (s: ActivitySummary) => ({
  ...s,
  costMicro: s.costMicro.toString(),
  valueMicro: s.valueMicro.toString(),
});

const breakdownJson = (rows: BreakdownRow[]) =>
  rows.map((r) => ({
    ...r,
    costMicro: r.costMicro.toString(),
    valueMicro: r.valueMicro.toString(),
  }));

const rowJson = (r: ActivityRow) => ({
  ...r,
  createdAt: r.createdAt.toISOString(),
  costMicro: r.costMicro.toString(),
  valueMicro: r.valueMicro.toString(),
});

export async function handleActivity(
  request: Request,
  deps: ActivityDeps,
): Promise<Response> {
  try {
    const auth = await authorize(request, deps, "read");
    if ("response" in auth) return auth.response;
    const now = deps.now();
    const query = parseActivityParams(new URL(request.url).searchParams, now);
    if (!query.ok) return json({ error: query.error }, 422);
    const filter: ActivityFilter = {
      ...query.filter,
      organizationId: auth.ctx.organizationId,
    };
    const period = {
      preset: query.period,
      from: query.filter.from.toISOString(),
      to: query.filter.to.toISOString(),
    };
    const page = await listActivity(deps.db(), filter, {
      limit: query.limit,
      cursor: query.cursor,
    });
    const rows = page.rows.map(rowJson);
    if (query.cursor)
      return json({ period, rows, nextCursor: page.nextCursor });
    const db = deps.db();
    const [summary, models, agents, keys, days] = await Promise.all([
      activitySummary(db, filter),
      activityBreakdown(db, filter, "model"),
      activityBreakdown(db, filter, "agent"),
      activityBreakdown(db, filter, "key"),
      activityBreakdown(db, filter, "day"),
    ]);
    return json({
      period,
      filters: {
        model: query.filter.model ?? null,
        key: query.filter.apiKeyId ?? null,
        status: query.filter.status ?? null,
      },
      summary: summaryJson(summary),
      breakdown: {
        models: breakdownJson(models),
        agents: breakdownJson(agents),
        keys: breakdownJson(keys),
        days: breakdownJson(days),
      },
      rows,
      nextCursor: page.nextCursor,
    });
  } catch (error) {
    deps.log.error("activité : erreur interne", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return json({ error: "internal_error" }, 500);
  }
}

const utcDate = (d: Date) => d.toISOString().slice(0, 10);
const ROWS_PER_CHUNK = 200;

export async function handleActivityExport(
  request: Request,
  deps: ActivityDeps,
): Promise<Response> {
  try {
    const auth = await authorize(request, deps, "export");
    if ("response" in auth) return auth.response;
    const query = parseActivityParams(
      new URL(request.url).searchParams,
      deps.now(),
    );
    if (!query.ok) return json({ error: query.error }, 422);
    const filter: ActivityFilter = {
      ...query.filter,
      organizationId: auth.ctx.organizationId,
    };
    const db = deps.db();
    const maxRows = deps.exportMaxRows ?? MAX_EXPORT_ROWS;
    const { requests } = await activitySummary(db, filter);
    const rows = Math.min(requests, maxRows);
    const encoder = new TextEncoder();
    const iterator = iterateActivity(db, filter, { maxRows })[
      Symbol.asyncIterator
    ]();
    // Flux : l'en-tête part tout de suite, puis les lignes par paquets (mémoire bornée, quelle que soit la taille).
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`${CSV_BOM}${activityCsvHeader()}`));
      },
      async pull(controller) {
        try {
          let chunk = "";
          for (let i = 0; i < ROWS_PER_CHUNK; i++) {
            const next = await iterator.next();
            if (next.done) {
              if (chunk) controller.enqueue(encoder.encode(chunk));
              controller.close();
              return;
            }
            chunk += activityCsvRow(next.value);
          }
          controller.enqueue(encoder.encode(chunk));
        } catch (error) {
          deps.log.error("export de l'activité : erreur interne", {
            errorName: error instanceof Error ? error.name : typeof error,
          });
          controller.error(error);
        }
      },
      async cancel() {
        await iterator.return?.(undefined);
      },
    });
    deps.log.info("export CSV de l'activité", {
      organizationId: auth.ctx.organizationId,
      rows,
    });
    return new Response(body, {
      status: 200,
      headers: {
        ...NO_STORE,
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="nexora-activite-${utcDate(query.filter.from)}_${utcDate(query.filter.to)}.csv"`,
        "x-nexora-export-rows": String(rows),
        "x-nexora-export-truncated": String(requests > maxRows),
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    deps.log.error("export de l'activité : erreur interne", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return json({ error: "internal_error" }, 500);
  }
}
