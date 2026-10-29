import { eq, organizations } from "@nexora/db";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { type ReactNode, Suspense } from "react";
import { PanelShell } from "@/components/account/panel-shell";
import { Section } from "@/components/ui/section";
import { getAccountDictionary } from "@/i18n/account";
import { isLang, type Lang } from "@/i18n/config";
import { getDb } from "@/server/db";
import { appsPageAvailable } from "./_lib/apps";
import { getPanelSession } from "./_lib/session";

/**
 * Mise en page du panneau client (`/compte`, `/compte/modeles`, `/compte/activite`, `/compte/workstudio`,
 * `/compte/vps`, `/compte/facturation`, `/compte/securite`) : navigation latérale, onglets défilants sur
 * téléphone. Les pages de connexion, d'inscription et de réinitialisation sont hors de ce groupe.
 *
 * Sans session, la mise en page ne dessine rien autour : la page redirige elle-même vers la connexion (et un compte
 * sans organisation voit le message de la page, pas un panneau vide).
 */
export default async function PanelLayout({
  children,
}: {
  children: ReactNode;
}) {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  return (
    <Suspense
      fallback={
        <Section tone="light" flush className="py-8" aria-busy="true">
          <p className="text-fg-muted" role="status">
            {getAccountDictionary(lang).common.working}
          </p>
        </Section>
      }
    >
      <PanelFrame lang={lang}>{children}</PanelFrame>
    </Suspense>
  );
}

async function PanelFrame({
  lang,
  children,
}: {
  lang: Lang;
  children: ReactNode;
}) {
  const session = await getPanelSession();
  if (!session) return children;
  const [org] = await getDb()
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, session.organizationId));
  return (
    <PanelShell
      lang={lang}
      t={getAccountDictionary(lang)}
      organizationName={org?.name ?? ""}
      userName={session.name}
      role={session.role}
      appsAvailable={appsPageAvailable()}
    >
      {children}
    </PanelShell>
  );
}
