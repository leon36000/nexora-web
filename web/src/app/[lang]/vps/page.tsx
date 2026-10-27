import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { Suspense } from "react";
import { Section } from "@/components/ui/section";
import { SectionHeader } from "@/components/ui/section-header";
import { AppCard } from "@/components/vps/app-card";
import { CatalogNotice } from "@/components/vps/catalog-notice";
import {
  ConfiguratorDefault,
  ConfiguratorFrame,
  ConfiguratorFromUrl,
  configuratorData,
} from "@/components/vps/configurator-section";
import { FaqList, generalFaq } from "@/components/vps/faq";
import { JsonLd } from "@/components/vps/json-ld";
import {
  catalogState,
  formatGb,
  formatInt,
  formatMemory,
  sortApps,
  sortPlans,
} from "@/components/vps/logic";
import { PlanCard } from "@/components/vps/plan-card";
import { PlanTable } from "@/components/vps/plan-table";
import { VpsHero } from "@/components/vps/vps-hero";
import { isLang, type Lang, localizePath } from "@/i18n/config";
import { getVpsDictionary } from "@/i18n/vps";
import { buildPageMetadata } from "@/lib/metadata";
import { SITE_URL } from "@/lib/site";
import {
  buildBreadcrumbJsonLd,
  buildPlanProductsJsonLd,
} from "@/lib/vps-jsonld";
import { getPublicVps } from "@/server/vps/read";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getVpsDictionary(lang);
  return buildPageMetadata({
    lang,
    path: "/vps",
    title: t.meta.vps.title,
    description: t.meta.vps.description,
    siteName: "Nexora",
  });
}

type Search = Record<string, string | string[] | undefined>;

/**
 * Page VPS : héros, plans publiés, configurateur de commande (initialisé par `?plan=&app=&term=`), tableau
 * comparatif, applications prêtes à installer, guides et questions fréquentes. Le catalogue vient de la
 * version PUBLIÉE (cache avec étiquette `vps-catalog`) ; `searchParams` n'est lu que dans le configurateur,
 * dans sa propre frontière Suspense, pour que le reste de la page garde sa coque statique.
 */
export default async function VpsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  return (
    <Suspense fallback={<VpsFallback lang={lang} />}>
      <VpsCatalog lang={lang} searchParams={searchParams} />
    </Suspense>
  );
}

/** Coque de chargement : le héros (sans boutons vers des ancres encore absentes) et un bloc de hauteur réservée. */
function VpsFallback({ lang }: { lang: Lang }) {
  const t = getVpsDictionary(lang);
  return (
    <>
      <VpsHero lang={lang} t={t} withActions={false} skeleton />
      <Section tone="light" surface aria-hidden="true">
        <div className="min-h-[32rem]" />
      </Section>
    </>
  );
}

function FaqSection({ lang }: { lang: Lang }) {
  const t = getVpsDictionary(lang);
  return (
    <Section tone="light" aria-labelledby="faq-title">
      <SectionHeader id="faq-title" title={t.faq.title} />
      <div className="mt-12">
        <FaqList items={generalFaq(t)} />
      </div>
    </Section>
  );
}

async function VpsCatalog({
  lang,
  searchParams,
}: {
  lang: Lang;
  searchParams: Promise<Search>;
}) {
  const t = getVpsDictionary(lang);
  const vps = await getPublicVps();
  const state = catalogState(vps);
  const breadcrumb = buildBreadcrumbJsonLd(SITE_URL, [
    { name: t.nav.home, path: localizePath(lang, "/") },
    { name: t.nav.vps, path: localizePath(lang, "/vps") },
  ]);

  if (state !== "ready") {
    return (
      <>
        <JsonLd data={breadcrumb} />
        <VpsHero lang={lang} t={t} withActions={false} />
        <CatalogNotice lang={lang} kind={state} t={t} />
        <FaqSection lang={lang} />
      </>
    );
  }

  const plans = sortPlans(vps.plans);
  const installable = sortApps(
    vps.apps.filter((a) => a.kind === "installable"),
  );
  const guides = sortApps(vps.apps.filter((a) => a.kind === "guide"));
  const data = configuratorData(lang, plans, vps.apps);
  const products = buildPlanProductsJsonLd({
    siteUrl: SITE_URL,
    pagePath: localizePath(lang, "/vps"),
    plans,
    labels: {
      term: { month: t.common.monthly, year: t.common.yearly },
      description: (p) => (lang === "fr" ? p.descriptionFr : p.descriptionEn),
      // Mêmes caractéristiques, mêmes libellés et mêmes valeurs que le tableau visible.
      specs: (p) => [
        { name: t.plans.vcpu, value: formatInt(lang, p.vcpu) },
        { name: t.plans.ram, value: formatMemory(lang, p.ramMb, t.units) },
        { name: t.plans.disk, value: formatGb(lang, p.diskGb, t.units.gb) },
        {
          name: t.plans.bandwidth,
          value:
            p.bandwidthGb > 0
              ? formatGb(lang, p.bandwidthGb, t.units.gb)
              : t.common.notSpecified,
        },
        { name: t.plans.location, value: t.region[p.region] },
      ],
    },
  });

  return (
    <>
      <JsonLd data={breadcrumb} />
      <JsonLd data={products} />
      <VpsHero lang={lang} t={t} withActions />

      <Section tone="light" surface id="plans" aria-labelledby="plans-title">
        <SectionHeader
          id="plans-title"
          label={t.plans.label}
          title={t.plans.title}
          lead={t.plans.lead}
        />
        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <li key={plan.code}>
              <PlanCard lang={lang} plan={plan} t={t} />
            </li>
          ))}
        </ul>
        <div className="mt-8 max-w-3xl space-y-2 text-small text-fg-muted">
          <p>
            {t.common.priceNote} {t.common.taxes}
          </p>
          <p>{t.common.renewal}</p>
        </div>
      </Section>

      <ConfiguratorFrame lang={lang}>
        <Suspense fallback={<ConfiguratorDefault lang={lang} data={data} />}>
          <ConfiguratorFromUrl
            lang={lang}
            data={data}
            searchParams={searchParams}
          />
        </Suspense>
      </ConfiguratorFrame>

      <Section
        tone="light"
        surface
        id="comparaison"
        aria-labelledby="table-title"
      >
        <SectionHeader id="table-title" title={t.table.title} />
        <div className="mt-12">
          <PlanTable lang={lang} plans={plans} t={t} />
        </div>
        <p className="mt-4 max-w-3xl text-small text-fg-muted">
          {t.common.priceNote} {t.common.taxes}
        </p>
      </Section>

      <Section tone="light" id="applications" aria-labelledby="apps-title">
        <SectionHeader
          id="apps-title"
          label={t.apps.label}
          title={t.apps.title}
          lead={t.apps.lead}
        />
        {installable.length > 0 ? (
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {installable.map((app) => (
              <li key={app.code}>
                <AppCard lang={lang} app={app} t={t} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-12 text-body text-fg-muted">{t.apps.empty}</p>
        )}
      </Section>

      {guides.length > 0 ? (
        <Section
          tone="light"
          surface
          id="guides"
          aria-labelledby="guides-title"
        >
          <SectionHeader
            id="guides-title"
            label={t.guides.label}
            title={t.guides.title}
            lead={t.guides.lead}
          />
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {guides.map((app) => (
              <li key={app.code}>
                <AppCard lang={lang} app={app} t={t} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <FaqSection lang={lang} />
    </>
  );
}
