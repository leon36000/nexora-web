import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { Suspense } from "react";
import { PricingPage } from "@/components/pricing/pricing-page";
import { isLang } from "@/i18n/config";
import { getPricingDictionary } from "@/i18n/pricing";
import { buildPageMetadata } from "@/lib/metadata";
import { getPublicPlans } from "@/server/billing/pricing-read";

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
  const data = await getPublicPlans();
  return <PricingPage lang={lang} t={getPricingDictionary(lang)} data={data} />;
}
