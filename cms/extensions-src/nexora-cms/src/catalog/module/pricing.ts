// Arithmétique des prix du module « Modèles » : miroir EXACT de web/src/server/gateway/pricing.ts (entiers `bigint`
// seulement, aucun nombre à virgule flottante). Il sert à l'aperçu immédiat du prix de vente pendant la saisie ; le
// serveur refait les mêmes calculs et reste seul juge à la publication. Un essai de parité côté app
// (web/src/server/gateway/admin-parity.test.ts) compare les deux implémentations sur des milliers de cas.
// Montants : micro-unités PAR MILLION de jetons (USD pour l'amont, CAD pour la vente).

import { formatDecimalMicro } from "./format";

const PER_MILLION = 1_000_000n;
const BPS = 10_000n;
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

export type Dim = "input" | "output" | "cache" | "cacheWrite";
export const DIMS: readonly Dim[] = ["input", "output", "cache", "cacheWrite"];

export const DIM_LABELS: Record<Dim, string> = {
  input: "Entrée",
  output: "Sortie",
  cache: "Cache lu",
  cacheWrite: "Cache écrit",
};

/** Quatre tarifs par million de jetons ; `cache` et `cacheWrite` null : le tarif d'entrée s'applique. */
export interface PriceSet {
  input: bigint;
  output: bigint;
  cache: bigint | null;
  cacheWrite: bigint | null;
}

/** Prix amont (micro-USD par million) converti en micro-CAD au taux approuvé, arrondi vers le haut. */
export function upstreamCadMicro(
  usdMicro: bigint,
  usdToCadMicro: bigint,
): bigint {
  return ceilDiv(usdMicro * usdToCadMicro, PER_MILLION);
}

/** Prix de vente minimal pour une marge donnée (points de base) sur le coût amont converti. */
export function sellFromMargin(
  upstreamUsdMicro: bigint,
  usdToCadMicro: bigint,
  marginBps: number,
): bigint {
  if (!Number.isInteger(marginBps) || marginBps < 0)
    throw new RangeError("marge : entier ≥ 0 attendu");
  return ceilDiv(
    upstreamCadMicro(upstreamUsdMicro, usdToCadMicro) *
      (BPS + BigInt(marginBps)),
    BPS,
  );
}

/**
 * Marge réelle d'un prix de vente sur son coût amont converti, en points de base (arrondie vers le bas) ;
 * null si le coût converti est nul (marge sans objet).
 */
export function marginBpsOf(
  sellCadMicro: bigint,
  upstreamUsdMicro: bigint,
  usdToCadMicro: bigint,
): number | null {
  const cost = upstreamCadMicro(upstreamUsdMicro, usdToCadMicro);
  if (cost <= 0n) return null;
  return Number((sellCadMicro * BPS) / cost - BPS);
}

/** Le prix de vente tient-il le plancher de marge sur ce coût ? (même test que la garde de publication) */
function holdsFloor(
  sell: bigint,
  upstreamUsd: bigint,
  usdToCadMicro: bigint,
  floorBps: number,
): boolean {
  return (
    sell * BPS >=
    upstreamCadMicro(upstreamUsd, usdToCadMicro) * (BPS + BigInt(floorBps))
  );
}

export interface PriceIssue {
  code: "price_zero" | "below_margin_floor";
  field: Dim;
}

/** Garde de publication des prix (miroir de `checkPrice`) : jamais 0 $ ; jamais sous le plancher de marge. */
export function checkPriceSet(
  price: { upstream: PriceSet; sell: PriceSet },
  usdToCadMicro: bigint,
  floorBps: number,
  kind: "chat" | "embedding",
): PriceIssue[] {
  const { upstream: up, sell } = price;
  const issues: PriceIssue[] = [];
  const holds = (s: bigint, u: bigint) =>
    holdsFloor(s, u, usdToCadMicro, floorBps);
  if (sell.input <= 0n) issues.push({ code: "price_zero", field: "input" });
  if (kind === "chat" && sell.output <= 0n)
    issues.push({ code: "price_zero", field: "output" });
  if (sell.input > 0n && !holds(sell.input, up.input))
    issues.push({ code: "below_margin_floor", field: "input" });
  if (sell.output > 0n && !holds(sell.output, up.output))
    issues.push({ code: "below_margin_floor", field: "output" });
  if (sell.cache !== null) {
    if (sell.cache <= 0n) issues.push({ code: "price_zero", field: "cache" });
    else if (!holds(sell.cache, up.cache ?? up.input))
      issues.push({ code: "below_margin_floor", field: "cache" });
  }
  if (sell.cacheWrite !== null) {
    if (sell.cacheWrite <= 0n)
      issues.push({ code: "price_zero", field: "cacheWrite" });
    else if (!holds(sell.cacheWrite, up.cacheWrite ?? up.input))
      issues.push({ code: "below_margin_floor", field: "cacheWrite" });
  }
  return issues;
}

// ─── Aperçu poste par poste ─────────────────────────────────────────────────────

export interface PricingContext {
  /** Taux approuvé (micro-CAD pour 1 $ US) ; null : aucun taux approuvé. */
  fxMicro: bigint | null;
  marginBps: number;
  floorBps: number;
  kind: "chat" | "embedding";
}

export interface DimRow {
  dim: Dim;
  label: string;
  upstreamUsd: bigint;
  /** Coût amont converti au taux approuvé. */
  upstreamCad: bigint;
  sell: bigint;
  /** « marge » : calculé avec la marge visée ; « manuel » : saisi par l'administrateur. */
  source: "marge" | "manuel";
  marginBps: number | null;
  /** Prix de vente minimal qui tient le plancher de marge. */
  minSell: bigint;
  status: "ok" | "zero" | "sous_plancher";
}

export interface PricePreview {
  rows: DimRow[];
  /** Prix de vente complet à envoyer, ou null si le calcul est impossible. */
  sell: PriceSet | null;
  ok: boolean;
  reason?: "fx_missing" | "upstream_missing";
}

export interface UpstreamInput {
  input: bigint | null;
  output: bigint | null;
  cache: bigint | null;
  cacheWrite: bigint | null;
}

/**
 * Aperçu du prix de vente de chaque poste. `override` : prix de vente saisis à la main (les autres sont calculés
 * avec la marge visée). Les postes « cache lu » et « cache écrit » n'existent que si le fournisseur les facture
 * (coût amont renseigné) ou si un prix de vente manuel est saisi.
 */
export function previewPriceSet(
  ctx: PricingContext,
  upstream: UpstreamInput,
  override: Partial<Record<Dim, bigint | null>> = {},
): PricePreview {
  if (upstream.input === null || upstream.output === null)
    return { rows: [], sell: null, ok: false, reason: "upstream_missing" };
  if (ctx.fxMicro === null)
    return { rows: [], sell: null, ok: false, reason: "fx_missing" };
  const fx = ctx.fxMicro;
  const up: PriceSet = {
    input: upstream.input,
    output: upstream.output,
    cache: upstream.cache,
    cacheWrite: upstream.cacheWrite,
  };
  const pick = (
    dim: Dim,
  ): { sell: bigint; source: "marge" | "manuel" } | null => {
    const manual = override[dim];
    if (manual !== undefined && manual !== null)
      return { sell: manual, source: "manuel" };
    const cost = up[dim];
    if (cost === null) return null;
    return { sell: sellFromMargin(cost, fx, ctx.marginBps), source: "marge" };
  };
  const picked = Object.fromEntries(DIMS.map((d) => [d, pick(d)])) as Record<
    Dim,
    { sell: bigint; source: "marge" | "manuel" } | null
  >;
  const sell: PriceSet = {
    input: (picked.input as { sell: bigint }).sell,
    output: (picked.output as { sell: bigint }).sell,
    cache: picked.cache?.sell ?? null,
    cacheWrite: picked.cacheWrite?.sell ?? null,
  };
  const issues = checkPriceSet(
    { upstream: up, sell },
    fx,
    ctx.floorBps,
    ctx.kind,
  );
  const rows: DimRow[] = [];
  for (const dim of DIMS) {
    const p = picked[dim];
    if (!p) continue;
    // Coût de référence du poste : sans tarif propre, le tarif d'entrée (cache lu et écrit).
    const cost = up[dim] ?? up.input;
    const issue = issues.find((i) => i.field === dim);
    rows.push({
      dim,
      label: DIM_LABELS[dim],
      upstreamUsd: cost,
      upstreamCad: upstreamCadMicro(cost, fx),
      sell: p.sell,
      source: p.source,
      marginBps: marginBpsOf(p.sell, cost, fx),
      minSell: sellFromMargin(cost, fx, ctx.floorBps),
      status: !issue
        ? "ok"
        : issue.code === "price_zero"
          ? "zero"
          : "sous_plancher",
    });
  }
  return { rows, sell, ok: issues.length === 0 };
}

export const formatPercentBps = (bps: number): string =>
  `${(bps / 100).toFixed(1).replace(".", ",").replace(/,0$/, "")} %`;

/** Phrase qui explique le refus d'une ligne (ou « OK »). */
export function explainRow(row: DimRow, floorBps: number): string {
  if (row.status === "zero")
    return `${row.label} : un prix de vente à 0 $ est refusé. Saisissez un prix supérieur à 0.`;
  if (row.status === "sous_plancher")
    return `${row.label} : vendre à ${formatDecimalMicro(row.sell)} $ CA donne ${
      row.marginBps === null
        ? "aucune marge"
        : `${formatPercentBps(row.marginBps)} de marge`
    }, sous le plancher de ${formatPercentBps(floorBps)}. Prix minimal : ${formatDecimalMicro(row.minSell)} $ CA.`;
  return `${row.label} : marge de ${row.marginBps === null ? "—" : formatPercentBps(row.marginBps)}.`;
}

// ─── Plages horaires ────────────────────────────────────────────────────────────

export interface WindowInput {
  label: string;
  /** 0 = dimanche … 6 = samedi, en UTC. */
  days: number[];
  startMinute: number;
  endMinute: number;
  upstream: PriceSet;
  /** Prix de vente saisis à la main (poste par poste) ; absents : calculés avec la marge visée. */
  sell?: Partial<Record<Dim, bigint | null>> | null;
}

/** Problèmes d'une liste de plages (vide = valide) : bornes, jours, chevauchement (miroir de `windowProblems`). */
export function windowProblems(windows: readonly WindowInput[]): string[] {
  const problems: string[] = [];
  windows.forEach((w, i) => {
    const where = `plage ${i + 1} (« ${w.label} »)`;
    if (w.days.length === 0) problems.push(`${where} : aucun jour`);
    if (w.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6))
      problems.push(`${where} : jour hors de 0 à 6`);
    if (
      !Number.isInteger(w.startMinute) ||
      !Number.isInteger(w.endMinute) ||
      w.startMinute < 0 ||
      w.endMinute > 1440 ||
      w.startMinute >= w.endMinute
    )
      problems.push(`${where} : minutes invalides (0 ≤ début < fin ≤ 1440)`);
  });
  for (let a = 0; a < windows.length; a++)
    for (let b = a + 1; b < windows.length; b++) {
      const x = windows[a] as WindowInput;
      const y = windows[b] as WindowInput;
      if (
        x.days.some((d) => y.days.includes(d)) &&
        x.startMinute < y.endMinute &&
        y.startMinute < x.endMinute
      )
        problems.push(`plages ${a + 1} et ${b + 1} : chevauchement`);
    }
  return problems;
}

const effective = (s: PriceSet): Record<Dim, bigint> => ({
  input: s.input,
  output: s.output,
  cache: s.cache ?? s.input,
  cacheWrite: s.cacheWrite ?? s.input,
});

/** Postes où la plage dépasse le prix de base (une plage ne peut que baisser un tarif). */
export function windowVersusBase(window: PriceSet, base: PriceSet): Dim[] {
  const w = effective(window);
  const b = effective(base);
  return DIMS.filter((d) => w[d] > b[d]);
}

export interface WindowPreview {
  sell: PriceSet | null;
  problems: string[];
  ok: boolean;
}

/** Aperçu d'une plage : prix de vente (calculé ou manuel), plus bas que la base, plancher tenu. */
export function previewWindow(
  ctx: PricingContext,
  baseUpstream: PriceSet,
  baseSell: PriceSet | null,
  window: WindowInput,
): WindowPreview {
  const problems: string[] = [];
  const where = `plage « ${window.label} »`;
  if (ctx.fxMicro === null)
    return {
      sell: null,
      problems: ["aucun taux de change approuvé"],
      ok: false,
    };
  const preview = previewPriceSet(ctx, window.upstream, window.sell ?? {});
  const sell = preview.sell;
  if (windowVersusBase(window.upstream, baseUpstream).length > 0)
    problems.push(`${where} : le coût amont dépasse celui du prix de base`);
  if (sell && baseSell && windowVersusBase(sell, baseSell).length > 0)
    problems.push(`${where} : le prix de vente dépasse celui du prix de base`);
  for (const row of preview.rows)
    if (row.status !== "ok")
      problems.push(`${where} — ${explainRow(row, ctx.floorBps)}`);
  return { sell, problems, ok: problems.length === 0 };
}
