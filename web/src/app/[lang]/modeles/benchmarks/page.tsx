import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { RankingsPage } from "@/components/gateway/rankings-view";
import { isLang } from "@/i18n/config";
import { getModelsDictionary } from "@/i18n/models";
import { buildPageMetadata } from "@/lib/metadata";
import { SITE_NAME } from "@/lib/site";
import { getPublicCatalog } from "@/server/gateway/read";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getModelsDictionary(lang);
  return buildPageMetadata({
    lang,
    path: "/modeles/benchmarks",
    title: t.meta.benchmarks.title,
    description: t.meta.benchmarks.description,
    siteName: SITE_NAME,
  });
}

/** Classements par épreuve : seulement des mesures publiées, avec leur éditeur et leur source. */
export default async function BenchmarksPage() {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const catalog = await getPublicCatalog();
  return <RankingsPage lang={lang} models={catalog.models} />;
}
