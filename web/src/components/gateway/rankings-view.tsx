import Link from "next/link";
import { JsonLd } from "@/components/seo/json-ld";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { fmt } from "@/i18n/account";
import { type Lang, localizePath } from "@/i18n/config";
import { formatScore, getModelsDictionary, plural } from "@/i18n/models";
import { buildRankings, scorePercent } from "@/lib/models/benchmarks";
import { appBreadcrumb } from "@/lib/seo/app-jsonld";
import { SITE_NAME } from "@/lib/site";
import type { PublicModel } from "@/server/gateway/public";
import { BenchmarkWarning, ScoreBar } from "./benchmark-list";
import { modelHref } from "./model-card";

const LINK = "rounded-xs text-accent-text underline underline-offset-4";

/** Classements par épreuve : une table pour chaque épreuve publiée pour au moins trois modèles du catalogue. */
export function RankingsPage({
  lang,
  models,
}: {
  lang: Lang;
  models: readonly PublicModel[];
}) {
  const t = getModelsDictionary(lang);
  const r = t.rankings;
  const rankings = buildRankings(models, 3, lang === "fr" ? "fr-CA" : "en-CA");
  const listName = t.meta.list.title.replace(` | ${SITE_NAME}`, "");
  return (
    <Section tone="light" aria-labelledby="rankings-title">
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
              href={localizePath(lang, "/modeles")}
              className="inline-flex min-h-8 items-center rounded-xs underline underline-offset-4"
            >
              {t.detail.models}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-fg">
            {r.breadcrumb}
          </li>
        </ol>
      </nav>
      <header className="mt-6 max-w-3xl">
        <Badge tone="accent">{r.label}</Badge>
        <h1 id="rankings-title" className="mt-4 text-h1 text-fg">
          {r.title}
        </h1>
        <p className="mt-5 max-w-2xl text-lead text-fg-muted">{r.lead}</p>
        <BenchmarkWarning title={r.warningTitle} text={r.warning} />
      </header>

      {rankings.length === 0 ? (
        <div className="mt-10 rounded-md border border-line p-6 sm:p-8">
          <p className="max-w-xl text-body text-fg-muted">{r.empty}</p>
          <div className="mt-6">
            <ButtonLink
              href={localizePath(lang, "/modeles")}
              variant="secondary"
            >
              {r.back}
            </ButtonLink>
          </div>
        </div>
      ) : (
        <>
          <nav aria-label={r.jump} className="mt-10">
            <ul className="flex flex-wrap gap-2">
              {rankings.map((b) => (
                <li key={b.key}>
                  <a
                    href={`#${b.slug}`}
                    className="inline-flex min-h-11 items-center rounded-md border border-line-strong px-3 text-small text-fg hover:bg-fg/10"
                  >
                    {b.name}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-10 grid gap-14">
            {rankings.map((b) => (
              <section
                key={b.key}
                id={b.slug}
                aria-labelledby={`${b.slug}-title`}
                className="scroll-mt-24"
              >
                <h2 id={`${b.slug}-title`} className="text-h3 text-fg">
                  {b.name}
                </h2>
                <p className="mt-2 text-small text-fg-muted">
                  {b.category ? `${b.category} · ` : ""}
                  {fmt(plural(lang, b.modelCount, r.count), {
                    count: b.modelCount,
                  })}
                  {" · "}
                  {fmt(r.unitLabel, { unit: b.unit })}
                  {" · "}
                  {b.publishers.length === 1
                    ? fmt(r.samePublisher, {
                        publisher: b.publishers[0] as string,
                      })
                    : r.mixedPublishers}
                </p>
                <div className="mt-4 overflow-x-auto rounded-md border border-line">
                  <table className="w-full min-w-[34rem] text-left text-small">
                    <caption className="sr-only">{b.name}</caption>
                    <thead className="border-b border-line bg-surface text-fg-muted">
                      <tr>
                        <th scope="col" className="px-3 py-3 font-normal">
                          {r.cols.rank}
                        </th>
                        <th scope="col" className="px-3 py-3 font-normal">
                          {r.cols.model}
                        </th>
                        <th scope="col" className="px-3 py-3 font-normal">
                          {r.cols.score}
                        </th>
                        <th scope="col" className="px-3 py-3 font-normal">
                          {r.cols.publisher}
                        </th>
                        <th scope="col" className="px-3 py-3 font-normal">
                          {r.cols.source}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {b.rows.map((row, i) => {
                        const percent = scorePercent(row.benchmark);
                        return (
                          <tr
                            key={`${row.model.id}-${row.benchmark.publisher}-${row.benchmark.sourceUrl}`}
                            className="border-t border-line align-top"
                          >
                            <td className="px-3 py-3 tabular-nums text-fg-muted">
                              {i + 1}
                            </td>
                            <th scope="row" className="px-3 py-3 font-normal">
                              <Link
                                href={modelHref(lang, row.model.id)}
                                prefetch={false}
                                className="rounded-xs font-medium text-fg underline-offset-4 hover:underline"
                              >
                                {row.model.name}
                              </Link>
                              <span className="block text-fg-muted">
                                {row.model.sheet.author ?? ""}
                              </span>
                            </th>
                            <td className="min-w-36 px-3 py-3 tabular-nums text-fg">
                              {formatScore(lang, row.benchmark.score)}{" "}
                              {row.benchmark.unit}
                              {percent !== null ? (
                                <div className="mt-2">
                                  <ScoreBar percent={percent} />
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-3 text-fg">
                              {row.benchmark.publisher}
                            </td>
                            <td className="px-3 py-3">
                              <a
                                href={row.benchmark.sourceUrl}
                                rel="noopener noreferrer"
                                className={LINK}
                              >
                                {r.source}
                                <span className="sr-only">
                                  {" "}
                                  ({b.name}, {row.model.name})
                                </span>
                              </a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        </>
      )}
      <JsonLd
        data={appBreadcrumb(lang, [
          { name: listName, path: "/modeles" },
          { name: r.breadcrumb, path: "/modeles/benchmarks" },
        ])}
      />
    </Section>
  );
}
