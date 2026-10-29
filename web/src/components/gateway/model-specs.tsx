import { fmt } from "@/i18n/account";
import type { Lang } from "@/i18n/config";
import { formatInteger } from "@/i18n/gateway";
import { formatDay, formatMonth, type ModelsText } from "@/i18n/models";
import type { PublicModel } from "@/server/gateway/public";
import { licenseState } from "./model-badges";

const LINK = "rounded-xs text-accent-text underline underline-offset-4";

/** Spécifications d'un modèle : seulement ce que la fiche contient ; un champ absent reste absent (jamais deviné). */
export function ModelSpecs({
  model,
  lang,
  t,
}: {
  model: PublicModel;
  lang: Lang;
  t: ModelsText;
}) {
  const s = t.detail.specs;
  const sheet = model.sheet;
  const policy = lang === "fr" ? model.dataPolicyFr : model.dataPolicyEn;
  const num = (n: number) =>
    new Intl.NumberFormat(lang === "fr" ? "fr-CA" : "en-CA").format(n);
  const rows: { label: string; value: React.ReactNode }[] = [];
  if (sheet.author) rows.push({ label: s.author, value: sheet.author });
  if (sheet.family) rows.push({ label: s.family, value: sheet.family });
  rows.push({
    label: s.context,
    value: `${formatInteger(lang, model.contextMax)} ${s.tokens}`,
  });
  if (model.maxOutputTokens)
    rows.push({
      label: s.maxOutput,
      value: `${formatInteger(lang, model.maxOutputTokens)} ${s.tokens}`,
    });
  const p = sheet.parameters;
  if (p && (p.totalB || p.activeB))
    rows.push({
      label: s.parameters,
      value: [
        p.totalB ? fmt(s.total, { n: num(p.totalB) }) : null,
        p.activeB ? fmt(s.active, { n: num(p.activeB) }) : null,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  if (sheet.quantization)
    rows.push({ label: s.quantization, value: sheet.quantization });
  if (sheet.modalities?.input.length)
    rows.push({
      label: s.inputs,
      value: sheet.modalities.input.map((m) => t.modality[m]).join(", "),
    });
  if (sheet.modalities?.output.length)
    rows.push({
      label: s.outputs,
      value: sheet.modalities.output.map((m) => t.modality[m]).join(", "),
    });
  if (sheet.releasedAt)
    rows.push({ label: s.released, value: formatDay(lang, sheet.releasedAt) });
  if (sheet.knowledgeCutoff)
    rows.push({
      label: s.cutoff,
      value: formatMonth(lang, sheet.knowledgeCutoff),
    });
  const state = licenseState(model);
  if (sheet.license)
    rows.push({
      label: s.license,
      value: (
        <>
          {sheet.license.name ?? t.license.unread}
          {state ? ` · ${t.license[state]}` : ""}
          {sheet.license.url ? (
            <>
              {" "}
              <a
                href={sheet.license.url}
                rel="noopener noreferrer"
                className={LINK}
              >
                {s.licenseLink}
              </a>
            </>
          ) : null}
        </>
      ),
    });
  rows.push({ label: s.host, value: model.providerName || s.unknown });
  rows.push({ label: s.hostRegion, value: t.residency[model.residency] });
  rows.push({ label: s.dataPolicy, value: policy || s.dataPolicyMissing });

  return (
    <dl className="grid gap-x-8 gap-y-5 text-small sm:grid-cols-2">
      {rows.map((r) => (
        <div key={r.label}>
          <dt className="text-fg-muted">{r.label}</dt>
          <dd className="mt-1 text-body text-fg">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
