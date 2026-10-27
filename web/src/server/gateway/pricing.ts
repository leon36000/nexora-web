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
}

export interface PerMillion {
  input: bigint;
  output: bigint;
  /** null : le tarif d'entrée s'applique aux jetons en cache. */
  cache: bigint | null;
}

/** Coût d'une requête : une seule division, donc un seul arrondi. */
export function requestCost(usage: Usage, price: PerMillion): bigint {
  assertTokens(usage.prompt);
  assertTokens(usage.completion);
  assertTokens(usage.cached);
  const cached = Math.min(usage.cached, usage.prompt);
  const fresh = usage.prompt - cached;
  const total =
    BigInt(fresh) * price.input +
    BigInt(cached) * (price.cache ?? price.input) +
    BigInt(usage.completion) * price.output;
  return ceilDiv(total, PER_MILLION);
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
  marginFloorBps: number;
}

export type PriceIssue =
  | { code: "price_zero"; field: "input" | "output" | "cache" }
  | { code: "below_margin_floor"; field: "input" | "output" | "cache" };

/**
 * Garde de publication des prix (D3) : jamais 0 $ ; jamais sous le plancher de marge sur le coût
 * amont converti. Un modèle d'embeddings n'a pas de prix de sortie.
 */
export function checkPrice(
  price: PriceRow,
  usdToCadMicro: bigint,
  kind: "chat" | "embedding",
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
