import type { FindingKind } from "@nexora/db";
import { buttonClasses } from "@/components/ui/button";
import { type AccountDictionary, formatDate } from "@/i18n/account";
import type { Lang } from "@/i18n/config";
import { INPUT_CLASS } from "./field";
import { PanelHeading, ScrollRegion, StatCard, TD, TH } from "./panel-ui";
import { type FindingFilters, formatNanoUsd } from "./reconciliation-format";

export interface FindingRow {
  id: string;
  kind: FindingKind;
  status: "open" | "reviewed";
  foundAt: Date;
  day: string | null;
  model: string | null;
  requestId: string | null;
  expectedUsdNano: string | null;
  actualUsdNano: string | null;
  deltaUsdNano: string | null;
}

export interface LastRunView {
  day: string;
  status: "running" | "ok" | "alert" | "failed";
  ledgerRows: number | null;
  unavailable: string[];
}

/**
 * Page d'administration des écarts de facturation (personnel seulement) : dernière exécution de la réconciliation
 * quotidienne et liste des écarts. Observation seulement : aucune action ne modifie un solde. Aucun contenu de requête :
 * seulement des identifiants, des modèles et des montants.
 */
export function ReconciliationView({
  lang,
  t,
  rows,
  lastRun,
  filters,
  action,
}: {
  lang: Lang;
  t: AccountDictionary;
  rows: FindingRow[];
  lastRun: LastRunView | null;
  filters: FindingFilters;
  action: string;
}) {
  const r = t.panel.reconciliation;
  const label = "block text-small font-medium text-fg";
  const usd = (v: string | null) => formatNanoUsd(v) ?? r.table.notAvailable;
  return (
    <div className="space-y-8">
      <PanelHeading id="reconciliation-title" title={r.title} lead={r.lead} />

      <section aria-labelledby="reconciliation-last">
        <h2 id="reconciliation-last" className="text-h4 text-fg">
          {r.lastRun.label}
        </h2>
        {lastRun ? (
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            <StatCard
              label={r.lastRun.day}
              value={lastRun.day}
              note={r.lastRun.status[lastRun.status]}
            />
            <StatCard
              label={r.lastRun.compared}
              value={lastRun.ledgerRows ?? r.table.notAvailable}
            />
            <StatCard
              label={r.lastRun.unavailable}
              value={
                lastRun.unavailable.length === 0
                  ? r.lastRun.noneUnavailable
                  : lastRun.unavailable
                      .map(
                        (s) =>
                          r.lastRun.sources[
                            s as keyof typeof r.lastRun.sources
                          ] ?? s,
                      )
                      .join(", ")
              }
            />
          </dl>
        ) : (
          <p className="mt-3 text-fg-muted">{r.lastRun.none}</p>
        )}
      </section>

      <form
        method="get"
        action={action}
        aria-label={r.filters.legend}
        className="grid gap-4 sm:grid-cols-3"
      >
        <div>
          <label htmlFor="findings-kind" className={label}>
            {r.filters.kind}
          </label>
          <select
            id="findings-kind"
            name="kind"
            defaultValue={filters.kind ?? ""}
            className={INPUT_CLASS}
          >
            <option value="">{r.filters.all}</option>
            {Object.entries(r.kinds).map(([k, text]) => (
              <option key={k} value={k}>
                {text}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="findings-status" className={label}>
            {r.filters.status}
          </label>
          <select
            id="findings-status"
            name="status"
            defaultValue={filters.status ?? "all"}
            className={INPUT_CLASS}
          >
            <option value="open">{r.filters.open}</option>
            <option value="reviewed">{r.filters.reviewed}</option>
            <option value="all">{r.filters.all}</option>
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className={buttonClasses({ variant: "primary" })}
          >
            {r.filters.apply}
          </button>
        </div>
      </form>

      {rows.length === 0 ? (
        <p className="text-fg-muted" role="status">
          {r.table.empty}
        </p>
      ) : (
        <ScrollRegion label={r.table.scrollLabel} tall>
          <table className="w-full min-w-[56rem] border-collapse text-left text-small">
            <caption className="sr-only">{r.table.caption}</caption>
            <thead className="sticky top-0 bg-bg">
              <tr className="border-b border-line text-fg-muted">
                <th scope="col" className={TH}>
                  {r.table.found}
                </th>
                <th scope="col" className={TH}>
                  {r.table.kind}
                </th>
                <th scope="col" className={TH}>
                  {r.table.day}
                </th>
                <th scope="col" className={TH}>
                  {r.table.model}
                </th>
                <th scope="col" className={TH}>
                  {r.table.request}
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  {r.table.expected}
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  {r.table.actual}
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  {r.table.delta}
                </th>
                <th scope="col" className={TH}>
                  {r.table.state}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr
                  key={f.id}
                  className="border-b border-line align-top last:border-0"
                >
                  <td className={TD}>{formatDate(lang, f.foundAt)}</td>
                  <th scope="row" className={`${TD} font-medium`}>
                    {r.kinds[f.kind]}
                  </th>
                  <td className={TD}>{f.day ?? r.table.notAvailable}</td>
                  <td className={`${TD} font-mono`}>
                    {f.model ?? r.table.notAvailable}
                  </td>
                  <td className={`${TD} font-mono break-all`}>
                    {f.requestId ?? r.table.notAvailable}
                  </td>
                  <td className={`${TD} text-right tabular-nums`}>
                    {usd(f.expectedUsdNano)}
                  </td>
                  <td className={`${TD} text-right tabular-nums`}>
                    {usd(f.actualUsdNano)}
                  </td>
                  <td className={`${TD} text-right tabular-nums`}>
                    {usd(f.deltaUsdNano)}
                  </td>
                  <td className={TD}>{r.states[f.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      )}
    </div>
  );
}
