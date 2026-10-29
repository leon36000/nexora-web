// Rapprochement des coûts (GET /api/admin/catalog/usage-report) : ce que nous avons facturé, ce que nous croyons que
// l'amont nous coûte (nos prix de route) et ce que l'amont dit nous avoir coûté (OpenRouter le rapporte). Un écart
// durable veut dire que nos coûts amont sont périmés : la marge réelle n'est plus celle que l'on croit.

import { formatPercentBps, marginBpsOf } from "./pricing";

export interface UsageRow {
  model: string;
  requests: number;
  billedMicro: string;
  offeredMicro: string;
  upstreamComputedUsdMicro: string;
  reportedRequests: number;
  upstreamReportedUsdMicro: string;
  driftUsdMicro: string;
}

/** Écart (rapporté contre calculé) à partir duquel on demande de vérifier les prix amont : 5 %. */
export const DRIFT_ALERT_BPS = 500;

export type RowStatus = "ok" | "derive" | "non_rapporte" | "aucune_requete";

export interface RowAnalysis {
  model: string;
  requests: number;
  billed: bigint;
  offered: bigint;
  /** Coût amont calculé avec nos prix (USD, micro). */
  computed: bigint;
  /** Coût amont rapporté par l'amont (USD, micro), pour les requêtes qui en ont un. */
  reported: bigint;
  reportedRequests: number;
  /** Rapporté moins calculé, sur les requêtes qui ont un coût rapporté. */
  drift: bigint;
  /** Meilleure estimation du coût amont : le calcul, corrigé de l'écart observé. */
  upstreamCostUsd: bigint;
  upstreamCostCad: bigint | null;
  /** Part des requêtes dont l'amont a rapporté le coût (points de base). */
  coverageBps: number;
  /** Écart relatif (points de base) ; null sans coût rapporté. */
  driftBps: number | null;
  /** Marge réalisée = facturé / coût amont converti ; null si usage offert, pas de taux ou rien de facturé. */
  realizedMarginBps: number | null;
  status: RowStatus;
  message: string;
}

export function analyzeRow(row: UsageRow, fxMicro: bigint | null): RowAnalysis {
  const billed = BigInt(row.billedMicro);
  const offered = BigInt(row.offeredMicro);
  const computed = BigInt(row.upstreamComputedUsdMicro);
  const reported = BigInt(row.upstreamReportedUsdMicro);
  const drift = BigInt(row.driftUsdMicro);
  const upstreamCostUsd = computed + drift;
  const computedForReported = reported - drift;
  const driftBps =
    row.reportedRequests > 0 && computedForReported > 0n
      ? Number((drift * 10_000n) / computedForReported)
      : null;
  const coverageBps =
    row.requests > 0
      ? Math.floor((row.reportedRequests * 10_000) / row.requests)
      : 0;
  const upstreamCostCad =
    fxMicro === null
      ? null
      : (upstreamCostUsd * fxMicro + 999_999n) / 1_000_000n;
  const realizedMarginBps =
    fxMicro !== null && offered === 0n && billed > 0n && upstreamCostUsd > 0n
      ? marginBpsOf(billed, upstreamCostUsd, fxMicro)
      : null;

  let status: RowStatus;
  let message: string;
  if (row.requests === 0) {
    status = "aucune_requete";
    message = "Aucune requête sur la période.";
  } else if (row.reportedRequests === 0) {
    status = "non_rapporte";
    message =
      "L’amont ne rapporte pas son coût (fournisseur direct) : la marge repose sur nos prix amont.";
  } else if (driftBps !== null && Math.abs(driftBps) > DRIFT_ALERT_BPS) {
    status = "derive";
    message = `L’amont rapporte un coût ${driftBps > 0 ? "supérieur" : "inférieur"} de ${formatPercentBps(Math.abs(driftBps))} à notre calcul : vérifiez les prix amont de ce modèle et de ses routes.`;
  } else {
    status = "ok";
    message = "Le coût rapporté par l’amont correspond à notre calcul.";
  }
  return {
    model: row.model,
    requests: row.requests,
    billed,
    offered,
    computed,
    reported,
    reportedRequests: row.reportedRequests,
    drift,
    upstreamCostUsd,
    upstreamCostCad,
    coverageBps,
    driftBps,
    realizedMarginBps,
    status,
    message,
  };
}

export interface UsageAnalysis {
  rows: RowAnalysis[];
  total: {
    requests: number;
    billed: bigint;
    offered: bigint;
    upstreamCostUsd: bigint;
    upstreamCostCad: bigint | null;
    realizedMarginBps: number | null;
  };
  /** Nombre de modèles dont l'écart dépasse le seuil. */
  toCheck: number;
}

export function analyzeUsage(
  rows: readonly UsageRow[],
  fxMicro: bigint | null,
): UsageAnalysis {
  const analyzed = rows.map((r) => analyzeRow(r, fxMicro));
  analyzed.sort(
    (a, b) =>
      Number(b.status === "derive") - Number(a.status === "derive") ||
      (b.billed > a.billed ? 1 : b.billed < a.billed ? -1 : 0) ||
      a.model.localeCompare(b.model),
  );
  const sum = (pick: (r: RowAnalysis) => bigint) =>
    analyzed.reduce((s, r) => s + pick(r), 0n);
  const billed = sum((r) => r.billed);
  const offered = sum((r) => r.offered);
  const upstreamCostUsd = sum((r) => r.upstreamCostUsd);
  return {
    rows: analyzed,
    total: {
      requests: analyzed.reduce((s, r) => s + r.requests, 0),
      billed,
      offered,
      upstreamCostUsd,
      upstreamCostCad:
        fxMicro === null
          ? null
          : (upstreamCostUsd * fxMicro + 999_999n) / 1_000_000n,
      realizedMarginBps:
        fxMicro !== null &&
        offered === 0n &&
        billed > 0n &&
        upstreamCostUsd > 0n
          ? marginBpsOf(billed, upstreamCostUsd, fxMicro)
          : null,
    },
    toCheck: analyzed.filter((r) => r.status === "derive").length,
  };
}
