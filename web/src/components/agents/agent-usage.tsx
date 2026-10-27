import { Card } from "@/components/ui/card";
import { formatMicroCad } from "@/i18n/account";
import { getAgentsDictionary } from "@/i18n/agents";
import type { Lang } from "@/i18n/config";
import { formatInteger } from "@/i18n/gateway";
import type { UsageRow } from "@/server/gateway/usage";

/** Identifiant public des agents dans `usage_events.model_public_id` : `agent/<slug>`. */
export const isAgentUsage = (row: Pick<UsageRow, "model">) =>
  row.model.startsWith("agent/");

/** Consommation par agent de l'organisation (lecture de `usage_events`), à côté de celle des modèles. */
export function AgentUsage({ lang, usage }: { lang: Lang; usage: UsageRow[] }) {
  const t = getAgentsDictionary(lang).account;
  const rows = usage.filter(isAgentUsage);
  const th = "px-4 py-3 font-medium";
  const totals = rows.reduce(
    (a, r) => ({
      requests: a.requests + r.requests,
      input: a.input + r.promptTokens,
      output: a.output + r.completionTokens,
      cost: a.cost + r.costMicro,
    }),
    { requests: 0, input: 0, output: 0, cost: 0n },
  );
  return (
    <section aria-labelledby="agent-usage-title" className="mt-16">
      <h3 id="agent-usage-title" className="text-h3 text-fg">
        {t.title}
      </h3>
      <p className="mt-3 max-w-2xl text-body text-fg-muted">{t.lead}</p>
      {rows.length === 0 ? (
        <Card className="mt-6" variant="outline">
          <p className="text-body text-fg-muted">{t.empty}</p>
        </Card>
      ) : (
        <section
          aria-label={t.caption}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: région défilable atteignable au clavier
          tabIndex={0}
          className="mt-6 overflow-x-auto rounded-md border border-line"
        >
          <table className="w-full min-w-[40rem] border-collapse text-left text-small">
            <caption className="sr-only">{t.caption}</caption>
            <thead>
              <tr className="border-b border-line text-fg-muted">
                <th scope="col" className={th}>
                  {t.columns.day}
                </th>
                <th scope="col" className={th}>
                  {t.columns.agent}
                </th>
                <th scope="col" className={`${th} text-right`}>
                  {t.columns.requests}
                </th>
                <th scope="col" className={`${th} text-right`}>
                  {t.columns.input}
                </th>
                <th scope="col" className={`${th} text-right`}>
                  {t.columns.output}
                </th>
                <th scope="col" className={`${th} text-right`}>
                  {t.columns.cost}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.day}|${r.model}`}
                  className="border-b border-line"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-fg">
                    {r.day}
                  </td>
                  <td className="px-4 py-3 font-mono text-fg">{r.model}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-fg">
                    {formatInteger(lang, r.requests)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-fg">
                    {formatInteger(lang, r.promptTokens)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-fg">
                    {formatInteger(lang, r.completionTokens)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-fg">
                    {formatMicroCad(lang, r.costMicro)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-medium">
                <th
                  scope="row"
                  colSpan={2}
                  className="px-4 py-3 text-left text-fg"
                >
                  {t.total}
                </th>
                <td className="px-4 py-3 text-right tabular-nums text-fg">
                  {formatInteger(lang, totals.requests)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-fg">
                  {formatInteger(lang, totals.input)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-fg">
                  {formatInteger(lang, totals.output)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-fg">
                  {formatMicroCad(lang, totals.cost)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}
    </section>
  );
}
