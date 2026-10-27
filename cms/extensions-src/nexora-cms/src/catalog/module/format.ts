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
const FIELD_LABELS: Record<string, string> = {
  input: "entrée",
  output: "sortie",
  cache: "cache",
};

export function describeIssue(issue: Issue): string {
  const base =
    ISSUE_LABELS[issue.code ?? ""] ?? issue.code ?? "problème inconnu";
  const where = issue.model ?? issue.provider ?? "";
  const field = issue.field
    ? ` (${FIELD_LABELS[issue.field] ?? issue.field})`
    : "";
  return where ? `${where} : ${base}${field}` : `${base}${field}`;
}

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
