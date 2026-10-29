import Link from "next/link";
import { fmt } from "@/i18n/account";
import type { Lang } from "@/i18n/config";
import { formatPriceCad } from "@/i18n/gateway";
import { formatTokensShort, type ModelsText } from "@/i18n/models";
import {
  type CatalogQuery,
  type ModelSort,
  modelAnchor,
  queryHref,
} from "@/lib/models/query";
import type { PublicModel } from "@/server/gateway/public";
import { CompareToggle } from "./compare-toggle";
import { licenseState } from "./model-badges";
import { modelHref } from "./model-card";

type Column = "model" | "context" | "input" | "output";

/** Tri déclenché par l'en-tête d'une colonne : le même clic bascule croissant / décroissant pour les prix. */
function columnSort(column: Column, current: ModelSort): ModelSort {
  switch (column) {
    case "model":
      return "nom";
    case "context":
      return "contexte";
    case "input":
      return current === "prix-entree" ? "prix-entree-desc" : "prix-entree";
    case "output":
      return current === "prix-sortie" ? "prix-sortie-desc" : "prix-sortie";
  }
}

function ariaSort(
  column: Column,
  sort: ModelSort,
): "ascending" | "descending" | undefined {
  if (column === "model" && sort === "nom") return "ascending";
  if (column === "context" && sort === "contexte") return "descending";
  if (column === "input" && sort === "prix-entree") return "ascending";
  if (column === "input" && sort === "prix-entree-desc") return "descending";
  if (column === "output" && sort === "prix-sortie") return "ascending";
  if (column === "output" && sort === "prix-sortie-desc") return "descending";
  return undefined;
}

/** Vue compacte : une ligne par modèle, en-têtes triables (liens), défilement horizontal au clavier sur téléphone. */
export function ModelTable({
  models,
  lang,
  t,
  query,
  base,
}: {
  models: readonly PublicModel[];
  lang: Lang;
  t: ModelsText;
  query: CatalogQuery;
  base: string;
}) {
  const h = t.list.table;
  const head = (column: Column, label: string, align = "text-left") => (
    <th
      scope="col"
      aria-sort={ariaSort(column, query.sort)}
      className={`px-3 py-3 font-normal ${align}`}
    >
      <Link
        href={queryHref(base, query, { sort: columnSort(column, query.sort) })}
        prefetch={false}
        aria-label={fmt(h.sortBy, { column: label })}
        className="inline-flex min-h-8 items-center rounded-xs text-fg-muted underline-offset-4 hover:text-fg hover:underline"
      >
        {label}
      </Link>
    </th>
  );
  return (
    <section
      aria-label={h.label}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: région défilable atteignable au clavier
      tabIndex={0}
      className="overflow-x-auto rounded-md border border-line"
    >
      <table className="w-full min-w-[46rem] text-left text-small">
        <caption className="sr-only">
          {h.label}. {h.unitNote}
        </caption>
        <thead className="border-b border-line bg-surface">
          <tr>
            {head("model", h.model)}
            <th scope="col" className="px-3 py-3 font-normal text-fg-muted">
              {h.author}
            </th>
            {head("context", h.context, "text-right")}
            {head("input", h.input, "text-right")}
            {head("output", h.output, "text-right")}
            <th scope="col" className="px-3 py-3 font-normal text-fg-muted">
              {h.license}
            </th>
            <th scope="col" className="px-3 py-3 font-normal text-fg-muted">
              {h.status}
            </th>
            <th scope="col" className="px-3 py-3 font-normal text-fg-muted">
              <span className="sr-only">{h.compare}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {models.map((m) => {
            const state = licenseState(m);
            return (
              <tr
                key={m.id}
                id={modelAnchor(m.id)}
                className="scroll-mt-24 border-t border-line align-middle"
              >
                <th scope="row" className="px-3 py-3 font-normal">
                  <Link
                    href={modelHref(lang, m.id)}
                    prefetch={false}
                    className="rounded-xs font-medium text-fg underline-offset-4 hover:underline"
                  >
                    {m.name}
                  </Link>
                  <span className="mt-0.5 block break-all font-mono text-label text-fg-muted">
                    {m.id}
                  </span>
                </th>
                <td className="px-3 py-3 text-fg-muted">
                  {m.sheet.author ?? h.none}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-fg">
                  {formatTokensShort(lang, m.contextMax)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-fg">
                  {formatPriceCad(lang, m.inputPerMillion)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-fg">
                  {m.kind === "chat"
                    ? formatPriceCad(lang, m.outputPerMillion)
                    : h.none}
                </td>
                <td className="px-3 py-3 text-fg-muted">
                  {state ? t.license[state] : h.none}
                </td>
                <td className="px-3 py-3 text-fg-muted">
                  {m.availability === "preview"
                    ? t.availability.preview
                    : t.availability.live}
                </td>
                <td className="px-3 py-3">
                  <CompareToggle model={m} query={query} base={base} t={t} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
