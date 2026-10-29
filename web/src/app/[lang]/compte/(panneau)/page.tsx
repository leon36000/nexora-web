import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { Suspense } from "react";
import { Overview } from "@/components/account/overview";
import { hasWorkstudioAccess } from "@/components/account/panel-logic";
import { PanelLoading } from "@/components/account/panel-ui";
import { getAccountDictionary } from "@/i18n/account";
import { isLang, type Lang } from "@/i18n/config";
import { buildPageMetadata } from "@/lib/metadata";
import { parseOffer } from "@/lib/offer-param";
import { SITE_NAME } from "@/lib/site";
import { loadDashboard } from "@/server/billing/dashboard";
import {
  lazyPlanSource,
  planSourceFromEnv,
  type SubscriptionPlan,
} from "@/server/billing/plans";
import { getDb } from "@/server/db";
import { loadOverview } from "@/server/gateway/activity-overview";
import { loadBillingConfig } from "@/server/ledger/config";
import { first, flashFromSearch, type Search } from "./_lib/flash";
import { requirePanelSession } from "./_lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return buildPageMetadata({
    lang,
    path: "/compte",
    title: t.panel.meta.overview,
    description: t.panel.overview.lead,
    siteName: SITE_NAME,
    noindex: true,
  });
}

/**
 * Aperçu du panneau client : portefeuille, pour démarrer, 30 derniers jours. C'est aussi la page de retour des
 * paiements (`?achat=ok`…) et du choix d'offre de la page Tarifs (`?offre=…`). Les données (session, cookies, base)
 * sont propres à la requête : elles sont lues dans une frontière Suspense pour que la page garde une coque statique.
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return (
    <Suspense
      fallback={
        <PanelLoading
          title={t.panel.overview.title}
          working={t.common.working}
        />
      }
    >
      <OverviewContent lang={lang} searchParams={searchParams} />
    </Suspense>
  );
}

async function OverviewContent({
  lang,
  searchParams,
}: {
  lang: Lang;
  searchParams: Promise<Search>;
}) {
  const session = await requirePanelSession(lang);
  const t = getAccountDictionary(lang);
  const db = getDb();
  const [dashboard, overview, q] = await Promise.all([
    loadDashboard(db, session.organizationId),
    loadOverview(db, session.organizationId),
    searchParams,
  ]);

  // L'offre choisie sur la page Tarifs : les offres publiées ne sont lues dans Directus que dans ce cas ;
  // en cas d'échec, la page reste utilisable sans elle.
  const wanted = parseOffer(first(q.offre) ?? null);
  let chosenOffer: SubscriptionPlan | null = null;
  if (wanted) {
    try {
      const plans = await lazyPlanSource(() =>
        planSourceFromEnv(),
      ).listPublished();
      const owned = new Set(
        dashboard.subscriptions
          .filter((s) => s.access === "full" || s.access === "grace")
          .map((s) => s.planCode),
      );
      chosenOffer =
        plans.find(
          (p) => p.code === wanted && p.stripePriceId && !owned.has(p.code),
        ) ?? null;
    } catch {
      chosenOffer = null;
    }
  }

  return (
    <Overview
      lang={lang}
      t={t}
      role={session.role}
      dashboard={dashboard}
      overview={overview}
      hasWorkstudio={hasWorkstudioAccess(dashboard.subscriptions)}
      chosenOffer={chosenOffer}
      flash={flashFromSearch(lang, t, q, loadBillingConfig())}
    />
  );
}
