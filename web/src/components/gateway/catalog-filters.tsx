import { MODEL_TAGS } from "@nexora/db";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { fmt } from "@/i18n/account";
import type { Lang } from "@/i18n/config";
import { formatInteger, formatPriceCad } from "@/i18n/gateway";
import type { ModelsText } from "@/i18n/models";
import {
  activeFilters,
  CAPABILITY_FILTERS,
  type CatalogFacets,
  type CatalogQuery,
  CONTEXT_TIERS,
  DEFAULT_QUERY,
  INPUT_MODALITIES,
  KINDS,
  LICENSES,
  PRICE_TIERS,
  queryHref,
  SORTS,
} from "@/lib/models/query";

const FIELD =
  "mt-2 block min-h-11 w-full rounded-md border border-line-strong bg-bg px-3 py-2 text-body text-fg";
const LABEL = "block text-small font-medium text-fg";

function Select({
  id,
  name,
  label,
  value,
  children,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <select id={id} name={name} defaultValue={value} className={FIELD}>
        {children}
      </select>
    </div>
  );
}

function CheckGroup({
  legend,
  name,
  options,
}: {
  legend: string;
  name: string;
  options: { value: string; label: string; checked: boolean }[];
}) {
  if (options.length === 0) return null;
  return (
    <fieldset className="min-w-0">
      <legend className={LABEL}>{legend}</legend>
      <ul className="mt-1 grid">
        {options.map((o) => (
          <li key={o.value}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-body text-fg">
              <input
                type="checkbox"
                name={name}
                value={o.value}
                defaultChecked={o.checked}
                className="size-5 shrink-0 accent-accent-text"
              />
              {o.label}
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

/**
 * Recherche, tri et filtres du catalogue : un formulaire GET dont chaque champ devient un paramètre d'adresse
 * (partageable, rendu côté serveur, sans JavaScript). Les filtres sont dans un bloc repliable `<details>`, ouvert dès
 * qu'un filtre est actif. Seules les options qui existent au catalogue sont proposées.
 */
export function CatalogFilters({
  t,
  lang,
  query,
  facets,
  action,
  className,
}: {
  t: ModelsText;
  lang: Lang;
  query: CatalogQuery;
  facets: CatalogFacets;
  action: string;
  className?: string;
}) {
  const l = t.list;
  const count = activeFilters(query).filter((f) => f.field !== "q").length;
  const resetHref = queryHref(action, DEFAULT_QUERY, {
    view: query.view,
    compare: query.compare,
  });
  const tagOptions = MODEL_TAGS.filter(
    (tag) => facets.tags[tag] > 0 || query.tags.includes(tag),
  ).map((tag) => ({
    value: tag,
    label: `${t.tags[tag]} (${facets.tags[tag]})`,
    checked: query.tags.includes(tag),
  }));
  const inputOptions = INPUT_MODALITIES.filter(
    (m) => facets.inputs[m] > 0 || query.inputs.includes(m),
  ).map((m) => ({
    value: m,
    label: `${t.modality[m]} (${facets.inputs[m]})`,
    checked: query.inputs.includes(m),
  }));
  const capabilityOptions = CAPABILITY_FILTERS.map((c) => ({
    value: c,
    label: t.capabilities[c],
    checked: query.capabilities.includes(c),
  }));
  const submit = (
    <Button type="submit" className="w-full sm:w-auto">
      {l.apply}
    </Button>
  );
  return (
    <search className={className}>
      <form
        method="get"
        action={action}
        aria-label={l.filtersLabel}
        className="grid gap-4"
      >
        {query.view !== DEFAULT_QUERY.view ? (
          <input type="hidden" name="vue" value={query.view} />
        ) : null}
        {query.compare.map((id) => (
          <input key={id} type="hidden" name="m" value={id} />
        ))}
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem_auto] md:items-end">
          <div>
            <label htmlFor="f-q" className={LABEL}>
              {l.searchLabel}
            </label>
            <input
              id="f-q"
              type="search"
              name="q"
              defaultValue={query.q}
              placeholder={l.searchHint}
              maxLength={80}
              autoComplete="off"
              className={FIELD}
            />
          </div>
          <Select id="f-tri" name="tri" label={l.sortLabel} value={query.sort}>
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {t.sorts[s]}
              </option>
            ))}
          </Select>
          {submit}
        </div>

        <details
          open={count > query.tags.length}
          className="group rounded-md border border-line"
        >
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md px-4 py-2 text-small font-medium text-fg">
            <span>
              {count > 0 ? fmt(l.filtersActive, { count }) : l.filtersSummary}
            </span>
            <svg
              viewBox="0 0 16 16"
              aria-hidden="true"
              focusable="false"
              className="size-4 shrink-0 transition-transform duration-150 group-open:rotate-180"
            >
              <path
                d="M3 6l5 5 5-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              />
            </svg>
          </summary>
          <div className="grid gap-x-6 gap-y-5 border-t border-line p-4 sm:grid-cols-2 lg:grid-cols-3">
            <Select
              id="f-type"
              name="type"
              label={l.groups.kind}
              value={query.kind}
            >
              <option value="">{l.any}</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {l.kinds[k]}
                </option>
              ))}
            </Select>
            <Select
              id="f-licence"
              name="licence"
              label={l.groups.license}
              value={query.license}
            >
              <option value="">{l.any}</option>
              {LICENSES.map((x) => (
                <option key={x} value={x}>
                  {l.licenseOptions[x]}
                </option>
              ))}
            </Select>
            <Select
              id="f-disponibilite"
              name="disponibilite"
              label={l.groups.availability}
              value={query.availability}
            >
              <option value="">{l.any}</option>
              <option value="disponible">
                {l.availabilityOptions.disponible} ({facets.live})
              </option>
              <option value="apercu">
                {l.availabilityOptions.apercu} ({facets.preview})
              </option>
            </Select>
            {facets.authors.length > 0 ? (
              <Select
                id="f-editeur"
                name="editeur"
                label={l.groups.author}
                value={query.author}
              >
                <option value="">{l.any}</option>
                {facets.authors.map((a) => (
                  <option key={a.slug} value={a.slug}>
                    {a.label} ({a.count})
                  </option>
                ))}
              </Select>
            ) : null}
            {facets.residencies.length > 1 ? (
              <Select
                id="f-hebergement"
                name="hebergement"
                label={l.groups.residency}
                value={query.residency}
              >
                <option value="">{l.any}</option>
                {facets.residencies.map((r) => (
                  <option key={r} value={r}>
                    {t.residency[r]}
                  </option>
                ))}
              </Select>
            ) : null}
            <Select
              id="f-contexte"
              name="contexte"
              label={l.groups.context}
              value={query.minContext === null ? "" : String(query.minContext)}
            >
              <option value="">{l.anyContext}</option>
              {CONTEXT_TIERS.map((n) => (
                <option key={n} value={n}>
                  {fmt(l.contextAtLeast, { n: formatInteger(lang, n) })}
                </option>
              ))}
            </Select>
            <Select
              id="f-prix-entree"
              name="prix-entree"
              label={l.groups.priceIn}
              value={query.maxInput === null ? "" : String(query.maxInput)}
            >
              <option value="">{l.anyPrice}</option>
              {PRICE_TIERS.map((n) => (
                <option key={n} value={n}>
                  {fmt(l.priceAtMost, {
                    price: formatPriceCad(lang, String(n)),
                  })}
                </option>
              ))}
            </Select>
            <Select
              id="f-prix-sortie"
              name="prix-sortie"
              label={l.groups.priceOut}
              value={query.maxOutput === null ? "" : String(query.maxOutput)}
            >
              <option value="">{l.anyPrice}</option>
              {PRICE_TIERS.map((n) => (
                <option key={n} value={n}>
                  {fmt(l.priceAtMost, {
                    price: formatPriceCad(lang, String(n)),
                  })}
                </option>
              ))}
            </Select>
            <CheckGroup
              legend={l.groups.tags}
              name="etiquette"
              options={tagOptions}
            />
            <CheckGroup
              legend={l.groups.capabilities}
              name="capacite"
              options={capabilityOptions}
            />
            <CheckGroup
              legend={l.groups.inputs}
              name="entree"
              options={inputOptions}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-line p-4">
            {submit}
            <a
              href={resetHref}
              className="inline-flex min-h-11 items-center rounded-xs px-2 text-small text-accent-text underline underline-offset-4"
            >
              {l.reset}
            </a>
          </div>
        </details>
      </form>
    </search>
  );
}
