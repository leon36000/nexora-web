import type { ReactNode } from "react";
import { Section } from "@/components/ui/section";
import type { AccountDictionary } from "@/i18n/account";
import type { Lang } from "@/i18n/config";
import { PanelNav } from "./panel-nav";
import { SignOutButton } from "./sign-out-button";

/**
 * Cadre du panneau client : en-tête (organisation, personne connectée, déconnexion), navigation latérale (onglets
 * défilants sur téléphone) et zone de contenu. Les pages du panneau y sont rendues telles quelles.
 */
export function PanelShell({
  lang,
  t,
  organizationName,
  userName,
  role,
  appsAvailable,
  children,
}: {
  lang: Lang;
  t: AccountDictionary;
  organizationName: string;
  userName: string;
  role: "owner" | "member";
  appsAvailable: boolean;
  children: ReactNode;
}) {
  return (
    <Section tone="paper" flush className="py-8 sm:py-10 lg:py-14">
      <div className="flex items-center justify-between gap-4 border-b border-line pb-5">
        <div className="min-w-0">
          <p className="hidden font-mono text-label uppercase text-fg-muted sm:block">
            {t.dashboard.organization}
          </p>
          <p className="truncate text-body font-medium text-fg sm:mt-1">
            <span className="sr-only sm:hidden">
              {t.dashboard.organization} :{" "}
            </span>
            {organizationName}
          </p>
          <p className="truncate text-small text-fg-muted">
            {userName} · {t.dashboard.roles[role]}
          </p>
        </div>
        <div className="shrink-0">
          <SignOutButton lang={lang} label={t.dashboard.signOut} />
        </div>
      </div>
      <div className="mt-6 flex flex-col gap-8 lg:flex-row lg:gap-12">
        <div className="lg:w-60 lg:shrink-0">
          <PanelNav
            lang={lang}
            label={t.panel.nav.label}
            soonLabel={t.panel.nav.soon}
            items={t.panel.nav.items}
            appsAvailable={appsAvailable}
          />
        </div>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </Section>
  );
}
