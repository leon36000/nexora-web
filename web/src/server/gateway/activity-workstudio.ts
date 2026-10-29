import { type Database, eq, sql, workstudioEmbedSettings } from "@nexora/db";

/**
 * Données de la page « WorkStudio et agents » du panneau client.
 *
 * Les agents hébergés appartiennent à la PLATEFORME (catalogue public `agent/<identifiant>`), pas à une
 * organisation : « les agents de l'organisation » sont donc ceux qu'elle a réellement appelés, lus dans
 * `usage_events` (métadonnées seulement). Rien n'est inventé : sans appel, la liste est vide.
 */

export const AGENT_HISTORY_DAYS = 90;

export interface UsedAgent {
  /** Identifiant public : `agent/<slug>`. */
  id: string;
  slug: string;
  /** Nom public du catalogue ; null si l'agent n'y est plus. */
  nameFr: string | null;
  nameEn: string | null;
  requests: number;
  lastUsedAt: Date;
  /** Dépense facturée (micro-CAD). */
  costMicro: bigint;
}

export async function listUsedAgents(
  db: Database,
  organizationId: string,
  now: Date = new Date(),
  days: number = AGENT_HISTORY_DAYS,
): Promise<UsedAgent[]> {
  const since = new Date(now.getTime() - days * 86_400_000);
  const rows = await db.execute<{
    id: string;
    slug: string;
    name_fr: string | null;
    name_en: string | null;
    requests: string;
    last_used: string;
    cost: string;
  }>(sql`
    SELECT e.model_public_id AS id,
           substr(e.model_public_id, 7) AS slug,
           h.name_fr,
           h.name_en,
           count(*)::text AS requests,
           to_char(max(e.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_used,
           COALESCE(sum(e.cost_micro), 0)::text AS cost
    FROM usage_events e
    LEFT JOIN hosted_agents h ON h.slug = substr(e.model_public_id, 7)
    WHERE e.organization_id = ${organizationId}
      AND e.created_at >= ${since.toISOString()}::timestamptz
      AND e.model_public_id LIKE 'agent/%'
    GROUP BY e.model_public_id, h.name_fr, h.name_en
    ORDER BY max(e.created_at) DESC, e.model_public_id ASC
  `);
  return [...rows].map((r) => ({
    id: r.id,
    slug: r.slug,
    nameFr: r.name_fr || null,
    nameEn: r.name_en || null,
    requests: Number(r.requests),
    lastUsedAt: new Date(r.last_used),
    costMicro: BigInt(r.cost),
  }));
}

/**
 * Origine publique de l'instance WorkStudio de Nexora (réglage de la bulle, `workstudio_embed_settings.origin`) ;
 * null si elle n'est pas renseignée. Il n'existe pas encore d'adresse propre à chaque organisation : tant que le
 * provisionnement par client n'existe pas, c'est la seule adresse connue. L'appelant la valide (`safeInstanceUrl`).
 */
export async function getWorkstudioOrigin(
  db: Database,
): Promise<string | null> {
  const [row] = await db
    .select({ origin: workstudioEmbedSettings.origin })
    .from(workstudioEmbedSettings)
    .where(eq(workstudioEmbedSettings.id, "main"));
  return row?.origin ?? null;
}
