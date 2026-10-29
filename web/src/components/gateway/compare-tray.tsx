import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { fmt } from "@/i18n/account";
import { type Lang, localizePath } from "@/i18n/config";
import { type ModelsText, plural } from "@/i18n/models";
import {
  type CatalogQuery,
  compareHref,
  modelAnchor,
  queryHref,
  toggleCompare,
} from "@/lib/models/query";
import type { PublicModel } from "@/server/gateway/public";

/**
 * Barre de la sélection à comparer, fixée au bas de l'écran : les modèles choisis (chacun se retire d'un clic), le lien
 * vers `/modeles/comparer` dès que deux modèles sont choisis. Rien n'est affiché sans sélection.
 */
export function CompareTray({
  catalog,
  lang,
  t,
  query,
  base,
}: {
  catalog: readonly PublicModel[];
  lang: Lang;
  t: ModelsText;
  query: CatalogQuery;
  base: string;
}) {
  const chosen = query.compare
    .map((id) => catalog.find((m) => m.id === id))
    .filter((m): m is PublicModel => m !== undefined);
  if (chosen.length === 0) return null;
  const c = t.list.compare;
  const compareUrl = compareHref(
    localizePath(lang, "/modeles/comparer"),
    chosen.map((m) => m.id),
  );
  return (
    <aside
      aria-label={c.trayLabel}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line-strong bg-surface shadow-pop"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3 sm:px-8">
        <p className="text-small font-medium text-fg" role="status">
          {fmt(plural(lang, chosen.length, c.selected), {
            count: chosen.length,
          })}
        </p>
        <ul className="flex min-w-0 flex-1 flex-wrap gap-2">
          {chosen.map((m) => (
            <li key={m.id}>
              <Link
                href={`${queryHref(base, query, { compare: toggleCompare(query, m.id) })}#${modelAnchor(m.id)}`}
                prefetch={false}
                scroll={false}
                aria-label={fmt(c.removeLabel, { name: m.name })}
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line-strong px-3 text-small text-fg hover:bg-fg/10"
              >
                {m.name}
                <span aria-hidden="true">×</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          {chosen.length >= 2 ? (
            <ButtonLink href={compareUrl} arrow>
              {c.go}
            </ButtonLink>
          ) : (
            <span className="text-small text-fg-muted">{c.needTwo}</span>
          )}
          <Link
            href={queryHref(base, query, { compare: [] })}
            prefetch={false}
            className="inline-flex min-h-11 items-center rounded-xs px-2 text-small text-accent-text underline underline-offset-4"
          >
            {c.clear}
          </Link>
        </div>
      </div>
    </aside>
  );
}
