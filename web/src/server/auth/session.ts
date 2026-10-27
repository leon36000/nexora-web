import "server-only";
import { and, eq, isNull, type OrgRole, staffAccounts } from "@nexora/db";
import { getDb } from "../db";
import { resolveOrgContext } from "./guards";
import { getAuth } from "./instance";

export interface SessionContext {
  userId: string;
  email: string;
  name: string;
  locale: "fr" | "en";
  organizationId: string;
  role: OrgRole;
  emailVerified: boolean;
  /** Double authentification activée sur le compte. */
  twoFactorEnabled: boolean;
  /** Compte du personnel (drapeau actif) : la double authentification est alors obligatoire. */
  isStaff: boolean;
}

/**
 * Session de la requête + organisation de travail, confrontée aux adhésions en base. Renvoie null
 * sans session valide ou sans organisation.
 */
export async function getSessionContext(
  headers: Headers,
): Promise<SessionContext | null> {
  const session = await getAuth().api.getSession({ headers });
  if (!session) return null;
  const active = (session.session as { activeOrganizationId?: string | null })
    .activeOrganizationId;
  const ctx = await resolveOrgContext(getDb(), session.user.id, active);
  if (!ctx) return null;
  const locale =
    (session.user as { locale?: string }).locale === "en" ? "en" : "fr";
  const [staff] = await getDb()
    .select({ userId: staffAccounts.userId })
    .from(staffAccounts)
    .where(
      and(
        eq(staffAccounts.userId, session.user.id),
        isNull(staffAccounts.revokedAt),
      ),
    );
  return {
    twoFactorEnabled: Boolean(
      (session.user as { twoFactorEnabled?: boolean }).twoFactorEnabled,
    ),
    isStaff: Boolean(staff),
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    locale,
    organizationId: ctx.organizationId,
    role: ctx.role,
    emailVerified: session.user.emailVerified,
  };
}
