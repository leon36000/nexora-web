import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { Suspense } from "react";
import { PanelLoading } from "@/components/account/panel-ui";
import { PrivacyPanel } from "@/components/account/privacy-panel";
import { formatDate, getAccountDictionary } from "@/i18n/account";
import { isLang, type Lang } from "@/i18n/config";
import { buildPageMetadata } from "@/lib/metadata";
import { SITE_NAME } from "@/lib/site";
import { getDb } from "@/server/db";
import { loadPrivacyView } from "@/server/privacy/view";
import { requirePanelSession } from "../_lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return buildPageMetadata({
    lang,
    path: "/compte/confidentialite",
    title: t.panel.meta.privacy,
    description: t.panel.privacy.lead,
    siteName: SITE_NAME,
    noindex: true,
  });
}

/** Trois derniers mois civils (UTC), du plus récent au plus ancien, au format AAAA-MM. */
function recentMonths(now: Date, count = 3): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
    );
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

/**
 * Confidentialité : niveau de la politique, genres masqués, listes de modèles et de destinations, décisions
 * récentes (compteurs seulement) et rapport mensuel. Le propriétaire modifie ; les autres membres voient en lecture
 * seule. Aucun contenu de requête n'est lu ni affiché.
 */
export default async function PrivacyPage() {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return (
    <Suspense
      fallback={
        <PanelLoading
          title={t.panel.privacy.title}
          working={t.common.working}
        />
      }
    >
      <PrivacyContent lang={lang} />
    </Suspense>
  );
}

async function PrivacyContent({ lang }: { lang: Lang }) {
  const session = await requirePanelSession(lang);
  const t = getAccountDictionary(lang);
  const now = new Date();
  const view = await loadPrivacyView(getDb(), session.organizationId, now);
  return (
    <PrivacyPanel
      t={t}
      view={view}
      canEdit={session.role === "owner"}
      months={recentMonths(now)}
      versionDates={view.versions.map((v) =>
        formatDate(lang, new Date(v.createdAt)),
      )}
    />
  );
}
