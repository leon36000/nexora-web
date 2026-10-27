import "server-only";
import type { OrgRole } from "@nexora/db";
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
  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    locale,
    organizationId: ctx.organizationId,
    role: ctx.role,
    emailVerified: session.user.emailVerified,
  };
}
