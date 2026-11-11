/**
 * Coûts amont en NANO-USD (1 USD = 1 000 000 000), entiers `bigint`, converties SANS flottant (audit F-07).
 *
 * L'ancien enregistrement en micro-USD (`Math.round(cost × 1e6)`) faussait de 20 à 100 % les petites requêtes et
 * enregistrait 0 (« appel gratuit ») pour un coût inférieur à 0,5 µUSD. Ici, « absent » ou illisible vaut `null`,
 * jamais 0.
 */

const NANO_PER_USD_DIGITS = 9;
/** Garde-fou : plus d'un milliard de dollars pour UNE requête n'est pas un coût. */
const MAX_NANO = 10n ** 18n;

/**
 * Convertit un coût en USD (chaîne décimale, notation scientifique de LiteLLM « 5.75e-05 », ou nombre JSON déjà
 * analysé) en nano-USD, arrondi au plus proche au-delà de la neuvième décimale. `null` si la valeur n'est pas un
 * montant positif ou nul lisible. Un nombre JSON est relu par sa représentation la plus courte (celle que l'amont
 * a écrite), jamais par une multiplication flottante.
 */
export function usdToNano(value: unknown): bigint | null {
  let text: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    text = String(value);
  } else if (typeof value === "string") {
    text = value.trim();
  } else return null;
  const m = /^\+?(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!m) return null;
  const whole = m[1] ?? "";
  const fraction = m[2] ?? "";
  if (whole.length === 0 && fraction.length === 0) return null;
  const exponent = m[3] === undefined ? 0 : Number(m[3]);
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 60) return null;
  const digits = BigInt(`${whole}${fraction}` || "0");
  // valeur = digits × 10^(exponent − fraction.length) USD ; nano = valeur × 10^9.
  const shift = NANO_PER_USD_DIGITS + exponent - fraction.length;
  let nano: bigint;
  if (shift >= 0) nano = digits * 10n ** BigInt(shift);
  else {
    const divisor = 10n ** BigInt(-shift);
    nano = (digits * 2n + divisor) / (divisor * 2n); // arrondi au plus proche (moitié vers le haut)
  }
  return nano > MAX_NANO ? null : nano;
}

/** Nano-USD → micro-USD arrondi au plus proche : alimente la colonne historique `reported_cost_usd_micro`. */
export function nanoToMicroRounded(nano: bigint): bigint {
  return (nano + 500n) / 1000n;
}
