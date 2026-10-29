import { type BillingMode, type Database, sql } from "@nexora/db";
import { type ActivitySummary, activitySummary } from "./activity";
import { billingModeOf } from "./house";
import { WORKSTUDIO_KEY_NAME } from "./provision";

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
  /** Clés ni révoquées ni expirées. */
  activeKeys: number;
  /** La clé automatique de WorkStudio existe et est active (WorkStudio est « branché » sur un modèle). */
  workstudioKeyActive: boolean;
  /** Consommation du mois en cours (depuis le 1er à minuit, heure de Montréal). */
  month: ActivitySummary;
  last30: ActivitySummary;
}

export async function loadOverview(
  db: Database,
  organizationId: string,
  now: Date = new Date(),
): Promise<OverviewData> {
  const from = new Date(now.getTime() - OVERVIEW_DAYS * 86_400_000);
  const monthFrom = await monthStart(db, now);
  const [billingMode, flagRows, last30, month] = await Promise.all([
    billingModeOf(db, organizationId),
    db.execute<{
      has_key: boolean;
      has_request: boolean;
      has_vps: boolean;
      active_keys: number;
      workstudio_key: boolean;
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
             ) AS has_vps,
             (
               SELECT count(*)::int FROM api_keys
               WHERE organization_id = ${organizationId}
                 AND revoked_at IS NULL
                 AND (expires_at IS NULL OR expires_at > ${now.toISOString()}::timestamptz)
             ) AS active_keys,
             EXISTS (
               SELECT 1 FROM api_keys
               WHERE organization_id = ${organizationId}
                 AND name = ${WORKSTUDIO_KEY_NAME}
                 AND revoked_at IS NULL
                 AND (expires_at IS NULL OR expires_at > ${now.toISOString()}::timestamptz)
             ) AS workstudio_key
    `),
    activitySummary(db, { organizationId, from, to: now }),
    activitySummary(db, { organizationId, from: monthFrom, to: now }),
  ]);
  const flags = [...flagRows][0];
  return {
    billingMode,
    hasApiKey: flags?.has_key ?? false,
    hasModelRequest: flags?.has_request ?? false,
    hasVps: flags?.has_vps ?? false,
    activeKeys: flags?.active_keys ?? 0,
    workstudioKeyActive: flags?.workstudio_key ?? false,
    month,
    last30,
  };
}

/** Début du mois civil en cours à Montréal (le jour du tableau d'usage), en instant UTC. */
async function monthStart(db: Database, now: Date): Promise<Date> {
  const rows = await db.execute<{ start: string }>(sql`
    SELECT to_char(
      (date_trunc('month', ${now.toISOString()}::timestamptz AT TIME ZONE 'America/Toronto')
         AT TIME ZONE 'America/Toronto') AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS start
  `);
  const row = [...rows][0];
  if (!row) throw new Error("début du mois : aucune ligne");
  return new Date(row.start);
}
