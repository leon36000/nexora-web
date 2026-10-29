import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { type Lang, localizePath } from "@/i18n/config";
import { getSessionContext, type SessionContext } from "@/server/auth/session";

/**
 * Session de la requête pour les pages du panneau client. `cache` de React : la mise en page et la page lisent la
 * même session sans l'interroger deux fois pendant un même rendu.
 */
export const getPanelSession = cache(
  async (): Promise<SessionContext | null> =>
    getSessionContext(await headers()),
);

/**
 * Session obligatoire d'une page du panneau : sans session, connexion ; un compte du personnel sans double
 * authentification est renvoyé à la page Sécurité d'abord (sauf sur cette page, `allowWithoutTwoFactor`).
 * Chaque page l'appelle elle-même : une mise en page ne se rend pas à chaque navigation, elle ne protège rien.
 */
export async function requirePanelSession(
  lang: Lang,
  options: { allowWithoutTwoFactor?: boolean } = {},
): Promise<SessionContext> {
  const session = await getPanelSession();
  if (!session) redirect(localizePath(lang, "/compte/connexion"));
  if (
    session.isStaff &&
    !session.twoFactorEnabled &&
    !options.allowWithoutTwoFactor
  )
    redirect(localizePath(lang, "/compte/securite"));
  return session;
}
