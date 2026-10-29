import { MODEL_TAGS } from "@nexora/db";
import Link from "next/link";
import type { ModelsText } from "@/i18n/models";
import { cn } from "@/lib/cn";
import {
  type CatalogFacets,
  type CatalogQuery,
  queryHref,
} from "@/lib/models/query";

const PILL =
  "inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-md border px-3 text-small transition-colors duration-150";

/**
 * Rangée de raccourcis par catégorie (étiquettes de la fiche) : de simples liens qui posent `?etiquette=…` en
 * gardant les autres filtres. Seules les catégories qui ont au moins un modèle sont proposées.
 */
export function CategoryShortcuts({
  t,
  query,
  facets,
  base,
  className,
}: {
  t: ModelsText;
  query: CatalogQuery;
  facets: CatalogFacets;
  base: string;
  className?: string;
}) {
  const tags = MODEL_TAGS.filter((tag) => facets.tags[tag] > 0);
  if (tags.length === 0) return null;
  const current = query.tags.length === 1 ? query.tags[0] : null;
  return (
    <nav aria-label={t.list.shortcutsLabel} className={className}>
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
        <li>
          <Link
            href={queryHref(base, query, { tags: [] })}
            prefetch={false}
            aria-current={query.tags.length === 0 ? "true" : undefined}
            className={cn(
              PILL,
              query.tags.length === 0
                ? "border-fg bg-fg text-bg"
                : "border-line-strong text-fg hover:bg-fg/10",
            )}
          >
            {t.list.shortcutsAll}
          </Link>
        </li>
        {tags.map((tag) => (
          <li key={tag}>
            <Link
              href={queryHref(base, query, { tags: [tag] })}
              prefetch={false}
              aria-current={current === tag ? "true" : undefined}
              className={cn(
                PILL,
                current === tag
                  ? "border-fg bg-fg text-bg"
                  : "border-line-strong text-fg hover:bg-fg/10",
              )}
            >
              {t.tags[tag]}
              <span
                className={cn(
                  "tabular-nums",
                  current === tag ? "text-bg/80" : "text-fg-muted",
                )}
              >
                {facets.tags[tag]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
