// Libellés et résumés d'affichage du module « Modèles » (pas de logique métier : elle est dans les autres fichiers).

import { formatDecimalMicro } from "./format";
import { REGION_OPTIONS } from "./provider-form";

export type Tone = "neutral" | "success" | "warning" | "danger";
export interface StateView {
  label: string;
  tone: Tone;
  icon: string;
}

const MODEL_STATUS: Record<string, StateView> = {
  draft: { label: "Brouillon", tone: "neutral", icon: "edit_note" },
  approved: { label: "Approuvé", tone: "warning", icon: "task_alt" },
  published: { label: "Publié", tone: "success", icon: "check_circle" },
  retired: { label: "Retiré", tone: "danger", icon: "block" },
};
export const modelStatusView = (s: string): StateView =>
  MODEL_STATUS[s] ?? { label: s, tone: "neutral", icon: "help" };

const AVAILABILITY: Record<string, StateView> = {
  live: { label: "En service", tone: "success", icon: "bolt" },
  preview: { label: "Aperçu", tone: "warning", icon: "visibility" },
};
/** Un modèle enregistré avant l'aperçu n'a pas la mention : il est en service. */
export const availabilityView = (a: string | undefined): StateView =>
  AVAILABILITY[a ?? "live"] ?? (AVAILABILITY.live as StateView);

const HEALTH: Record<string, StateView> = {
  ok: { label: "Connexion vérifiée", tone: "success", icon: "check_circle" },
  error: { label: "Connexion en échec", tone: "danger", icon: "error" },
  unknown: { label: "Jamais testé", tone: "neutral", icon: "help" },
};
export const healthView = (s: string): StateView =>
  HEALTH[s] ?? (HEALTH.unknown as StateView);

const VERSION: Record<string, string> = {
  draft: "brouillon",
  approved: "approuvée",
  published: "publiée",
  superseded: "remplacée",
};
export const versionStatusLabel = (s: string): string => VERSION[s] ?? s;

export const regionLabel = (r: string): string =>
  REGION_OPTIONS.find((o) => o.value === r)?.text ?? r;

type PriceLike = {
  sellInputCadMicro: string;
  sellOutputCadMicro: string;
  sellCacheCadMicro: string | null;
  sellCacheWriteCadMicro: string | null;
  upstreamInputUsdMicro: string;
  upstreamOutputUsdMicro: string;
  windows?: unknown[];
  marginFloorBps: number;
};

export function priceSummary(p: PriceLike | null): string[] {
  if (!p) return ["Aucun prix saisi"];
  const sells = [
    `Entrée ${formatDecimalMicro(p.sellInputCadMicro)} $ CA`,
    `sortie ${formatDecimalMicro(p.sellOutputCadMicro)} $ CA`,
    ...(p.sellCacheCadMicro !== null
      ? [`cache ${formatDecimalMicro(p.sellCacheCadMicro)} $ CA`]
      : []),
    ...(p.sellCacheWriteCadMicro !== null
      ? [`cache écrit ${formatDecimalMicro(p.sellCacheWriteCadMicro)} $ CA`]
      : []),
  ];
  const lines = [
    `${sells.join(" · ")} (par million de jetons)`,
    `Coût amont : ${formatDecimalMicro(p.upstreamInputUsdMicro)} $ US en entrée, ${formatDecimalMicro(p.upstreamOutputUsdMicro)} $ US en sortie · plancher de marge ${p.marginFloorBps / 100} %`,
  ];
  const n = p.windows?.length ?? 0;
  if (n > 0)
    lines.push(`${n} plage${n > 1 ? "s" : ""} horaire${n > 1 ? "s" : ""}`);
  return lines;
}

/** Adresse du module « Coffre », frère du module courant dans l'administration Directus. */
export function vaultUrl(pathname: string): string {
  const dir = pathname.replace(/\/+$/, "").replace(/\/[^/]*$/, "");
  return `${dir || "/admin"}/nexora-vault`;
}
