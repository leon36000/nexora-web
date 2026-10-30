import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { Suspense } from "react";
import { PricingPage } from "@/components/pricing/pricing-page";
import { EQUIVALENT_CREDITS } from "@/components/pricing/pricing-sections";
import { isLang } from "@/i18n/config";
import { getPricingDictionary } from "@/i18n/pricing";
import { creditEquivalents } from "@/lib/credit-equivalence";
import { buildPageMetadata } from "@/lib/metadata";
import { getPublicPacks, getPublicPlans } from "@/server/billing/pricing-read";
import { getPublicCatalog } from "@/server/gateway/read";

/**
 * Page Tarifs. Route unique pour les deux adresses publiques : /tarifs (fr) et /en/pricing (en, réécrit par
 * `proxy.ts`). Le canonical et les hreflang viennent de `localizePath`.
 */
export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getPricingDictionary(lang);
  return buildPageMetadata({
    lang,
    path: "/tarifs",
    title: t.meta.title,
    description: t.meta.description,
    siteName: "Nexora",
  });
}

export default async function TarifsPage() {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  return (
    <Suspense fallback={<div className="min-h-[60vh]" aria-hidden="true" />}>
      <Offers lang={lang} />
    </Suspense>
  );
}

async function Offers({ lang }: { lang: "fr" | "en" }) {
  const [data, packs, catalog] = await Promise.all([
    getPublicPlans(),
    getPublicPacks(),
    getPublicCatalog(),
  ]);
  // Équivalent en jetons : seulement depuis les prix publiés du catalogue ; indisponible = on le dit, on n'invente rien.
  const rows = catalog.available
    ? creditEquivalents(catalog.models, { credits: EQUIVALENT_CREDITS, max: 4 })
    : [];
  return (
    <PricingPage
      lang={lang}
      t={getPricingDictionary(lang)}
      data={data}
      packs={packs}
      equivalents={rows.length > 0 ? rows : null}
    />
  );
}
