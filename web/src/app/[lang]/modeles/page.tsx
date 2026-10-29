import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { Suspense } from "react";
import { CatalogView } from "@/components/gateway/catalog-view";
import { JsonLd } from "@/components/seo/json-ld";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { isLang, type Lang } from "@/i18n/config";
import { getModelsDictionary } from "@/i18n/models";
import { buildPageMetadata } from "@/lib/metadata";
import { parseQuery } from "@/lib/models/query";
import { appBreadcrumb } from "@/lib/seo/app-jsonld";
import { SITE_NAME } from "@/lib/site";
import { getPublicCatalog } from "@/server/gateway/read";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getModelsDictionary(lang);
  // Toutes les variantes de filtre et de tri partagent l'adresse canonique de la liste.
  return buildPageMetadata({
    lang,
    path: "/modeles",
    title: t.meta.list.title,
    description: t.meta.list.description,
    siteName: SITE_NAME,
  });
}

type Search = Record<string, string | string[] | undefined>;

/**
 * Catalogue public des modèles (façon OpenRouter) : recherche, filtres, tri et vue par l'adresse, rendus côté serveur ;
 * sélection à comparer par le paramètre `m`.
 */
export default async function ModelsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getModelsDictionary(lang);
  return (
    <Section tone="light" aria-labelledby="models-title">
      <header className="max-w-3xl">
        <Badge tone="accent">{t.list.label}</Badge>
        <h1 id="models-title" className="mt-4 text-h2 text-fg">
          {t.list.title}
        </h1>
        <p className="mt-4 max-w-2xl text-lead text-fg-muted">{t.list.lead}</p>
      </header>
      <Suspense
        fallback={<div aria-hidden="true" className="mt-10 min-h-[40rem]" />}
      >
        <CatalogBody lang={lang} searchParams={searchParams} />
      </Suspense>
      <JsonLd
        data={appBreadcrumb(lang, [
          {
            name: t.meta.list.title.replace(` | ${SITE_NAME}`, ""),
            path: "/modeles",
          },
        ])}
      />
    </Section>
  );
}

async function CatalogBody({
  lang,
  searchParams,
}: {
  lang: Lang;
  searchParams: Promise<Search>;
}) {
  const [catalog, raw] = await Promise.all([getPublicCatalog(), searchParams]);
  return <CatalogView lang={lang} catalog={catalog} query={parseQuery(raw)} />;
}
