import { minBigint } from "@nexora/db";

/** Micro-unités par cent canadien : 1 CAD = 100 cents = 1 000 000 micro-unités. */
const MICRO_PER_CENT = 10_000n;

function assertCents(cents: number): void {
  if (!Number.isSafeInteger(cents) || cents < 0)
    throw new RangeError("montant en cents : entier ≥ 0 attendu");
}

export function centsToMicro(cents: number): bigint {
  assertCents(cents);
  return BigInt(cents) * MICRO_PER_CENT;
}

/** Cents entiers (arrondi vers le bas). */
export function microToCents(micro: bigint): bigint {
  return micro / MICRO_PER_CENT;
}

/**
 * Crédits à retirer du grand livre pour un remboursement Stripe (D7).
 *
 * Les crédits achetés valent le montant avant taxes, mais le client a payé taxes comprises : un
 * remboursement partiel retire la même fraction des crédits que la fraction du total remboursée.
 * `cumulativeRefundedCents` est le total remboursé à ce jour (champ `amount_refunded` de la charge) ;
 * `alreadyDebitedMicro` ce qui a déjà été retiré pour cet achat. Le résultat est le complément à
 * retirer : un rejeu du même cumul donne 0. Arrondi vers le bas (en faveur du client), plafonné
 * aux crédits achetés.
 */
export function creditsToDebitForRefund(input: {
  creditsMicro: bigint;
  amountTotalCents: number;
  cumulativeRefundedCents: number;
  alreadyDebitedMicro: bigint;
}): bigint {
  if (
    !Number.isSafeInteger(input.amountTotalCents) ||
    input.amountTotalCents <= 0
  )
    throw new RangeError("total payé : entier > 0 attendu");
  assertCents(input.cumulativeRefundedCents);
  const refunded = BigInt(
    Math.min(input.cumulativeRefundedCents, input.amountTotalCents),
  );
  const target =
    (input.creditsMicro * refunded) / BigInt(input.amountTotalCents);
  const delta = target - input.alreadyDebitedMicro;
  const room = input.creditsMicro - input.alreadyDebitedMicro;
  if (delta <= 0n) return 0n;
  return minBigint(delta, room);
}

/** Ajoute des mois civils en UTC ; le 31 janvier + 1 mois donne le dernier jour de février. */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/**
 * Montant saisi en dollars canadiens (« 25 », « 25,50 ») converti en cents entiers sans passer par
 * un nombre à virgule flottante. Renvoie null si le format est invalide.
 */
export function parseCadToCents(input: string): number | null {
  const match = /^(\d{1,6})(?:[.,](\d{1,2}))?$/.exec(input.trim());
  if (!match) return null;
  const dollars = Number(match[1]);
  const cents = Number((match[2] ?? "").padEnd(2, "0") || "0");
  return dollars * 100 + cents;
}
