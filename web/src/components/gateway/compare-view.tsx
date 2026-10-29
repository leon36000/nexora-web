import Link from "next/link";
import type { ReactNode } from "react";
import { JsonLd } from "@/components/seo/json-ld";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { fmt } from "@/i18n/account";
import { type Lang, localizePath } from "@/i18n/config";
import { formatInteger, formatPriceCad } from "@/i18n/gateway";
import {
  formatDay,
  formatScore,
  getModelsDictionary,
  type ModelsText,
} from "@/i18n/models";
import { commonBenchmarks } from "@/lib/models/benchmarks";
import { compareHref } from "@/lib/models/query";
import { appBreadcrumb } from "@/lib/seo/app-jsonld";
import { SITE_NAME } from "@/lib/site";
import type { PublicModel } from "@/server/gateway/public";
import { BenchmarkWarning } from "./benchmark-list";
import { activeCapabilities } from "./capabilities";
import { licenseState } from "./model-badges";
import { modelHref } from "./model-card";

const LINK = "rounded-xs text-accent-text underline underline-offset-4";
const HEAD_CELL = "px-3 py-3 text-left align-top font-normal";
const STICKY = "sticky left-0 z-10 bg-bg";

/** Valeurs d'une ligne de spécifications, une par modèle ; `null` = non précisé par la fiche. */
function specRows(models: readonly PublicModel[], lang: Lang, t: ModelsText) {
  const r = t.compare.rows;
  const none = t.list.table.none;
  const num = (n: number) => formatInteger(lang, n);
  const row = (label: string, f: (m: PublicModel) => ReactNode | null) => ({
    label,
    cells: models.map((m) => f(m) ?? none),
  });
  const params = (m: PublicModel) => {
    const p = m.sheet.parameters;
    const s = t.detail.specs;
    const parts = [
      p?.totalB ? fmt(s.total, { n: p.totalB }) : null,
      p?.activeB ? fmt(s.active, { n: p.activeB }) : null,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  };
  return {
    pricing: [
      row(r.input, (m) => formatPriceCad(lang, m.inputPerMillion)),
      row(r.output, (m) =>
        m.kind === "chat" ? formatPriceCad(lang, m.outputPerMillion) : null,
      ),
      row(r.cachedInput, (m) =>
        m.cachePerMillion ? formatPriceCad(lang, m.cachePerMillion) : null,
      ),
    ],
    specs: [
      row(r.context, (m) => `${num(m.contextMax)} ${t.detail.specs.tokens}`),
      row(r.maxOutput, (m) =>
        m.maxOutputTokens
          ? `${num(m.maxOutputTokens)} ${t.detail.specs.tokens}`
          : null,
      ),
      row(r.parameters, params),
      row(r.quantization, (m) => m.sheet.quantization ?? null),
      row(r.inputs, (m) =>
        m.sheet.modalities?.input.length
          ? m.sheet.modalities.input.map((x) => t.modality[x]).join(", ")
          : null,
      ),
      row(r.released, (m) =>
        m.sheet.releasedAt ? formatDay(lang, m.sheet.releasedAt) : null,
      ),
      row(r.license, (m) => {
        const state = licenseState(m);
        const name = m.sheet.license?.name;
        return state
          ? [name, t.license[state]].filter(Boolean).join(" · ")
          : null;
      }),
      row(r.status, (m) =>
        m.availability === "preview"
          ? t.availability.preview
          : t.availability.live,
      ),
      row(r.host, (m) => m.providerName || null),
      row(r.capabilities, (m) => {
        const caps = activeCapabilities(m).map((c) => t.capabilities[c]);
        return caps.length ? caps.join(", ") : null;
      }),
    ],
  };
}

export function ComparePage({
  lang,
  catalog,
  ids,
}: {
  lang: Lang;
  catalog: readonly PublicModel[];
  ids: readonly string[];
}) {
  const t = getModelsDictionary(lang);
  const c = t.compare;
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const models = ids
    .map((id) => byId.get(id))
    .filter((m): m is PublicModel => m !== undefined);
  const unknown = models.length < ids.length;
  const listPath = localizePath(lang, "/modeles");
  const comparePath = localizePath(lang, "/modeles/comparer");
  const enough = models.length >= 2;
  const rows = specRows(models, lang, t);
  const bench = enough ? commonBenchmarks(models) : [];
  const listName = t.meta.list.title.replace(` | ${SITE_NAME}`, "");

  const section = (title: string) => (
    <tr>
      <th
        scope="colgroup"
        colSpan={models.length + 1}
        className="bg-surface px-3 py-2 text-left text-small font-medium text-fg"
      >
        {title}
      </th>
    </tr>
  );
  const line = (label: string, cells: ReactNode[]) => (
    <tr key={label} className="border-t border-line align-top">
      <th
        scope="row"
        className={`${STICKY} px-3 py-3 text-left text-small font-normal text-fg-muted`}
      >
        {label}
      </th>
      {cells.map((cell, i) => (
        <td
          key={models[i]?.id ?? i}
          className="px-3 py-3 text-small tabular-nums text-fg"
        >
          {cell}
        </td>
      ))}
    </tr>
  );

  return (
    <Section tone="light" aria-labelledby="compare-title">
      <nav aria-label={t.detail.breadcrumb}>
        <ol className="flex flex-wrap items-center gap-x-2 text-small text-fg-muted">
          <li>
            <Link
              href={localizePath(lang, "/")}
              className="inline-flex min-h-8 items-center rounded-xs underline underline-offset-4"
            >
              {t.detail.home}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link
              href={listPath}
              className="inline-flex min-h-8 items-center rounded-xs underline underline-offset-4"
            >
              {t.detail.models}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-fg">
            {c.breadcrumb}
          </li>
        </ol>
      </nav>
      <header className="mt-6 max-w-3xl">
        <Badge tone="accent">{c.label}</Badge>
        <h1 id="compare-title" className="mt-4 text-h1 text-fg">
          {c.title}
        </h1>
        <p className="mt-5 max-w-2xl text-lead text-fg-muted">{c.lead}</p>
      </header>

      {unknown ? (
        <p className="mt-6 max-w-2xl text-small text-fg-muted" role="status">
          {c.unknownIds}
        </p>
      ) : null}

      {!enough ? (
        <div className="mt-10 rounded-md border border-line p-6 sm:p-8">
          <h2 className="font-display text-h4 text-fg">{c.pickTitle}</h2>
          <p className="mt-2 max-w-xl text-body text-fg-muted">{c.pickText}</p>
          {models.length === 1 ? (
            <p className="mt-4 text-body text-fg">{models[0]?.name}</p>
          ) : null}
          <div className="mt-6">
            <ButtonLink
              href={
                models.length
                  ? `${listPath}?${models.map((m) => `m=${encodeURIComponent(m.id)}`).join("&")}`
                  : listPath
              }
              arrow
            >
              {c.pickCta}
            </ButtonLink>
          </div>
        </div>
      ) : (
        <>
          <section
            aria-label={c.tableLabel}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: région défilable atteignable au clavier
            tabIndex={0}
            className="mt-10 overflow-x-auto rounded-md border border-line"
          >
            <table className="w-full min-w-[40rem] border-collapse text-left">
              <caption className="sr-only">{c.tableLabel}</caption>
              <thead>
                <tr className="bg-bg">
                  <th
                    scope="col"
                    className={`${STICKY} ${HEAD_CELL} text-small text-fg-muted`}
                  >
                    {c.property}
                  </th>
                  {models.map((m) => (
                    <th
                      key={m.id}
                      scope="col"
                      className={`${HEAD_CELL} min-w-44`}
                    >
                      <Link
                        href={modelHref(lang, m.id)}
                        prefetch={false}
                        className="rounded-xs font-display text-h4 text-fg underline-offset-4 hover:underline"
                      >
                        {m.name}
                      </Link>
                      <span className="mt-0.5 block text-small text-fg-muted">
                        {m.sheet.author ?? ""}
                      </span>
                      {models.length > 2 ? (
                        <Link
                          href={compareHref(
                            comparePath,
                            ids.filter((id) => id !== m.id),
                          )}
                          prefetch={false}
                          aria-label={fmt(c.remove, { name: m.name })}
                          className="mt-1 inline-flex min-h-8 items-center rounded-xs text-small text-accent-text underline underline-offset-4"
                        >
                          {t.list.compare.remove}
                        </Link>
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section(c.sections.pricing)}
                {rows.pricing.map((r) => line(r.label, r.cells))}
              </tbody>
              <tbody>
                {section(c.sections.specs)}
                {rows.specs.map((r) => line(r.label, r.cells))}
              </tbody>
              {bench.length > 0 ? (
                <tbody>
                  {section(c.sections.benchmarks)}
                  {bench.map((row) =>
                    line(
                      row.name,
                      row.cells.map((b, i) =>
                        b ? (
                          <span key={b.sourceUrl}>
                            <span className="text-body">
                              {formatScore(lang, b.score)} {b.unit}
                            </span>
                            {row.best === i ? (
                              <span className="ml-2 rounded-xs border border-line-strong px-1.5 py-0.5 text-label text-fg">
                                {c.best}
                              </span>
                            ) : null}
                            <span className="mt-1 block text-fg-muted">
                              {fmt(t.detail.benchmarks.publishedBy, {
                                publisher: b.publisher,
                              })}
                              {" · "}
                              <a
                                href={b.sourceUrl}
                                rel="noopener noreferrer"
                                className={LINK}
                              >
                                {t.detail.benchmarks.source}
                              </a>
                            </span>
                          </span>
                        ) : (
                          <span
                            key={`${row.key}-${models[i]?.id}`}
                            className="text-fg-muted"
                          >
                            {c.missing}
                          </span>
                        ),
                      ),
                    ),
                  )}
                </tbody>
              ) : null}
            </table>
          </section>
          <div className="mt-6">
            {bench.length > 0 ? (
              <BenchmarkWarning
                title={t.detail.benchmarks.warningTitle}
                text={c.benchmarkWarning}
              />
            ) : (
              <p className="max-w-2xl text-small text-fg-muted">
                {c.noBenchmarks}
              </p>
            )}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink
              href={`${listPath}?${ids.map((id) => `m=${encodeURIComponent(id)}`).join("&")}`}
              variant="secondary"
            >
              {c.add}
            </ButtonLink>
          </div>
        </>
      )}
      <JsonLd
        data={appBreadcrumb(lang, [
          { name: listName, path: "/modeles" },
          { name: c.breadcrumb, path: "/modeles/comparer" },
        ])}
      />
    </Section>
  );
}
