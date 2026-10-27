import type { AgentsDictionary } from "@/i18n/agents";
import type { Lang } from "@/i18n/config";
import { formatPriceCad } from "@/i18n/gateway";
import type { PublicAgent } from "@/server/agents/public";

const positive = (decimal: string) => decimal !== "0";

/** Prix d'un agent : par exécution et/ou par million de jetons (seules les composantes positives s'affichent). */
export function AgentPricing({
  agent,
  lang,
  t,
  large = false,
}: {
  agent: PublicAgent;
  lang: Lang;
  t: AgentsDictionary;
  large?: boolean;
}) {
  const c = t.catalog;
  const value = large
    ? "mt-1 font-display text-h3 tabular-nums text-fg"
    : "mt-0.5 tabular-nums text-fg";
  const rows: { label: string; amount: string; unit: string | null }[] = [];
  if (positive(agent.perRun))
    rows.push({ label: c.perRun, amount: agent.perRun, unit: null });
  if (positive(agent.inputPerMillion))
    rows.push({
      label: c.input,
      amount: agent.inputPerMillion,
      unit: c.perMillion,
    });
  if (positive(agent.outputPerMillion))
    rows.push({
      label: c.output,
      amount: agent.outputPerMillion,
      unit: c.perMillion,
    });
  return (
    <dl
      className={
        large
          ? "grid grid-cols-2 gap-6"
          : "grid grid-cols-2 gap-x-4 gap-y-3 text-small"
      }
    >
      {rows.map((r) => (
        <div key={r.label}>
          <dt className="text-fg-muted">{r.label}</dt>
          <dd className={value}>{formatPriceCad(lang, r.amount)}</dd>
          {r.unit ? (
            <dd className="text-small text-fg-muted">{r.unit}</dd>
          ) : null}
        </div>
      ))}
    </dl>
  );
}
