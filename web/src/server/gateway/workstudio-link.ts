import {
  and,
  apiKeys,
  type Database,
  desc,
  eq,
  gt,
  isNull,
  or,
} from "@nexora/db";
import { WORKSTUDIO_KEY_NAME } from "./provision";

/**
 * Branchement de WorkStudio sur un modèle de la passerelle : la clé « WorkStudio (automatique) » de l'organisation
 * (créée à la première ouverture de WorkStudio par `ensureModelAccess`). Rend ce que le panneau affiche (préfixe,
 * création, dernier usage) ; jamais l'empreinte ni la valeur de la clé. `null` : pas encore branché.
 */
export interface WorkstudioLink {
  id: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export async function loadWorkstudioLink(
  db: Database,
  organizationId: string,
  now: Date = new Date(),
): Promise<WorkstudioLink | null> {
  const [row] = await db
    .select({
      id: apiKeys.id,
      prefix: apiKeys.prefix,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.organizationId, organizationId),
        eq(apiKeys.name, WORKSTUDIO_KEY_NAME),
        isNull(apiKeys.revokedAt),
        or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, now)),
      ),
    )
    .orderBy(desc(apiKeys.createdAt))
    .limit(1);
  return row ?? null;
}
