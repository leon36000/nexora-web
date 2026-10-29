import { type Database, sql } from "@nexora/db";

/**
 * Activité WebPilot d'UNE organisation (page « Activité » de l'espace client) : pages lues, minutes de navigateur,
 * coût. Source : `usage_events` (métadonnées seulement : jamais d'adresse complète, de requête ni de contenu). Chaque
 * requête commence par `organization_id` : l'organisation vient de la session.
 */
export interface WebpilotWindow {
  organizationId: string;
  from: Date;
  to: Date;
}

export interface WebpilotOperationRow {
  /** `search`, `scrape`, `crawl`, `extract` ou `session`. */
  operation: string;
  requests: number;
  pages: number;
  minutes: number;
  costMicro: bigint;
}

export interface WebpilotActivity {
  requests: number;
  errors: number;
  pagesStatic: number;
  pagesBrowser: number;
  browserMinutes: number;
  /** Dépense facturée (micro-CAD). */
  costMicro: bigint;
  /** Valeur au prix public (organisation « maison » : ce qu'elle aurait payé). */
  valueMicro: bigint;
  byOperation: WebpilotOperationRow[];
}

export async function webpilotActivity(
  db: Database,
  w: WebpilotWindow,
): Promise<WebpilotActivity> {
  const rows = await db.execute<{
    operation: string;
    requests: string;
    errors: string;
    static_pages: string;
    browser_pages: string;
    minutes: string;
    cost: string;
    value: string;
  }>(sql`
    SELECT substr(endpoint, 10) AS operation,
           count(*)::text AS requests,
           (count(*) FILTER (WHERE status = 'error'))::text AS errors,
           COALESCE(sum(units_page_static), 0)::text AS static_pages,
           COALESCE(sum(units_page_browser), 0)::text AS browser_pages,
           COALESCE(sum(units_browser_minute), 0)::text AS minutes,
           COALESCE(sum(cost_micro), 0)::text AS cost,
           COALESCE(sum(value_micro), 0)::text AS value
    FROM usage_events
    WHERE organization_id = ${w.organizationId}
      AND created_at >= ${w.from.toISOString()}::timestamptz
      AND created_at < ${w.to.toISOString()}::timestamptz
      AND endpoint LIKE 'webpilot.%'
    GROUP BY 1
    ORDER BY sum(cost_micro) DESC, sum(value_micro) DESC, 1 ASC
  `);
  const out: WebpilotActivity = {
    requests: 0,
    errors: 0,
    pagesStatic: 0,
    pagesBrowser: 0,
    browserMinutes: 0,
    costMicro: 0n,
    valueMicro: 0n,
    byOperation: [],
  };
  for (const r of rows) {
    const stat = Number(r.static_pages);
    const browser = Number(r.browser_pages);
    const minutes = Number(r.minutes);
    out.requests += Number(r.requests);
    out.errors += Number(r.errors);
    out.pagesStatic += stat;
    out.pagesBrowser += browser;
    out.browserMinutes += minutes;
    out.costMicro += BigInt(r.cost);
    out.valueMicro += BigInt(r.value);
    out.byOperation.push({
      operation: r.operation,
      requests: Number(r.requests),
      pages: stat + browser,
      minutes,
      costMicro: BigInt(r.cost),
    });
  }
  return out;
}
