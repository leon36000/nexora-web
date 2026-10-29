import { type BillingMode, type Database, sql } from "@nexora/db";
import { type ActivitySummary, activitySummary } from "./activity";
import { billingModeOf } from "./house";

/**
 * Données de l'aperçu du panneau client (`/compte`) qui ne viennent pas déjà du tableau de bord de facturation :
 * mode de facturation, les trois repères de la liste « Pour démarrer » lus dans la base, et le résumé des
 * 30 derniers jours. Tout est borné à UNE organisation (celle de la session).
 */

export const OVERVIEW_DAYS = 30;

export interface OverviewData {
  billingMode: BillingMode;
  /** L'organisation a créé au moins une clé d'API (même révoquée depuis). */
  hasApiKey: boolean;
  /** Au moins une requête réussie vers un modèle (les agents `agent/…` ne comptent pas). */
  hasModelRequest: boolean;
  /** Au moins un VPS en service (actif, suspendu ou en réinstallation ; ni en cours de création, ni en échec). */
  hasVps: boolean;
  last30: ActivitySummary;
}

export async function loadOverview(
  db: Database,
  organizationId: string,
  now: Date = new Date(),
): Promise<OverviewData> {
  const from = new Date(now.getTime() - OVERVIEW_DAYS * 86_400_000);
  const [billingMode, flagRows, last30] = await Promise.all([
    billingModeOf(db, organizationId),
    db.execute<{
      has_key: boolean;
      has_request: boolean;
      has_vps: boolean;
    }>(sql`
      SELECT EXISTS (
               SELECT 1 FROM api_keys WHERE organization_id = ${organizationId}
             ) AS has_key,
             EXISTS (
               SELECT 1 FROM usage_events
               WHERE organization_id = ${organizationId}
                 AND status = 'ok'
                 AND model_public_id NOT LIKE 'agent/%'
             ) AS has_request,
             EXISTS (
               SELECT 1 FROM vps_instances
               WHERE organization_id = ${organizationId}
                 AND deleted_at IS NULL
                 AND status IN ('active', 'suspended', 'reinstalling')
             ) AS has_vps
    `),
    activitySummary(db, { organizationId, from, to: now }),
  ]);
  const flags = [...flagRows][0];
  return {
    billingMode,
    hasApiKey: flags?.has_key ?? false,
    hasModelRequest: flags?.has_request ?? false,
    hasVps: flags?.has_vps ?? false,
    last30,
  };
}
