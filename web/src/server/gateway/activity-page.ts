import type { Database } from "@nexora/db";
import {
  type ActivityCriteria,
  type ActivityPage,
  type ActivityPeriod,
  type ActivitySummary,
  activityBreakdown,
  activitySummary,
  type BreakdownRow,
  listActivity,
  listActivityModels,
  parseActivityParams,
} from "./activity";

/**
 * Données de la page « Activité » du panneau client. Les critères viennent de l'adresse (`period`, `model`, `key`,
 * `status`, `cursor`) ; des critères invalides ne font jamais échouer la page : ils sont écartés, les valeurs par
 * défaut s'appliquent et `invalid` le signale. L'organisation vient de la session (paramètre `organizationId`).
 */
export interface ActivityPageData {
  period: ActivityPeriod | "custom";
  criteria: ActivityCriteria;
  invalid: boolean;
  summary: ActivitySummary;
  byDay: BreakdownRow[];
  byModel: BreakdownRow[];
  byAgent: BreakdownRow[];
  byKey: BreakdownRow[];
  /** Modèles et agents vus dans la période, pour la liste de choix du filtre. */
  models: string[];
  page: ActivityPage;
  /** La page affichée n'est pas la première. */
  hasCursor: boolean;
}

export async function loadActivityPage(
  db: Database,
  organizationId: string,
  params: URLSearchParams,
  now: Date,
): Promise<ActivityPageData> {
  let query = parseActivityParams(params, now);
  const invalid = !query.ok;
  if (!query.ok) query = parseActivityParams(new URLSearchParams(), now);
  if (!query.ok) throw new Error("activité : critères par défaut invalides");
  const filter = { ...query.filter, organizationId };
  const [summary, byDay, byModel, byAgent, byKey, models, page] =
    await Promise.all([
      activitySummary(db, filter),
      activityBreakdown(db, filter, "day"),
      activityBreakdown(db, filter, "model"),
      activityBreakdown(db, filter, "agent"),
      activityBreakdown(db, filter, "key"),
      listActivityModels(db, filter),
      listActivity(db, filter, { limit: query.limit, cursor: query.cursor }),
    ]);
  return {
    period: query.period,
    criteria: query.filter,
    invalid,
    summary,
    byDay,
    byModel,
    byAgent,
    byKey,
    models,
    page,
    hasCursor: query.cursor !== null,
  };
}
