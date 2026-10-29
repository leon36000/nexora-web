import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { Suspense } from "react";
import { ComparePage } from "@/components/gateway/compare-view";
import { isLang, type Lang } from "@/i18n/config";
import { getModelsDictionary } from "@/i18n/models";
import { buildPageMetadata } from "@/lib/metadata";
import { parseCompareIds } from "@/lib/models/query";
import { SITE_NAME } from "@/lib/site";
import { getPublicCatalog } from "@/server/gateway/read";

type Search = Record<string, string | string[] | undefined>;

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getModelsDictionary(lang);
  // Page dépendante de l'adresse : jamais indexée (la liste et les fiches portent le référencement).
  return buildPageMetadata({
    lang,
    path: "/modeles/comparer",
    title: t.meta.compare.title,
    description: t.meta.compare.description,
    siteName: SITE_NAME,
    noindex: true,
  });
}

/** Comparateur : de deux à quatre modèles, choisis par les paramètres `m` de l'adresse. */
export default async function ComparePageRoute({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  return (
    <Suspense fallback={<div aria-hidden="true" className="min-h-[40rem]" />}>
      <CompareBody lang={lang} searchParams={searchParams} />
    </Suspense>
  );
}

async function CompareBody({
  lang,
  searchParams,
}: {
  lang: Lang;
  searchParams: Promise<Search>;
}) {
  const [catalog, raw] = await Promise.all([getPublicCatalog(), searchParams]);
  return (
    <ComparePage
      lang={lang}
      catalog={catalog.models}
      ids={parseCompareIds(raw.m)}
    />
  );
}
