import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { Suspense } from "react";
import { BillingPanel } from "@/components/account/billing-panel";
import { PanelLoading } from "@/components/account/panel-ui";
import { getAccountDictionary } from "@/i18n/account";
import { isLang, type Lang } from "@/i18n/config";
import { buildPageMetadata } from "@/lib/metadata";
import { SITE_NAME } from "@/lib/site";
import { loadDashboard } from "@/server/billing/dashboard";
import {
  lazyPlanSource,
  planSourceFromEnv,
  type SubscriptionPlan,
} from "@/server/billing/plans";
import { getDb } from "@/server/db";
import { loadBillingConfig } from "@/server/ledger/config";
import { getSettings } from "@/server/payments/settings";
import { requirePanelSession } from "../_lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return buildPageMetadata({
    lang,
    path: "/compte/facturation",
    title: t.panel.meta.billing,
    description: t.panel.billing.lead,
    siteName: SITE_NAME,
    noindex: true,
  });
}

/**
 * Facturation : solde, achat de crédits, abonnements, portail Stripe, historique. Ce sont les blocs de l'ancien
 * tableau de bord ; les formulaires envoient les mêmes champs aux mêmes routes `/api/billing/*`.
 */
export default async function BillingPage() {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return (
    <Suspense
      fallback={
        <PanelLoading
          title={t.panel.billing.title}
          working={t.common.working}
        />
      }
    >
      <BillingContent lang={lang} />
    </Suspense>
  );
}

async function BillingContent({ lang }: { lang: Lang }) {
  const session = await requirePanelSession(lang);
  const db = getDb();
  const [data, settings] = await Promise.all([
    loadDashboard(db, session.organizationId),
    getSettings(db),
  ]);

  // Offres publiées dans Directus ; en cas d'échec, la page reste utilisable sans elles.
  let plans: SubscriptionPlan[] | null = null;
  try {
    plans = await lazyPlanSource(() => planSourceFromEnv()).listPublished();
  } catch {
    plans = null;
  }

  return (
    <BillingPanel
      lang={lang}
      t={getAccountDictionary(lang)}
      data={data}
      role={session.role}
      config={loadBillingConfig()}
      plans={plans}
      payment={{
        liveMode: settings.liveModeAllowed && settings.stripeMode === "live",
        fee: settings.creditsFeeEnabled
          ? {
              percent: settings.creditsFeeBps / 100,
              minCents: settings.creditsFeeMinCents,
            }
          : null,
      }}
    />
  );
}
