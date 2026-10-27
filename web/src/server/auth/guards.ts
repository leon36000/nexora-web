import {
  and,
  type Database,
  eq,
  members,
  ORG_ROLES,
  type OrgRole,
} from "@nexora/db";

/**
 * Gardes d'organisation. Toute lecture ou écriture de données d'une organisation (solde, écritures,
 * abonnements, portail) passe par ici : l'identifiant d'organisation ne vient JAMAIS d'un champ
 * fourni par le navigateur sans être confronté aux adhésions de l'utilisateur de la session.
 */
export class OrgAccessError extends Error {
  readonly code: "forbidden" | "insufficient_role";
  constructor(code: "forbidden" | "insufficient_role") {
    super(code === "forbidden" ? "accès refusé" : "rôle insuffisant");
    this.name = "OrgAccessError";
    this.code = code;
  }
}

const isRole = (value: string): value is OrgRole =>
  (ORG_ROLES as readonly string[]).includes(value);

/**
 * Exige que l'utilisateur soit membre de l'organisation (et, si `roles` est donné, qu'il ait l'un
 * de ces rôles). Le message d'erreur ne distingue pas « organisation inexistante » de « pas membre ».
 */
export async function requireOrgMember(
  db: Database,
  userId: string,
  organizationId: string,
  roles?: readonly OrgRole[],
): Promise<{ role: OrgRole }> {
  if (!organizationId || !userId) throw new OrgAccessError("forbidden");
  const [row] = await db
    .select({ role: members.role })
    .from(members)
    .where(
      and(
        eq(members.userId, userId),
        eq(members.organizationId, organizationId),
      ),
    );
  if (!row || !isRole(row.role)) throw new OrgAccessError("forbidden");
  if (roles && !roles.includes(row.role))
    throw new OrgAccessError("insufficient_role");
  return { role: row.role };
}

/**
 * Organisation de travail d'une session : l'organisation active si l'utilisateur en est membre,
 * sinon sa première organisation. Une organisation active forgée ou périmée est ignorée.
 */
export async function resolveOrgContext(
  db: Database,
  userId: string,
  activeOrganizationId: string | null | undefined,
): Promise<{ organizationId: string; role: OrgRole } | null> {
  if (activeOrganizationId) {
    try {
      const { role } = await requireOrgMember(db, userId, activeOrganizationId);
      return { organizationId: activeOrganizationId, role };
    } catch (error) {
      if (!(error instanceof OrgAccessError)) throw error;
    }
  }
  const [first] = await db
    .select({ organizationId: members.organizationId, role: members.role })
    .from(members)
    .where(eq(members.userId, userId))
    .orderBy(members.createdAt)
    .limit(1);
  if (!first || !isRole(first.role)) return null;
  return { organizationId: first.organizationId, role: first.role };
}
