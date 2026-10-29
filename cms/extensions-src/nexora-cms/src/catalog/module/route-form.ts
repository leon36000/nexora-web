// Routes de secours d'un modèle : le même modèle chez un autre fournisseur, essayé quand la route principale échoue.
// Chaque route peut avoir son propre coût amont ; la garde exige alors que le prix de vente tienne le plancher de
// marge AUSSI avec ce coût (au prix de base comme dans chaque plage).

import { parseDecimalMicro } from "./format";
import type { PriceShape } from "./price-form";
import { checkPriceSet, DIM_LABELS, type Dim, sellFromMargin } from "./pricing";

export interface RouteForm {
  providerId: string;
  upstreamId: string;
  upIn: string;
  upOut: string;
  upCache: string;
  note: string;
}

export const emptyRouteForm = (): RouteForm => ({
  providerId: "",
  upstreamId: "",
  upIn: "",
  upOut: "",
  upCache: "",
  note: "",
});

export function validateRouteForm(f: RouteForm): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.providerId) e.providerId = "Choisissez le fournisseur de cette route.";
  if (!f.upstreamId.trim() || f.upstreamId.length > 200)
    e.upstreamId = "Indiquez l’identifiant du modèle chez ce fournisseur.";
  const amount = (v: string) =>
    v.trim() === "" || parseDecimalMicro(v) !== null;
  if (!amount(f.upIn)) e.upIn = "Montant invalide (format 0,40).";
  if (!amount(f.upOut)) e.upOut = "Montant invalide (format 0,90).";
  if (!amount(f.upCache)) e.upCache = "Montant invalide (format 0,10).";
  if (!e.upIn && !e.upOut && (f.upIn.trim() === "") !== (f.upOut.trim() === ""))
    e[f.upIn.trim() === "" ? "upIn" : "upOut"] =
      "Les prix d’entrée et de sortie vont ensemble : renseignez les deux ou aucun.";
  return e;
}

export function routeBody(f: RouteForm): Record<string, unknown> {
  const body: Record<string, unknown> = {
    providerId: f.providerId,
    upstreamId: f.upstreamId.trim(),
    note: f.note.trim(),
  };
  if (f.upIn.trim() !== "") {
    body.upstreamInputUsdMicro = parseDecimalMicro(f.upIn);
    body.upstreamOutputUsdMicro = parseDecimalMicro(f.upOut);
    if (f.upCache.trim() !== "")
      body.upstreamCacheUsdMicro = parseDecimalMicro(f.upCache);
  }
  return body;
}

export interface RouteFloorRow {
  dim: Dim;
  label: string;
  /** Prix de vente minimal qui tient le plancher avec le coût de cette route. */
  minSell: bigint;
  holds: boolean;
  /** Où le prix de vente actuel ne tient pas (« prix de base », « plage « creux »… »). */
  failsIn: string[];
}

/** Verdict poste par poste d'une route qui a son propre coût (miroir de `route_below_margin_floor`). */
export function routeFloorRows(
  route: { input: bigint; output: bigint; cache: bigint | null } | null,
  price: PriceShape | null,
  fxMicro: bigint | null,
  kind: "chat" | "embedding",
): RouteFloorRow[] {
  if (!route || !price || fxMicro === null) return [];
  const sells = [
    { where: "prix de base", sell: price.sell },
    ...price.windows.map((w) => ({
      where: `plage « ${w.label} »`,
      sell: w.sell,
    })),
  ];
  const upstream = { ...route, cacheWrite: null };
  const failing = new Map<Dim, string[]>();
  for (const s of sells)
    for (const issue of checkPriceSet(
      { upstream, sell: { ...s.sell, cacheWrite: null } },
      fxMicro,
      price.floorBps,
      kind,
    ))
      if (issue.code === "below_margin_floor" && issue.field !== "cacheWrite")
        failing.set(issue.field, [
          ...(failing.get(issue.field) ?? []),
          s.where,
        ]);
  // Le poste « cache » n'existe que si un prix de vente de cache est fixé, au prix de base ou dans une plage.
  const hasCache = sells.some((s) => s.sell.cache !== null);
  const dims: { dim: Dim; cost: bigint }[] = [
    { dim: "input", cost: route.input },
    { dim: "output", cost: route.output },
    ...(hasCache
      ? [{ dim: "cache" as Dim, cost: route.cache ?? route.input }]
      : []),
  ];
  return dims.map(({ dim, cost }) => ({
    dim,
    label: DIM_LABELS[dim],
    minSell: sellFromMargin(cost, fxMicro, price.floorBps),
    holds: !failing.has(dim),
    failsIn: failing.get(dim) ?? [],
  }));
}

/** Monte (delta -1) ou descend (delta +1) l'élément ; hors limites, la liste est rendue telle quelle. */
export function moveItem<T>(
  list: readonly T[],
  index: number,
  delta: -1 | 1,
): T[] {
  const target = index + delta;
  const copy = [...list];
  if (index < 0 || index >= copy.length || target < 0 || target >= copy.length)
    return copy;
  [copy[index], copy[target]] = [copy[target] as T, copy[index] as T];
  return copy;
}
