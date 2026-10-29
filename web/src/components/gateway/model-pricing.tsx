import { fmt } from "@/i18n/account";
import type { Lang } from "@/i18n/config";
import { formatPriceCad } from "@/i18n/gateway";
import type { ModelsText } from "@/i18n/models";
import type { PublicModel } from "@/server/gateway/public";

const two = (n: number) => String(n).padStart(2, "0");
const clock = (minute: number) =>
  `${two(Math.floor(minute / 60) % 24)} h ${two(minute % 60)}`;

/** « lun.–ven. » pour des jours consécutifs, sinon la liste ; dimanche = 0. */
export function dayLabel(days: number[], names: readonly string[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  const name = (d: number) => names[d] ?? "";
  if (
    sorted.length > 2 &&
    sorted.every((d, i) => i === 0 || d === (sorted[i - 1] as number) + 1)
  )
    return `${name(sorted[0] as number)}–${name(sorted[sorted.length - 1] as number)}`;
  return sorted.map(name).join(", ");
}

/** Tarifs d'un modèle : prix de base, écriture du cache, plages horaires. Tout vient du catalogue publié. */
export function ModelPricing({
  model,
  lang,
  t,
}: {
  model: PublicModel;
  lang: Lang;
  t: ModelsText;
}) {
  const p = t.detail.pricing;
  const price = (label: string, value: string) => (
    <div key={label}>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="mt-1 font-display text-h3 tabular-nums text-fg">
        {formatPriceCad(lang, value)}
      </dd>
    </div>
  );
  return (
    <>
      <p className="mt-3 max-w-2xl text-body text-fg-muted">{p.lead}</p>
      <dl
        aria-label={p.tableLabel}
        className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4"
      >
        {price(p.input, model.inputPerMillion)}
        {model.kind === "chat" ? price(p.output, model.outputPerMillion) : null}
        {model.cachePerMillion
          ? price(p.cachedInput, model.cachePerMillion)
          : null}
        {model.cacheWritePerMillion
          ? price(p.cacheWrite, model.cacheWritePerMillion)
          : null}
      </dl>
      <p className="mt-4 text-small text-fg-muted">{p.note}</p>
      {model.kind === "embedding" ? (
        <p className="mt-1 text-small text-fg-muted">{p.embeddingOnly}</p>
      ) : null}
      {model.note ? (
        <p className="mt-2 font-mono text-label uppercase text-fg-muted">
          {p.devNote}
        </p>
      ) : null}

      {model.priceWindows.length > 0 ? (
        <div className="mt-8">
          <h3 className="text-h4 text-fg">{p.windows}</h3>
          <p className="mt-2 max-w-2xl text-small text-fg-muted">
            {p.windowsLead}
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-small">
              <thead className="text-fg-muted">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-normal">
                    {p.windowCols.window}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-normal">
                    {p.windowCols.input}
                  </th>
                  <th scope="col" className="py-2 font-normal">
                    {p.windowCols.output}
                  </th>
                </tr>
              </thead>
              <tbody>
                {model.priceWindows.map((w) => (
                  <tr
                    key={`${w.label}-${w.days.join()}-${w.startMinute}`}
                    className="border-t border-line"
                  >
                    <th scope="row" className="py-2 pr-4 font-normal text-fg">
                      {fmt(p.window, { label: w.label })}
                      <span className="block text-fg-muted">
                        {dayLabel(w.days, p.days)} {clock(w.startMinute)}–
                        {clock(w.endMinute)}
                      </span>
                    </th>
                    <td className="py-2 pr-4 tabular-nums text-fg">
                      {formatPriceCad(lang, w.inputPerMillion)}
                    </td>
                    <td className="py-2 tabular-nums text-fg">
                      {model.kind === "chat"
                        ? formatPriceCad(lang, w.outputPerMillion)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}
