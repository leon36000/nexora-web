import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { type AccountDictionary, fmt, formatDate } from "@/i18n/account";
import { type Lang, localizePath } from "@/i18n/config";
import { formatInteger } from "@/i18n/gateway";
import {
  ACTIVITY_PERIODS,
  type ActivityRow,
  type BreakdownRow,
} from "@/server/gateway/activity";
import type { ActivityPageData } from "@/server/gateway/activity-page";
import { activityQuery } from "./activity-links";
import { INPUT_CLASS, Notice } from "./field";
import {
  formatDateTime,
  formatDayLabel,
  formatLatency,
  formatMicroCadExact,
  sharePercent,
} from "./panel-format";
import {
  PanelHeading,
  ScrollRegion,
  SectionTitle,
  StatCard,
  TD,
  TH,
} from "./panel-ui";

export interface ActivityViewProps {
  lang: Lang;
  t: AccountDictionary;
  data: ActivityPageData;
  /** Organisation « maison » : on montre la valeur au prix public à la place d'une dépense toujours nulle. */
  free: boolean;
  /** Clés de l'organisation, pour le filtre (révoquées comprises : elles peuvent avoir un historique). */
  keys: { id: string; name: string; prefix: string }[];
}

type Dimension = "model" | "agent" | "key" | "day";

/** Valeur qui sert à comparer les lignes : la dépense (ou la valeur offerte), à défaut le nombre de requêtes. */
function weightOf(rows: BreakdownRow[], free: boolean) {
  const money = (r: BreakdownRow) => (free ? r.valueMicro : r.costMicro);
  const useMoney = rows.some((r) => money(r) > 0n);
  const of = (r: BreakdownRow) => (useMoney ? money(r) : BigInt(r.requests));
  let max = 0n;
  for (const r of rows) {
    const value = of(r);
    if (value > max) max = value;
  }
  return { of, max };
}

function FiltersForm({
  lang,
  t,
  data,
  keys,
  action,
}: Pick<ActivityViewProps, "lang" | "t" | "data" | "keys"> & {
  action: string;
}) {
  const window = data.criteria;
  const f = t.panel.activity.filters;
  const labelClass = "block text-small font-medium text-fg";
  const models = data.models.includes(data.criteria.model ?? "")
    ? data.models
    : data.criteria.model
      ? [data.criteria.model, ...data.models]
      : data.models;
  return (
    <form
      method="get"
      action={action}
      aria-label={f.label}
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      <div>
        <label htmlFor="activity-period" className={labelClass}>
          {f.period}
        </label>
        <select
          id="activity-period"
          name="period"
          defaultValue={data.period === "custom" ? "" : data.period}
          className={INPUT_CLASS}
        >
          {data.period === "custom" ? (
            <option value="" disabled>
              {fmt(f.range, {
                from: formatDate(lang, window.from),
                to: formatDate(lang, window.to),
              })}
            </option>
          ) : null}
          {ACTIVITY_PERIODS.map((p) => (
            <option key={p} value={p}>
              {f.periods[p]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="activity-model" className={labelClass}>
          {f.model}
        </label>
        <select
          id="activity-model"
          name="model"
          defaultValue={data.criteria.model ?? ""}
          className={INPUT_CLASS}
        >
          <option value="">{f.allModels}</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="activity-key" className={labelClass}>
          {f.key}
        </label>
        <select
          id="activity-key"
          name="key"
          defaultValue={data.criteria.apiKeyId ?? ""}
          className={INPUT_CLASS}
        >
          <option value="">{f.allKeys}</option>
          {keys.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name} ({k.prefix}…)
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="activity-status" className={labelClass}>
          {f.status}
        </label>
        <select
          id="activity-status"
          name="status"
          defaultValue={data.criteria.status ?? ""}
          className={INPUT_CLASS}
        >
          <option value="">{f.allStatuses}</option>
          {(["ok", "error", "aborted"] as const).map((s) => (
            <option key={s} value={s}>
              {f.statuses[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 xl:col-span-4">
        <button type="submit" className={buttonClasses({ variant: "primary" })}>
          {f.apply}
        </button>
        <ButtonLink href={action} variant="secondary">
          {f.reset}
        </ButtonLink>
      </div>
    </form>
  );
}

function Summary({
  lang,
  t,
  data,
  free,
}: Pick<ActivityViewProps, "lang" | "t" | "data" | "free">) {
  const s = t.panel.activity.summary;
  const x = data.summary;
  return (
    <section aria-labelledby="activity-summary-title">
      <SectionTitle id="activity-summary-title" className="sr-only">
        {s.title}
      </SectionTitle>
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          label={free ? s.spendFree : s.spend}
          value={formatMicroCadExact(lang, free ? x.valueMicro : x.costMicro)}
        />
        <StatCard
          label={s.requests}
          value={formatInteger(lang, x.requests)}
          note={
            x.requests === 0
              ? undefined
              : x.errors > 0
                ? fmt(s.failures, { count: formatInteger(lang, x.errors) })
                : s.noFailures
          }
        />
        <StatCard
          label={s.latency}
          value={
            x.avgLatencyMs === null
              ? s.none
              : formatLatency(lang, x.avgLatencyMs)
          }
        />
        <StatCard
          label={s.promptTokens}
          value={formatInteger(lang, x.promptTokens)}
        />
        <StatCard
          label={s.completionTokens}
          value={formatInteger(lang, x.completionTokens)}
        />
        <StatCard
          label={s.cachedTokens}
          value={formatInteger(lang, x.cachedTokens)}
          note={s.cachedNote}
        />
      </dl>
    </section>
  );
}

/** Histogramme de la dépense par jour (décoratif) : le tableau « Par jour » porte les mêmes chiffres. */
function DayChart({
  lang,
  t,
  rows,
  free,
}: {
  lang: Lang;
  t: AccountDictionary;
  rows: BreakdownRow[];
  free: boolean;
}) {
  if (rows.length === 0) return null;
  const { of, max } = weightOf(rows, free);
  const first = rows[0];
  const last = rows.at(-1);
  return (
    <div>
      <div
        role="img"
        aria-label={t.panel.activity.breakdown.chartLabel}
        className="flex h-32 items-end gap-px border-b border-line-strong"
      >
        {rows.map((r) => (
          <div
            key={r.key}
            className="min-w-px flex-1 rounded-t-xs bg-accent-graphic"
            style={{ height: `${Math.max(sharePercent(of(r), max), 2)}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-small text-fg-muted">
        <span>{first ? formatDayLabel(lang, first.key) : null}</span>
        <span>{last ? formatDayLabel(lang, last.key) : null}</span>
      </div>
    </div>
  );
}

function BreakdownTable({
  lang,
  t,
  dimension,
  title,
  rows,
  free,
}: {
  lang: Lang;
  t: AccountDictionary;
  dimension: Dimension;
  title: string;
  rows: BreakdownRow[];
  free: boolean;
}) {
  const b = t.panel.activity.breakdown;
  const caption = {
    day: b.captionDay,
    model: b.captionModel,
    agent: b.captionAgent,
    key: b.captionKey,
  }[dimension];
  const first = {
    day: b.columns.day,
    model: b.columns.model,
    agent: b.columns.agent,
    key: b.columns.key,
  }[dimension];
  const { of, max } = weightOf(rows, free);
  const id = `breakdown-${dimension}`;
  return (
    <section aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="text-body font-medium text-fg">
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-small text-fg-muted">{b.empty}</p>
      ) : (
        <div className="mt-3">
          <ScrollRegion label={caption} tall>
            <table className="w-full min-w-[34rem] border-collapse text-left text-small">
              <caption className="sr-only">{caption}</caption>
              <thead className="sticky top-0 bg-bg">
                <tr className="border-b border-line text-fg-muted">
                  <th scope="col" className={TH}>
                    {first}
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    {b.columns.requests}
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    {b.columns.input}
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    {b.columns.output}
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    {free ? t.panel.activity.summary.spendFree : b.columns.cost}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.key}
                    className="border-b border-line last:border-0"
                  >
                    <th
                      scope="row"
                      className={`px-4 py-3 text-left font-normal text-fg ${dimension === "model" || dimension === "agent" ? "font-mono" : ""}`}
                    >
                      {dimension === "day" ? r.key : r.label}
                      {dimension === "key" && r.keyPrefix ? (
                        <span className="ml-2 font-mono text-fg-muted">
                          {r.keyPrefix}…
                        </span>
                      ) : null}
                      <span
                        aria-hidden="true"
                        className="mt-1.5 block h-1 rounded-xs bg-surface-2"
                      >
                        <span
                          className="block h-full rounded-xs bg-accent-graphic"
                          style={{ width: `${sharePercent(of(r), max)}%` }}
                        />
                      </span>
                    </th>
                    <td className={`${TD} text-right tabular-nums`}>
                      {formatInteger(lang, r.requests)}
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {formatInteger(lang, r.promptTokens)}
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {formatInteger(lang, r.completionTokens)}
                    </td>
                    <td
                      className={`whitespace-nowrap ${TD} text-right tabular-nums`}
                    >
                      {formatMicroCadExact(
                        lang,
                        free ? r.valueMicro : r.costMicro,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        </div>
      )}
    </section>
  );
}

function LogTable({
  lang,
  t,
  rows,
}: {
  lang: Lang;
  t: AccountDictionary;
  rows: ActivityRow[];
}) {
  const l = t.panel.activity.log;
  const statuses = t.panel.activity.filters.statuses;
  return (
    <ScrollRegion label={l.caption}>
      <table className="w-full min-w-[56rem] border-collapse text-left text-small">
        <caption className="sr-only">{l.caption}</caption>
        <thead>
          <tr className="border-b border-line text-fg-muted">
            <th scope="col" className={TH}>
              {l.columns.time}
            </th>
            <th scope="col" className={TH}>
              {l.columns.model}
            </th>
            <th scope="col" className={TH}>
              {l.columns.key}
            </th>
            <th scope="col" className={TH}>
              {l.columns.status}
            </th>
            <th scope="col" className={`${TH} text-right`}>
              {l.columns.tokens}
            </th>
            <th scope="col" className={`${TH} text-right`}>
              {l.columns.cost}
            </th>
            <th scope="col" className={`${TH} text-right`}>
              {l.columns.latency}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line last:border-0">
              <td className={`whitespace-nowrap ${TD}`}>
                <time dateTime={r.createdAt.toISOString()}>
                  {formatDateTime(lang, r.createdAt)}
                </time>
              </td>
              <td className={TD}>
                <span className="font-mono">{r.model}</span>
                {r.stream ? (
                  <span className="block text-fg-muted">{l.stream}</span>
                ) : null}
              </td>
              <td className={TD}>
                {r.apiKeyName}
                <span className="block font-mono text-fg-muted">
                  {r.apiKeyPrefix}…
                </span>
              </td>
              <td
                className={`px-4 py-3 ${r.status === "ok" ? "text-fg" : "text-accent-text"}`}
              >
                {statuses[r.status]} · {r.httpStatus}
                {r.errorCode ? (
                  <span className="block font-mono">{r.errorCode}</span>
                ) : null}
              </td>
              <td className={`whitespace-nowrap ${TD} text-right tabular-nums`}>
                {formatInteger(lang, r.promptTokens)} /{" "}
                {formatInteger(lang, r.completionTokens)}
              </td>
              <td className={`whitespace-nowrap ${TD} text-right tabular-nums`}>
                {formatMicroCadExact(
                  lang,
                  r.billed ? r.costMicro : r.valueMicro,
                )}
                {r.billed ? null : (
                  <span className="block text-fg-muted">{l.offered}</span>
                )}
              </td>
              <td className={`whitespace-nowrap ${TD} text-right tabular-nums`}>
                {formatLatency(lang, r.latencyMs)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}

/**
 * Page « Activité » (façon OpenRouter) : filtres, synthèse, répartitions par jour, modèle, agent et clé, journal des
 * requêtes avec pagination par curseur, export CSV. Les filtres sont un formulaire GET : l'adresse porte les critères,
 * la page marche sans JavaScript et se partage. Rien du contenu des requêtes n'est lu ni affiché.
 */
export function ActivityView({ lang, t, data, free, keys }: ActivityViewProps) {
  const a = t.panel.activity;
  const window = data.criteria;
  const base = localizePath(lang, "/compte/activite");
  const criteria = {
    period: data.period,
    from: window.from,
    to: window.to,
    model: data.criteria.model,
    apiKeyId: data.criteria.apiKeyId,
    status: data.criteria.status,
  };
  const exportHref = `/api/account/activity/export?${activityQuery(criteria)}`;
  const nextHref = data.page.nextCursor
    ? `${base}?${activityQuery({ ...criteria, cursor: data.page.nextCursor })}`
    : null;
  const firstHref = `${base}?${activityQuery(criteria)}`;

  return (
    <div className="space-y-10">
      <PanelHeading id="activity-title" title={a.title} lead={a.lead} />
      {data.invalid ? <Notice tone="info">{a.invalid}</Notice> : null}

      <Card as="div">
        <FiltersForm lang={lang} t={t} data={data} keys={keys} action={base} />
      </Card>
      <p className="-mt-6 text-small text-fg-muted">
        {fmt(a.filters.range, {
          from: formatDate(lang, window.from),
          to: formatDate(lang, window.to),
        })}
      </p>

      <Summary lang={lang} t={t} data={data} free={free} />

      <section aria-labelledby="activity-breakdown-title" className="space-y-8">
        <SectionTitle id="activity-breakdown-title">
          {a.breakdown.title}
        </SectionTitle>
        <DayChart lang={lang} t={t} rows={data.byDay} free={free} />
        <div className="grid gap-8 xl:grid-cols-2">
          <BreakdownTable
            lang={lang}
            t={t}
            dimension="day"
            title={a.breakdown.byDay}
            rows={[...data.byDay].reverse()}
            free={free}
          />
          <BreakdownTable
            lang={lang}
            t={t}
            dimension="model"
            title={a.breakdown.byModel}
            rows={data.byModel}
            free={free}
          />
          <BreakdownTable
            lang={lang}
            t={t}
            dimension="agent"
            title={a.breakdown.byAgent}
            rows={data.byAgent}
            free={free}
          />
          <BreakdownTable
            lang={lang}
            t={t}
            dimension="key"
            title={a.breakdown.byKey}
            rows={data.byKey}
            free={free}
          />
        </div>
      </section>

      <section aria-labelledby="activity-log-title">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <SectionTitle id="activity-log-title">{a.log.title}</SectionTitle>
          <a
            href={exportHref}
            download
            className={buttonClasses({ variant: "secondary" })}
          >
            {a.export.button}
          </a>
        </div>
        <p className="mt-2 text-small text-fg-muted">{a.export.note}</p>
        {data.page.rows.length === 0 ? (
          <Card className="mt-6" variant="outline">
            <p className="text-body text-fg-muted">{a.log.empty}</p>
          </Card>
        ) : (
          <div className="mt-6">
            <LogTable lang={lang} t={t} rows={data.page.rows} />
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <p className="text-small text-fg-muted" role="status">
                {fmt(a.log.shown, {
                  count: formatInteger(lang, data.page.rows.length),
                })}
              </p>
              {data.hasCursor ? (
                <ButtonLink href={firstHref} variant="secondary">
                  {a.log.first}
                </ButtonLink>
              ) : null}
              {nextHref ? (
                <ButtonLink
                  href={nextHref}
                  variant="secondary"
                  rel="next"
                  arrow
                >
                  {a.log.next}
                </ButtonLink>
              ) : null}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
