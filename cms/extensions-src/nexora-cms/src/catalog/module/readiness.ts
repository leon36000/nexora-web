// Contrôles préalables à la publication d'un modèle, en liste lisible. Les problèmes viennent de la garde du serveur
// (GET models/:id/readiness) : l'écran ne décide rien, il explique.

import { describeIssue, formatDecimalMicro, issueHelp } from "./format";

export interface ReadinessIssue {
  code: string;
  model?: string;
  provider?: string;
  field?: string;
  window?: string;
  route?: number;
}

export interface Readiness {
  ready: boolean;
  issues: ReadinessIssue[];
  fx: { id: string; usdToCadMicro: string; effectiveAt: string } | null;
}

export interface CheckItem {
  id: "fx" | "price" | "margin" | "provider" | "secret" | "routes" | "other";
  label: string;
  ok: boolean;
  detail: string;
  /** Une ligne par problème. */
  lines: string[];
  /** Que faire pour lever le problème. */
  help: string;
}

const FIELD_FR: Record<string, string> = {
  input: "entrée",
  output: "sortie",
  cache: "cache",
  cacheWrite: "cache écrit",
};

/** Comme `describeIssue`, mais le poste et la plage sont séparés par une virgule. */
const line = (i: ReadinessIssue) =>
  describeIssue({
    ...i,
    field: i.field ? (FIELD_FR[i.field] ?? i.field) : undefined,
  });

const GROUPS: { id: CheckItem["id"]; label: string; codes: string[] }[] = [
  { id: "fx", label: "Taux de change approuvé", codes: ["fx_missing"] },
  { id: "price", label: "Prix saisi", codes: ["price_missing"] },
  {
    id: "margin",
    label: "Prix de vente valide (jamais 0 $, au-dessus du plancher de marge)",
    codes: ["price_zero", "below_margin_floor"],
  },
  {
    id: "provider",
    label: "Fournisseur principal actif",
    codes: ["provider_missing", "provider_disabled"],
  },
  {
    id: "secret",
    label: "Clé du fournisseur dans le Coffre",
    codes: ["secret_missing"],
  },
  {
    id: "routes",
    label: "Routes de secours prêtes",
    codes: [
      "route_provider_missing",
      "route_provider_disabled",
      "route_secret_missing",
      "route_below_margin_floor",
    ],
  },
];

export function buildChecklist(
  r: Readiness,
  ctx: { secretRef: string | null; hasRoutes: boolean },
): CheckItem[] {
  const items: CheckItem[] = [];
  for (const g of GROUPS) {
    if (g.id === "routes" && !ctx.hasRoutes) continue;
    const found = r.issues.filter((i) => g.codes.includes(i.code));
    const okDetail =
      g.id === "fx" && r.fx
        ? `1 $ US = ${formatDecimalMicro(r.fx.usdToCadMicro)} $ CA`
        : g.id === "secret"
          ? ctx.secretRef
            ? `Référence « ${ctx.secretRef} » présente dans le Coffre.`
            : "Aucune clé requise."
          : "Conforme.";
    items.push({
      id: g.id,
      label: g.label,
      ok: found.length === 0,
      detail: found.length === 0 ? okDetail : `${found.length} problème(s).`,
      lines: found.map(line),
      help:
        found.length === 0
          ? ""
          : g.id === "secret" && ctx.secretRef
            ? `Collez la clé dans le module « Coffre », sous la référence « ${ctx.secretRef} » (type « Fournisseur de modèles »).`
            : [...new Set(found.map((i) => issueHelp(i.code)))]
                .filter(Boolean)
                .join(" "),
    });
  }
  const known = new Set(GROUPS.flatMap((g) => g.codes));
  const rest = r.issues.filter((i) => !known.has(i.code));
  if (rest.length > 0)
    items.push({
      id: "other",
      label: "Autres contrôles",
      ok: false,
      detail: `${rest.length} problème(s).`,
      lines: rest.map(line),
      help: "Ces contrôles sont nouveaux pour cet écran : consultez le journal de l’app.",
    });
  return items;
}
