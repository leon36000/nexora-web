import Link from "next/link";
import { fmt } from "@/i18n/account";
import type { ModelsText } from "@/i18n/models";
import { cn } from "@/lib/cn";
import {
  type CatalogQuery,
  MAX_COMPARE,
  modelAnchor,
  queryHref,
  toggleCompare,
} from "@/lib/models/query";
import type { PublicModel } from "@/server/gateway/public";

const LINK =
  "inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-small font-medium transition-colors duration-150";

/**
 * Bouton « Comparer » d'un modèle : un simple lien qui ajoute ou retire le modèle du paramètre `m` de l'adresse
 * courante (les filtres sont conservés). Aucun JavaScript requis ; l'ancre ramène à la même carte.
 */
export function CompareToggle({
  model,
  query,
  base,
  t,
  className,
}: {
  model: PublicModel;
  query: CatalogQuery;
  /** Adresse localisée de la liste. */
  base: string;
  t: ModelsText;
  className?: string;
}) {
  const c = t.list.compare;
  const selected = query.compare.includes(model.id);
  const full = !selected && query.compare.length >= MAX_COMPARE;
  if (full)
    return (
      <span
        className={cn(LINK, "border-line text-fg-muted opacity-70", className)}
      >
        {c.full}
      </span>
    );
  const href = `${queryHref(base, query, { compare: toggleCompare(query, model.id) })}#${modelAnchor(model.id)}`;
  return (
    <Link
      href={href}
      prefetch={false}
      scroll={false}
      aria-label={fmt(selected ? c.removeLabel : c.addLabel, {
        name: model.name,
      })}
      className={cn(
        LINK,
        selected
          ? "border-accent-text bg-fg/[0.06] text-accent-text"
          : "border-line-strong text-fg hover:bg-fg/10",
        className,
      )}
    >
      <span aria-hidden="true">{selected ? "✓" : "+"}</span>
      {selected ? c.remove : c.add}
    </Link>
  );
}
