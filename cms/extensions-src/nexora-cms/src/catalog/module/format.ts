// Aides pures du module « Modèles » : montants décimaux <-> micro-unités entières (aucun nombre à virgule flottante)
// et libellés français des problèmes de publication.

const DECIMAL = /^(\d{1,12})(?:[.,](\d{1,6}))?$/;

/** « 0,6 » ou « 0.60 » -> "600000" (micro-unités) ; null si invalide. */
export function parseDecimalMicro(input: string): string | null {
  const m = DECIMAL.exec(input.trim());
  if (!m) return null;
  const micro =
    BigInt(m[1] as string) * 1_000_000n +
    BigInt((m[2] ?? "").padEnd(6, "0") || "0");
  return micro.toString();
}

/** "600000" -> « 0,6 » ; chaîne vide si absent. */
export function formatDecimalMicro(
  micro: string | number | bigint | null | undefined,
): string {
  if (micro === null || micro === undefined || micro === "") return "";
  const v = BigInt(micro);
  const whole = v / 1_000_000n;
  const frac = (v % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole},${frac}` : `${whole}`;
}

type Issue = {
  code?: string;
  model?: string;
  provider?: string;
  field?: string;
  window?: string;
  route?: number;
};

const ISSUE_LABELS: Record<string, string> = {
  fx_missing: "aucun taux de change approuvé",
  price_missing: "prix absent",
  price_zero: "prix à 0 $",
  below_margin_floor: "prix sous le plancher de marge",
  provider_missing: "fournisseur introuvable",
  provider_disabled: "fournisseur désactivé",
  secret_missing: "clé du fournisseur absente du Coffre",
};
const ROUTE_LABELS: Record<string, string> = {
  route_provider_missing:
    "fournisseur de la route de secours n° {n} introuvable",
  route_provider_disabled:
    "fournisseur de la route de secours n° {n} désactivé",
  route_secret_missing:
    "clé du fournisseur de la route de secours n° {n} absente du Coffre",
  route_below_margin_floor:
    "la route de secours n° {n} ne tient pas le plancher de marge",
};
const FIELD_LABELS: Record<string, string> = {
  input: "entrée",
  output: "sortie",
  cache: "cache",
  cacheWrite: "cache écrit",
};

export function describeIssue(issue: Issue): string {
  const code = issue.code ?? "";
  const base =
    ROUTE_LABELS[code]?.replace("{n}", String(issue.route ?? "?")) ??
    ISSUE_LABELS[code] ??
    (code || "problème inconnu");
  const where = issue.model ?? issue.provider ?? "";
  const details = [
    issue.field ? (FIELD_LABELS[issue.field] ?? issue.field) : "",
    issue.window ? `plage « ${issue.window} »` : "",
  ].filter(Boolean);
  const suffix = details.length ? ` (${details.join(", ")})` : "";
  return where ? `${where} : ${base}${suffix}` : `${base}${suffix}`;
}

/** Que faire pour lever ce problème ? (vide si le code est inconnu) */
const ISSUE_HELP: Record<string, string> = {
  fx_missing:
    "Ajoutez un taux de change dans l’onglet « Taux de change », puis approuvez-le.",
  price_missing:
    "Saisissez un prix à l’étape « Prix » : les coûts du fournisseur et le prix de vente.",
  price_zero:
    "Un prix de vente ne peut jamais être 0 $ : saisissez un montant supérieur à 0.",
  below_margin_floor:
    "Augmentez le prix de vente : il laisse moins de marge que le plancher. Le prix minimal est affiché à l’étape « Prix ».",
  provider_missing:
    "Choisissez un fournisseur existant à l’étape « Fournisseur ».",
  provider_disabled: "Activez le fournisseur dans l’onglet « Fournisseurs ».",
  secret_missing:
    "Collez la clé du fournisseur dans le module « Coffre », sous la référence indiquée sur le fournisseur.",
  route_provider_missing:
    "Choisissez un fournisseur existant pour cette route de secours.",
  route_provider_disabled:
    "Activez le fournisseur de cette route de secours, ou désactivez la route.",
  route_secret_missing:
    "Collez la clé du fournisseur de cette route dans le module « Coffre », ou désactivez la route.",
  route_below_margin_floor:
    "Le coût de cette route est trop élevé pour le prix de vente : baissez son coût, augmentez la vente ou désactivez la route.",
};
export const issueHelp = (code: string): string => ISSUE_HELP[code] ?? "";

type Diff = {
  kind?: string;
  model?: string;
  provider?: string;
  changes?: { field: string }[];
};

export function describeDiff(entry: Diff): string {
  switch (entry.kind) {
    case "model_added":
      return `Modèle ajouté : ${entry.model}`;
    case "model_removed":
      return `Modèle retiré : ${entry.model}`;
    case "model_changed":
      return `Modèle modifié : ${entry.model} (${(entry.changes ?? []).map((c) => c.field).join(", ")})`;
    case "fx_changed":
      return "Taux de change modifié";
    case "provider_changed":
      return `Fournisseur modifié : ${entry.provider}`;
    default:
      return entry.kind ?? "changement";
  }
}

/** « 0,3 » -> « 0,3 $ US » (montant par million de jetons). */
export function formatUsd(
  micro: string | number | bigint | null | undefined,
): string {
  const v = formatDecimalMicro(micro);
  return v === "" ? "—" : `${v} $ US`;
}

/** « 0,462 » -> « 0,462 $ CA ». */
export function formatCad(
  micro: string | number | bigint | null | undefined,
): string {
  const v = formatDecimalMicro(micro);
  return v === "" ? "—" : `${v} $ CA`;
}
