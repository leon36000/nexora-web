import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { Suspense } from "react";
import { CatalogView } from "@/components/gateway/catalog-view";
import { ModelsHero } from "@/components/gateway/models-hero";
import { JsonLd } from "@/components/seo/json-ld";
import { Section } from "@/components/ui/section";
import { CatalogSkeleton } from "@/components/ui/skeleton";
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
    <>
      <ModelsHero lang={lang} t={t.hero} titleId="models-title" />
      <Section
        tone="light"
        id="catalogue"
        aria-labelledby="catalogue-title"
        className="scroll-mt-12 pt-14 md:pt-20"
      >
        <div className="mb-10 grid gap-4 md:mb-14 lg:grid-cols-12 lg:items-end lg:gap-16">
          <h2 id="catalogue-title" className="text-h2 text-fg lg:col-span-7">
            {t.list.title}
          </h2>
          <p className="max-w-xl text-lead text-fg-muted lg:col-span-5">
            {t.list.lead}
          </p>
        </div>
        <Suspense fallback={<CatalogSkeleton />}>
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
    </>
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
