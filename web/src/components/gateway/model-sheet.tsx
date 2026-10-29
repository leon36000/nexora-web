import type { Modality } from "@nexora/db";
import { fmt } from "@/i18n/account";
import type { Lang } from "@/i18n/config";
import { formatPriceCad, type GatewayDictionary } from "@/i18n/gateway";
import type { PublicModel } from "@/server/gateway/public";

const formatScore = (lang: Lang, n: number) =>
  new Intl.NumberFormat(lang === "fr" ? "fr-CA" : "en-CA", {
    maximumFractionDigits: 2,
  }).format(n);

const two = (n: number) => String(n).padStart(2, "0");
const clock = (minute: number) =>
  `${two(Math.floor(minute / 60) % 24)} h ${two(minute % 60)}`;

/** « lun.–ven. » pour des jours consécutifs, sinon la liste ; dimanche = 0. */
function dayLabel(days: number[], names: readonly string[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  const name = (d: number) => names[d] ?? "";
  if (
    sorted.length > 2 &&
    sorted.every((d, i) => i === 0 || d === (sorted[i - 1] as number) + 1)
  )
    return `${name(sorted[0] as number)}–${name(sorted[sorted.length - 1] as number)}`;
  return sorted.map(name).join(", ");
}

/**
 * Fiche technique d'un modèle : licence, paramètres, mesures publiées (avec éditeur et source) et tarifs
 * selon l'heure. Rien ici n'est calculé : tout vient de la fiche enregistrée au catalogue.
 */
export function ModelSheet({
  model,
  t,
  lang,
}: {
  model: PublicModel;
  t: GatewayDictionary;
  lang: Lang;
}) {
  const s = t.sheet;
  const sheet = model.sheet;
  const benchmarks = sheet.benchmarks ?? [];
  const sources = sheet.sources ?? [];
  const notes = lang === "fr" ? sheet.notesFr : sheet.notesEn;
  const facts: { label: string; value: string }[] = [];
  if (sheet.family) facts.push({ label: s.family, value: sheet.family });
  if (sheet.releasedAt)
    facts.push({
      label: s.released,
      value: new Intl.DateTimeFormat(lang === "fr" ? "fr-CA" : "en-CA", {
        dateStyle: "long",
        timeZone: "UTC",
      }).format(new Date(`${sheet.releasedAt}T00:00:00Z`)),
    });
  if (sheet.license)
    facts.push({
      label: s.license,
      value: `${sheet.license.name ?? s.licenseUnread} · ${sheet.license.openWeights ? s.openWeights : s.closedWeights}`,
    });
  if (sheet.parameters)
    facts.push({
      label: s.parameters,
      value: [
        sheet.parameters.totalB
          ? fmt(s.total, { n: String(sheet.parameters.totalB) })
          : null,
        sheet.parameters.activeB
          ? fmt(s.active, { n: String(sheet.parameters.activeB) })
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  if (sheet.modalities?.input.length)
    facts.push({
      label: s.modalities,
      value: sheet.modalities.input
        .map((m: Modality) => s.modality[m])
        .join(", "),
    });

  const hasPrices = model.priceWindows.length > 0 || model.cacheWritePerMillion;
  if (facts.length === 0 && benchmarks.length === 0 && !hasPrices && !notes)
    return null;

  return (
    <section aria-labelledby="sheet-title" className="mt-16">
      <h2 id="sheet-title" className="text-h3 text-fg">
        {s.title}
      </h2>
      <p className="mt-3 max-w-2xl text-body text-fg-muted">{s.lead}</p>

      {facts.length > 0 ? (
        <dl className="mt-6 grid gap-5 text-small sm:grid-cols-2 lg:grid-cols-3">
          {facts.map((f) => (
            <div key={f.label}>
              <dt className="text-fg-muted">{f.label}</dt>
              <dd className="mt-1 text-body text-fg">{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {hasPrices ? (
        <div className="mt-10">
          <h3 className="text-h4 text-fg">{s.windows}</h3>
          {model.priceWindows.length > 0 ? (
            <p className="mt-2 max-w-2xl text-small text-fg-muted">
              {s.windowsLead}
            </p>
          ) : null}
          <ul className="mt-4 grid gap-3 text-small">
            {model.priceWindows.map((w) => (
              <li
                key={`${w.label}-${w.days.join()}-${w.startMinute}`}
                className="rounded-xs border border-line px-3 py-2 text-fg"
              >
                <span className="text-fg-muted">
                  {fmt(s.window, { label: w.label })} ·{" "}
                  {dayLabel(w.days, s.days)} {clock(w.startMinute)}–
                  {clock(w.endMinute)}
                </span>{" "}
                <span className="tabular-nums">
                  {formatPriceCad(lang, w.inputPerMillion)} /{" "}
                  {formatPriceCad(lang, w.outputPerMillion)}
                </span>
              </li>
            ))}
            {model.cacheWritePerMillion ? (
              <li className="rounded-xs border border-line px-3 py-2 text-fg">
                <span className="text-fg-muted">{s.cacheWrite}</span>{" "}
                <span className="tabular-nums">
                  {formatPriceCad(lang, model.cacheWritePerMillion)}
                </span>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      <div className="mt-10">
        <h3 className="text-h4 text-fg">{s.benchmarks}</h3>
        {benchmarks.length > 0 ? (
          <>
            <p className="mt-2 max-w-2xl text-small text-fg-muted">
              {s.benchmarksLead}
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-96 text-left text-small">
                <thead className="text-fg-muted">
                  <tr>
                    <th scope="col" className="py-2 pr-4 font-normal">
                      {s.benchmark}
                    </th>
                    <th scope="col" className="py-2 pr-4 font-normal">
                      {s.score}
                    </th>
                    <th scope="col" className="py-2 font-normal">
                      {s.publisher}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {benchmarks.map((b) => (
                    <tr key={b.name} className="border-t border-line">
                      <th scope="row" className="py-2 pr-4 font-normal text-fg">
                        {b.name}
                      </th>
                      <td className="py-2 pr-4 tabular-nums text-fg">
                        {formatScore(lang, b.score)} {b.unit}
                      </td>
                      <td className="py-2">
                        <a
                          href={b.sourceUrl}
                          rel="noopener noreferrer"
                          className="rounded-xs text-accent-text underline underline-offset-4"
                        >
                          {b.publisher}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="mt-2 text-small text-fg-muted">{s.noBenchmarks}</p>
        )}
      </div>

      {notes ? (
        <p className="mt-6 max-w-2xl text-small text-fg-muted">{notes}</p>
      ) : null}

      {sources.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-h4 text-fg">{s.sources}</h3>
          <ul className="mt-2 grid gap-1 text-small">
            {sources.map((src) => (
              <li key={src.url}>
                <a
                  href={src.url}
                  rel="noopener noreferrer"
                  className="rounded-xs text-accent-text underline underline-offset-4"
                >
                  {src.label}
                </a>{" "}
                <span className="text-fg-muted">
                  ({fmt(s.readOn, { date: src.readAt })})
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
