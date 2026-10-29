import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { fmt, formatDate } from "@/i18n/account";
import { type Lang, localizePath } from "@/i18n/config";
import { formatInteger, formatPriceCad } from "@/i18n/gateway";
import { getModelsDictionary, type ModelsText, plural } from "@/i18n/models";
import { cn } from "@/lib/cn";
import {
  type ActiveFilter,
  activeFilters,
  applyQuery,
  type CatalogFacets,
  type CatalogQuery,
  catalogFacets,
  queryHref,
  VIEWS,
} from "@/lib/models/query";
import type { PublicCatalog } from "@/server/gateway/read";
import { CatalogFilters } from "./catalog-filters";
import { CategoryShortcuts } from "./category-shortcuts";
import { CompareTray } from "./compare-tray";
import { ModelCard } from "./model-card";
import { ModelTable } from "./model-table";

/** Texte d'une pastille de filtre actif (jamais l'identifiant brut de l'adresse). */
export function filterLabel(
  f: ActiveFilter,
  t: ModelsText,
  lang: Lang,
  facets: CatalogFacets,
): string {
  const l = t.list;
  const v = f.value;
  switch (f.field) {
    case "q":
      return fmt(l.chip.q, { value: v });
    case "kind":
      return l.kinds[v as keyof typeof l.kinds];
    case "inputs":
      return t.modality[v as keyof typeof t.modality];
    case "tags":
      return t.tags[v as keyof typeof t.tags];
    case "capabilities":
      return t.capabilities[v as keyof typeof t.capabilities];
    case "author":
      return facets.authors.find((a) => a.slug === v)?.label ?? v;
    case "license":
      return l.licenseOptions[v as keyof typeof l.licenseOptions];
    case "availability":
      return l.availabilityOptions[v as keyof typeof l.availabilityOptions];
    case "residency":
      return t.residency[v as keyof typeof t.residency];
    case "minContext":
      return fmt(l.chip.minContext, { value: formatInteger(lang, Number(v)) });
    case "maxInput":
      return fmt(l.chip.maxInput, { value: formatPriceCad(lang, v) });
    case "maxOutput":
      return fmt(l.chip.maxOutput, { value: formatPriceCad(lang, v) });
    default:
      return v;
  }
}

/**
 * Corps de la page /modeles : raccourcis, recherche et filtres, filtres actifs, compteur, cartes ou tableau, état
 * « aucun résultat », barre de comparaison. Pur rendu : tout vient du catalogue publié et de la requête d'adresse.
 */
export function CatalogView({
  lang,
  catalog,
  query,
}: {
  lang: Lang;
  catalog: PublicCatalog;
  query: CatalogQuery;
}) {
  const t = getModelsDictionary(lang);
  const l = t.list;
  const base = localizePath(lang, "/modeles");
  const locale = lang === "fr" ? "fr-CA" : "en-CA";
  const facets = catalogFacets(catalog.models, locale);
  const models = applyQuery(catalog.models, query, locale);
  const active = activeFilters(query);
  const total = catalog.models.length;
  const showResidency = facets.residencies.length > 1;

  if (total === 0)
    return <p className="mt-10 text-body text-fg-muted">{l.emptyCatalog}</p>;

  return (
    <>
      <CategoryShortcuts
        t={t}
        query={query}
        facets={facets}
        base={base}
        className="mt-10"
      />
      <CatalogFilters
        t={t}
        lang={lang}
        query={query}
        facets={facets}
        action={base}
        className="mt-4"
      />

      {active.length > 0 ? (
        <ul aria-label={l.activeFilters} className="mt-5 flex flex-wrap gap-2">
          {active.map((f) => {
            const label = filterLabel(f, t, lang, facets);
            return (
              <li key={f.key}>
                <Link
                  href={queryHref(base, query, f.remove)}
                  prefetch={false}
                  aria-label={fmt(l.removeFilter, { label })}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line-strong px-3 text-small text-fg hover:bg-fg/10"
                >
                  {label}
                  <span aria-hidden="true">×</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="text-small text-fg-muted" role="status">
          <span className="font-medium text-fg">
            {fmt(plural(lang, models.length, l.count), {
              count: models.length,
              total,
            })}
          </span>
          {" · "}
          {l.priceNote}
          {catalog.publishedAt
            ? ` ${fmt(l.updated, { date: formatDate(lang, new Date(catalog.publishedAt)) })}`
            : ""}
        </p>
        <nav aria-label={l.viewLabel}>
          <ul className="flex overflow-hidden rounded-md border border-line-strong">
            {VIEWS.map((v) => (
              <li key={v}>
                <Link
                  href={queryHref(base, query, { view: v })}
                  prefetch={false}
                  aria-current={query.view === v ? "true" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center px-4 text-small",
                    query.view === v
                      ? "bg-fg text-bg"
                      : "text-fg hover:bg-fg/10",
                  )}
                >
                  {l.views[v]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {models.length === 0 ? (
        <div className="mt-8 rounded-md border border-line p-6 sm:p-8">
          <h2 className="font-display text-h4 text-fg">{l.empty.title}</h2>
          <p className="mt-2 max-w-xl text-body text-fg-muted">
            {l.empty.text}
          </p>
          {active.length > 0 ? (
            <ul className="mt-4 flex flex-wrap gap-2">
              {active.map((f) => {
                const label = filterLabel(f, t, lang, facets);
                return (
                  <li key={f.key}>
                    <Link
                      href={queryHref(base, query, f.remove)}
                      prefetch={false}
                      aria-label={fmt(l.removeFilter, { label })}
                      className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line-strong px-3 text-small text-fg hover:bg-fg/10"
                    >
                      {label}
                      <span aria-hidden="true">×</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <div className="mt-6">
            <ButtonLink
              href={queryHref(base, query, {
                q: "",
                kind: "",
                inputs: [],
                tags: [],
                capabilities: [],
                author: "",
                license: "",
                availability: "",
                residency: "",
                minContext: null,
                maxInput: null,
                maxOutput: null,
              })}
              variant="secondary"
            >
              {l.empty.reset}
            </ButtonLink>
          </div>
        </div>
      ) : query.view === "tableau" ? (
        <div className="mt-6">
          <ModelTable
            models={models}
            lang={lang}
            t={t}
            query={query}
            base={base}
          />
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {models.map((m) => (
            <li key={m.id}>
              <ModelCard
                model={m}
                lang={lang}
                t={t}
                query={query}
                base={base}
                showResidency={showResidency}
              />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-10">
        <Link
          href={localizePath(lang, "/modeles/benchmarks")}
          prefetch={false}
          className="inline-flex min-h-11 items-center rounded-xs text-small text-accent-text underline underline-offset-4"
        >
          {l.benchmarksLink}
        </Link>
      </p>
      {query.compare.length > 0 ? (
        <div className="h-24" aria-hidden="true" />
      ) : null}
      <CompareTray
        catalog={catalog.models}
        lang={lang}
        t={t}
        query={query}
        base={base}
      />
    </>
  );
}
