import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { Suspense } from "react";
import {
  CatalogFilters,
  parseFilters,
} from "@/components/gateway/catalog-filters";
import { ModelCard } from "@/components/gateway/model-card";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { fmt, formatDate } from "@/i18n/account";
import { isLang, type Lang, localizePath } from "@/i18n/config";
import { getGatewayDictionary } from "@/i18n/gateway";
import { buildPageMetadata } from "@/lib/metadata";
import { getPublicCatalog } from "@/server/gateway/read";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getGatewayDictionary(lang);
  return buildPageMetadata({
    lang,
    path: "/modeles",
    title: t.meta.models.title,
    description: t.meta.models.description,
    siteName: "Nexora",
  });
}

type Search = Record<string, string | string[] | undefined>;

/** Catalogue public des modèles publiés (façon OpenRouter) : filtres par hébergement, capacité et type. */
export default async function ModelsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getGatewayDictionary(lang);
  return (
    <Section tone="light" aria-labelledby="models-title">
      <header className="max-w-3xl">
        <Badge tone="accent">{t.catalog.label}</Badge>
        <h1 id="models-title" className="mt-4 text-h1 text-fg">
          {t.catalog.title}
        </h1>
        <p className="mt-5 max-w-2xl text-lead text-fg-muted">
          {t.catalog.lead}
        </p>
      </header>
      <Suspense
        fallback={
          <p className="mt-10 text-fg-muted" role="status">
            …
          </p>
        }
      >
        <CatalogList lang={lang} searchParams={searchParams} />
      </Suspense>
    </Section>
  );
}

async function CatalogList({
  lang,
  searchParams,
}: {
  lang: Lang;
  searchParams: Promise<Search>;
}) {
  const t = getGatewayDictionary(lang);
  const catalog = await getPublicCatalog();
  const filters = parseFilters(await searchParams);
  const models = catalog.models.filter(
    (m) =>
      (!filters.residency || m.residency === filters.residency) &&
      (!filters.capability ||
        m.capabilities[filters.capability as keyof typeof m.capabilities] ===
          true) &&
      (!filters.kind || m.kind === filters.kind),
  );
  // Mise en avant : les modèles hébergés au Québec d'abord, puis par nom.
  models.sort(
    (a, b) =>
      Number(b.residency === "quebec") - Number(a.residency === "quebec") ||
      a.name.localeCompare(b.name, lang === "fr" ? "fr-CA" : "en-CA"),
  );

  return (
    <>
      <CatalogFilters
        t={t}
        values={filters}
        action={localizePath(lang, "/modeles")}
        className="mt-10"
      />
      <p className="mt-8 text-small text-fg-muted" role="status">
        {fmt(t.catalog.count, { count: models.length })}
        {" · "}
        {t.catalog.priceNote}
        {catalog.publishedAt
          ? ` ${fmt(t.catalog.updated, { date: formatDate(lang, new Date(catalog.publishedAt)) })}`
          : ""}
      </p>
      {models.length === 0 ? (
        <p className="mt-6 text-body text-fg-muted">
          {catalog.models.length === 0
            ? t.catalog.emptyCatalog
            : t.catalog.empty}
        </p>
      ) : (
        <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {models.map((m) => (
            <li key={m.id}>
              <ModelCard model={m} lang={lang} t={t} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
