/**
 * Arithmétique des prix de la passerelle (D1) : entiers `bigint` seulement, aucun nombre à virgule
 * flottante. Les prix sont des micro-CAD (ou micro-USD pour l'amont) PAR MILLION de jetons.
 */

const PER_MILLION = 1_000_000n;
const BPS = 10_000n;

function assertTokens(n: number): void {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new RangeError("jetons : entier ≥ 0 attendu");
}

const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

/** Coût de `tokens` jetons à `pricePerMillion`, arrondi vers le haut (jamais 0 pour un usage réel). */
export function costMicro(tokens: number, pricePerMillion: bigint): bigint {
  assertTokens(tokens);
  return ceilDiv(BigInt(tokens) * pricePerMillion, PER_MILLION);
}

export interface Usage {
  prompt: number;
  completion: number;
  /** Jetons d'entrée servis par le cache (inclus dans `prompt`, comme dans l'API OpenAI). */
  cached: number;
  /** Jetons d'entrée écrits en cache (inclus dans `prompt`), facturés à part par certains éditeurs (Kimi). */
  cacheWrite?: number;
}

export interface PerMillion {
  input: bigint;
  output: bigint;
  /** null : le tarif d'entrée s'applique aux jetons en cache. */
  cache: bigint | null;
  /** Écriture du cache ; absent ou null : le tarif d'entrée s'applique. */
  cacheWrite?: bigint | null;
}

/** Coût d'une requête : une seule division, donc un seul arrondi. */
export function requestCost(usage: Usage, price: PerMillion): bigint {
  return requestCostDivided(usage, price, PER_MILLION);
}

/**
 * Coût amont d'une requête en NANO-USD (prix amont en micro-USD par million de jetons) : mille fois plus fin que
 * `requestCost`, donc comparable sans bruit d'arrondi au coût rapporté par l'amont (audit F-07).
 */
export function requestCostNano(
  usage: Usage,
  upstreamPrice: PerMillion,
): bigint {
  return requestCostDivided(usage, upstreamPrice, 1000n);
}

function requestCostDivided(
  usage: Usage,
  price: PerMillion,
  divisor: bigint,
): bigint {
  assertTokens(usage.prompt);
  assertTokens(usage.completion);
  assertTokens(usage.cached);
  assertTokens(usage.cacheWrite ?? 0);
  const cached = Math.min(usage.cached, usage.prompt);
  const written = Math.min(usage.cacheWrite ?? 0, usage.prompt - cached);
  const fresh = usage.prompt - cached - written;
  const total =
    BigInt(fresh) * price.input +
    BigInt(cached) * (price.cache ?? price.input) +
    BigInt(written) * (price.cacheWrite ?? price.input) +
    BigInt(usage.completion) * price.output;
  return ceilDiv(total, divisor);
}

/**
 * Plage horaire d'un prix, en UTC : `days` (0 = dimanche … 6 = samedi), de `startMinute` (inclus) à
 * `endMinute` (exclu), minutes depuis minuit UTC. Une plage ne peut que BAISSER le prix de base
 * (le montant réservé se calcule donc toujours sur le prix de base).
 */
export interface TimeWindow {
  label: string;
  days: number[];
  startMinute: number;
  endMinute: number;
}

/** Première plage qui couvre `at`, ou null (prix de base). */
export function activeWindow<W extends TimeWindow>(
  windows: readonly W[],
  at: Date,
): W | null {
  const day = at.getUTCDay();
  const minute = at.getUTCHours() * 60 + at.getUTCMinutes();
  return (
    windows.find(
      (w) =>
        w.days.includes(day) && minute >= w.startMinute && minute < w.endMinute,
    ) ?? null
  );
}

/** Problèmes d'une liste de plages (vide = valide) : bornes, jours, chevauchement. */
export function windowProblems(windows: readonly TimeWindow[]): string[] {
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
      const x = windows[a] as TimeWindow;
      const y = windows[b] as TimeWindow;
      if (
        x.days.some((d) => y.days.includes(d)) &&
        x.startMinute < y.endMinute &&
        y.startMinute < x.endMinute
      )
        problems.push(`plages ${a + 1} et ${b + 1} : chevauchement`);
    }
  return problems;
}

/** Prix amont (micro-USD par million) converti en micro-CAD au taux approuvé, arrondi vers le haut. */
export function upstreamCadMicro(
  usdMicro: bigint,
  usdToCadMicro: bigint,
): bigint {
  return ceilDiv(usdMicro * usdToCadMicro, PER_MILLION);
}

/** Prix de vente minimal pour une marge donnée (en points de base) sur le coût amont converti. */
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

export interface PriceRow {
  upstreamInputUsdMicro: bigint;
  upstreamOutputUsdMicro: bigint;
  upstreamCacheUsdMicro: bigint | null;
  sellInputCadMicro: bigint;
  sellOutputCadMicro: bigint;
  sellCacheCadMicro: bigint | null;
  upstreamCacheWriteUsdMicro?: bigint | null;
  sellCacheWriteCadMicro?: bigint | null;
  marginFloorBps: number;
}

type PriceField = "input" | "output" | "cache" | "cacheWrite";
export type PriceIssue =
  | { code: "price_zero"; field: PriceField }
  | { code: "below_margin_floor"; field: PriceField };

/**
 * Garde de publication des prix (D3) : jamais 0 $ ; jamais sous le plancher de marge sur le coût
 * amont converti. Un modèle d'embeddings ou de reclassement n'a pas de prix de sortie.
 */
export function checkPrice(
  price: PriceRow,
  usdToCadMicro: bigint,
  kind: "chat" | "embedding" | "rerank",
): PriceIssue[] {
  const issues: PriceIssue[] = [];
  if (price.sellInputCadMicro <= 0n)
    issues.push({ code: "price_zero", field: "input" });
  if (kind === "chat" && price.sellOutputCadMicro <= 0n)
    issues.push({ code: "price_zero", field: "output" });
  const floor = (up: bigint, sell: bigint) =>
    sell * BPS >=
    upstreamCadMicro(up, usdToCadMicro) * (BPS + BigInt(price.marginFloorBps));
  if (
    price.sellInputCadMicro > 0n &&
    !floor(price.upstreamInputUsdMicro, price.sellInputCadMicro)
  )
    issues.push({ code: "below_margin_floor", field: "input" });
  if (
    price.sellOutputCadMicro > 0n &&
    !floor(price.upstreamOutputUsdMicro, price.sellOutputCadMicro)
  )
    issues.push({ code: "below_margin_floor", field: "output" });
  if (price.sellCacheCadMicro !== null) {
    // Jamais 0 $, même si l'amont offre le cache gratuitement (M3).
    if (price.sellCacheCadMicro <= 0n)
      issues.push({ code: "price_zero", field: "cache" });
    // Sans tarif de cache amont, l'amont facture le cache au tarif d'entrée (voir `requestCost`) :
    // le plancher s'applique alors à ce coût-là.
    else if (
      !floor(
        price.upstreamCacheUsdMicro ?? price.upstreamInputUsdMicro,
        price.sellCacheCadMicro,
      )
    )
      issues.push({ code: "below_margin_floor", field: "cache" });
  }
  const write = price.sellCacheWriteCadMicro ?? null;
  if (write !== null) {
    if (write <= 0n) issues.push({ code: "price_zero", field: "cacheWrite" });
    else if (
      !floor(
        price.upstreamCacheWriteUsdMicro ?? price.upstreamInputUsdMicro,
        write,
      )
    )
      issues.push({ code: "below_margin_floor", field: "cacheWrite" });
  }
  return issues;
}

/** Montant décimal exact d'une valeur en micro-unités (« 0.6 », « 12 »), sans nombre à virgule flottante. */
export function formatMicro(micro: bigint): string {
  const negative = micro < 0n;
  const abs = negative ? -micro : micro;
  const whole = abs / PER_MILLION;
  const frac = (abs % PER_MILLION)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}
