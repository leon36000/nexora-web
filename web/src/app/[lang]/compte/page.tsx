import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { Suspense } from "react";
import { Dashboard } from "@/components/account/dashboard";
import { ApiKeysSection } from "@/components/gateway/api-keys-section";
import { Section } from "@/components/ui/section";
import { fmt, formatCad, getAccountDictionary } from "@/i18n/account";
import { isLang, localizePath } from "@/i18n/config";
import { buildPageMetadata } from "@/lib/metadata";
import { getSessionContext } from "@/server/auth/session";
import { loadDashboard } from "@/server/billing/dashboard";
import {
  lazyPlanSource,
  planSourceFromEnv,
  type SubscriptionPlan,
} from "@/server/billing/plans";
import { getDb } from "@/server/db";
import { listApiKeys } from "@/server/gateway/keys";
import { usageByDayAndModel } from "@/server/gateway/usage";
import { loadBillingConfig } from "@/server/ledger/config";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return {
    ...buildPageMetadata({
      lang,
      path: "/compte",
      title: t.meta.dashboard,
      description: t.dashboard.lead,
      siteName: "Nexora",
    }),
    robots: { index: false, follow: false },
  };
}

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

/**
 * Espace client : réservé aux comptes connectés. Les données (session, cookies) sont propres à la
 * requête : elles sont lues dans une frontière Suspense pour que la page garde une coque statique.
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
        <Section tone="light" aria-busy="true">
          <h1 className="text-h1 text-fg">{t.dashboard.title}</h1>
          <p className="mt-4 text-fg-muted" role="status">
            {t.common.working}
          </p>
        </Section>
      }
    >
      <AccountContent lang={lang} searchParams={searchParams} />
    </Suspense>
  );
}

async function AccountContent({
  lang,
  searchParams,
}: {
  lang: "fr" | "en";
  searchParams: Promise<Search>;
}) {
  const session = await getSessionContext(await headers());
  if (!session) redirect(localizePath(lang, "/compte/connexion"));

  const t = getAccountDictionary(lang);
  const config = loadBillingConfig();
  const data = await loadDashboard(getDb(), session.organizationId);
  // Clés API et usage de la passerelle (S5) : mêmes données d'organisation, même session.
  const [apiKeys, usage] = await Promise.all([
    listApiKeys(getDb(), session.organizationId),
    usageByDayAndModel(getDb(), session.organizationId, 30),
  ]);

  // Offres publiées dans Directus ; en cas d'échec, la page reste utilisable sans elles.
  let plans: SubscriptionPlan[] | null = null;
  try {
    plans = await lazyPlanSource(() => planSourceFromEnv()).listPublished();
  } catch {
    plans = null;
  }

  const q = await searchParams;
  const errorCode = first(q.erreur);
  const errors = t.dashboard.alerts.errors as Record<string, string>;
  const flash = errorCode
    ? {
        kind: "error" as const,
        message: fmt(errors[errorCode] ?? errors.internal_error ?? "", {
          min: formatCad(lang, config.minPurchaseCents),
          max: formatCad(lang, config.maxPurchaseCents),
        }),
      }
    : first(q.achat) === "ok"
      ? { kind: "success" as const, message: t.dashboard.alerts.purchaseOk }
      : first(q.achat) === "annule"
        ? {
            kind: "info" as const,
            message: t.dashboard.alerts.purchaseCancelled,
          }
        : first(q.abonnement) === "ok"
          ? {
              kind: "success" as const,
              message: t.dashboard.alerts.subscriptionOk,
            }
          : first(q.abonnement) === "annule"
            ? {
                kind: "info" as const,
                message: t.dashboard.alerts.subscriptionCancelled,
              }
            : null;

  return (
    <>
      <Dashboard
        lang={lang}
        t={t}
        data={data}
        role={session.role}
        userName={session.name}
        config={config}
        plans={plans}
        flash={flash}
      />
      <ApiKeysSection
        lang={lang}
        role={session.role}
        keys={apiKeys}
        usage={usage}
      />
    </>
  );
}
