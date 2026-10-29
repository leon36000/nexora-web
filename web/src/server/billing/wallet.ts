import {
  and,
  creditEntries,
  type Database,
  eq,
  inArray,
  sql,
} from "@nexora/db";

/**
 * Lots du portefeuille d'UNE organisation : d'où viennent les crédits, ce qu'il en reste et quand ils expirent.
 * Le grand livre impute toute consommation (règlements, dépassements, remboursements, litiges) aux lots dans l'ordre
 * d'échéance, le plus proche d'abord, sans échéance en dernier (voir `expireDue` dans `packages/db/src/ledger.ts`) :
 * `allocateLots` refait le même partage, en lecture seule, pour l'afficher. Les crédits inclus d'une offre expirent à
 * la fin de leur période : ils servent donc avant les crédits achetés.
 */

/** Source des écritures `credit` des crédits inclus d'une offre (webhook, douzièmes annuels). */
export const INCLUDED_SOURCE = "subscription";

export interface RawLot {
  id: string;
  source: string;
  amountMicro: bigint;
  createdAt: Date;
  expiresAt: Date | null;
}

export interface WalletLot extends RawLot {
  /** Part consommée, imputée par ordre d'échéance. */
  usedMicro: bigint;
  /** Part déjà retirée par une écriture d'expiration. */
  expiredMicro: bigint;
  remainingMicro: bigint;
  /** Crédits inclus d'une offre (par opposition aux crédits achetés ou offerts). */
  included: boolean;
}

export interface IncludedCredits {
  amountMicro: bigint;
  usedMicro: bigint;
  remainingMicro: bigint;
  /** Fin de validité la plus proche des lots inclus non échus. */
  expiresAt: Date | null;
}

export interface Wallet {
  /** Lots non échus, dans l'ordre où ils servent. */
  lots: WalletLot[];
  /** Crédits inclus de la période courante ; null sans offre qui en verse. */
  included: IncludedCredits | null;
}

const min = (a: bigint, b: bigint) => (a < b ? a : b);

/** Pur : partage la consommation entre les lots et rend ceux qui n'ont pas expiré à `now`. */
export function allocateLots(
  lots: readonly RawLot[],
  consumedMicro: bigint,
  expiredByLot: ReadonlyMap<string, bigint>,
  now: Date,
): WalletLot[] {
  const ordered = [...lots].sort((a, b) => {
    const ea = a.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const eb = b.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
    if (ea !== eb) return ea < eb ? -1 : 1;
    const ca = a.createdAt.getTime();
    const cb = b.createdAt.getTime();
    if (ca !== cb) return ca - cb;
    return a.id < b.id ? -1 : 1;
  });
  let rest = consumedMicro > 0n ? consumedMicro : 0n;
  const out: WalletLot[] = [];
  for (const lot of ordered) {
    const used = min(rest, lot.amountMicro);
    rest -= used;
    if (lot.expiresAt && lot.expiresAt <= now) continue;
    const expired = expiredByLot.get(lot.id) ?? 0n;
    const remaining = lot.amountMicro - used - expired;
    out.push({
      ...lot,
      usedMicro: used,
      expiredMicro: expired,
      remainingMicro: remaining > 0n ? remaining : 0n,
      included: lot.source === INCLUDED_SOURCE,
    });
  }
  return out;
}

export async function loadWallet(
  db: Database,
  organizationId: string,
  now: Date = new Date(),
): Promise<Wallet> {
  const [rows, consumed, expired] = await Promise.all([
    db
      .select({
        id: creditEntries.id,
        source: creditEntries.source,
        amountMicro: creditEntries.balanceDeltaMicro,
        createdAt: creditEntries.createdAt,
        expiresAt: creditEntries.expiresAt,
      })
      .from(creditEntries)
      .where(
        and(
          eq(creditEntries.organizationId, organizationId),
          eq(creditEntries.kind, "credit"),
        ),
      ),
    db
      .select({
        total: sql<string>`COALESCE(-SUM(${creditEntries.balanceDeltaMicro}), 0)::text`,
      })
      .from(creditEntries)
      .where(
        and(
          eq(creditEntries.organizationId, organizationId),
          inArray(creditEntries.kind, [
            "settle",
            "overage",
            "refund",
            "dispute",
          ]),
        ),
      ),
    db
      .select({
        lot: creditEntries.lotEntryId,
        total: sql<string>`(-SUM(${creditEntries.balanceDeltaMicro}))::text`,
      })
      .from(creditEntries)
      .where(
        and(
          eq(creditEntries.organizationId, organizationId),
          eq(creditEntries.kind, "expire"),
        ),
      )
      .groupBy(creditEntries.lotEntryId),
  ]);
  const expiredByLot = new Map<string, bigint>();
  for (const e of expired) if (e.lot) expiredByLot.set(e.lot, BigInt(e.total));
  const lots = allocateLots(
    rows,
    BigInt(consumed[0]?.total ?? "0"),
    expiredByLot,
    now,
  );
  const included = lots.filter((l) => l.included);
  if (included.length === 0) return { lots, included: null };
  const amountMicro = included.reduce((s, l) => s + l.amountMicro, 0n);
  const usedMicro = included.reduce((s, l) => s + l.usedMicro, 0n);
  const remainingMicro = included.reduce((s, l) => s + l.remainingMicro, 0n);
  const dates = included
    .map((l) => l.expiresAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  return {
    lots,
    included: {
      amountMicro,
      usedMicro,
      remainingMicro,
      expiresAt: dates[0] ?? null,
    },
  };
}
