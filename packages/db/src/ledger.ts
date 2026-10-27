import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { Database } from "./client.ts";
import {
  creditAccounts,
  creditEntries,
  creditReservations,
  type EntryKind,
} from "./schema.ts";

/**
 * Grand livre de crédits (D1/D7), en micro-unités CAD entières (`bigint`, 1 CAD = 1 000 000).
 *
 * - Les écritures (`credit_entries`) sont immuables (déclencheur SQL) et idempotentes par clé.
 * - Chaque opération verrouille la ligne `credit_accounts` de l'organisation (FOR UPDATE) :
 *   les écritures d'une même organisation sont sérialisées, ce qui rend la réservation atomique.
 * - Solde disponible = solde − montants réservés. Une réservation exige un disponible suffisant ;
 *   seul un remboursement ou un litige peut rendre le solde négatif, et l'API est alors bloquée.
 * - Une contrainte SQL (`credit_entries_no_overdraft_check`) refuse en dernier recours un
 *   disponible négatif causé par une réservation ou une expiration.
 */

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Une connexion ou une transaction en cours (alors, l'opération devient un point de sauvegarde). */
export type Executor = Database | Tx;

export type LedgerErrorCode =
  | "invalid_amount"
  | "invalid_kind"
  | "idempotency_conflict"
  | "not_found"
  | "reservation_closed";

export class LedgerError extends Error {
  readonly code: LedgerErrorCode;
  constructor(code: LedgerErrorCode, message: string) {
    super(message);
    this.name = "LedgerError";
    this.code = code;
  }
}

export type Entry = typeof creditEntries.$inferSelect;
export type Reservation = typeof creditReservations.$inferSelect;

export interface Account {
  organizationId: string;
  balanceMicro: bigint;
  heldMicro: bigint;
  availableMicro: bigint;
  /** Solde négatif (remboursement ou litige) : l'API de la passerelle doit refuser les appels. */
  blocked: boolean;
}

/** Plus petit de deux `bigint` (`Math.min` ne les accepte pas). */
export function minBigint(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

function inTx<T>(exec: Executor, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (exec as Database).transaction(fn);
}

function assertPositive(amount: bigint, what = "montant"): void {
  if (typeof amount !== "bigint" || amount <= 0n)
    throw new LedgerError("invalid_amount", `${what} : entier positif attendu`);
}

/** Crée le compte s'il manque, puis le verrouille pour la durée de la transaction. */
async function lockAccount(tx: Tx, organizationId: string) {
  await tx
    .insert(creditAccounts)
    .values({ organizationId })
    .onConflictDoNothing();
  const [acct] = await tx
    .select()
    .from(creditAccounts)
    .where(eq(creditAccounts.organizationId, organizationId))
    .for("update");
  if (!acct) throw new LedgerError("not_found", "compte introuvable");
  return acct;
}

interface NewEntry {
  organizationId: string;
  kind: EntryKind;
  balanceDeltaMicro: bigint;
  heldDeltaMicro: bigint;
  idempotencyKey: string;
  configVersion: string;
  source: string;
  reservationId?: string;
  lotEntryId?: string;
  purchaseId?: string;
  expiresAt?: Date | null;
  externalRef?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Écrit une écriture et met à jour le compte. Le compte est déjà verrouillé par l'appelant
 * (`acct` = ligne lue sous verrou). Renvoie l'écriture insérée.
 */
async function appendEntry(
  tx: Tx,
  acct: { balanceMicro: bigint; heldMicro: bigint },
  e: NewEntry,
): Promise<{ entry: Entry; balanceMicro: bigint; heldMicro: bigint }> {
  const balanceMicro = acct.balanceMicro + e.balanceDeltaMicro;
  const heldMicro = acct.heldMicro + e.heldDeltaMicro;
  const [entry] = await tx
    .insert(creditEntries)
    .values({
      organizationId: e.organizationId,
      kind: e.kind,
      balanceDeltaMicro: e.balanceDeltaMicro,
      heldDeltaMicro: e.heldDeltaMicro,
      balanceAfterMicro: balanceMicro,
      heldAfterMicro: heldMicro,
      idempotencyKey: e.idempotencyKey,
      configVersion: e.configVersion,
      source: e.source,
      reservationId: e.reservationId,
      lotEntryId: e.lotEntryId,
      purchaseId: e.purchaseId,
      expiresAt: e.expiresAt ?? null,
      externalRef: e.externalRef,
      metadata: e.metadata ?? {},
    })
    .returning();
  if (!entry) throw new Error("écriture non créée");
  await tx
    .update(creditAccounts)
    .set({ balanceMicro, heldMicro, updatedAt: sql`now()` })
    .where(eq(creditAccounts.organizationId, e.organizationId));
  return { entry, balanceMicro, heldMicro };
}

async function findEntryByKey(tx: Tx, key: string): Promise<Entry | undefined> {
  const [row] = await tx
    .select()
    .from(creditEntries)
    .where(eq(creditEntries.idempotencyKey, key));
  return row;
}

function toAccount(row: {
  organizationId: string;
  balanceMicro: bigint;
  heldMicro: bigint;
}): Account {
  return {
    organizationId: row.organizationId,
    balanceMicro: row.balanceMicro,
    heldMicro: row.heldMicro,
    availableMicro: row.balanceMicro - row.heldMicro,
    blocked: row.balanceMicro < 0n,
  };
}

/** Compte de l'organisation (zéro si aucune écriture n'a encore eu lieu). */
export async function getAccount(
  exec: Executor,
  organizationId: string,
): Promise<Account> {
  const [row] = await exec
    .select()
    .from(creditAccounts)
    .where(eq(creditAccounts.organizationId, organizationId));
  return toAccount(row ?? { organizationId, balanceMicro: 0n, heldMicro: 0n });
}

/** Solde recalculé depuis les écritures (contrôle de cohérence avec le compte en cache). */
export async function deriveBalance(
  exec: Executor,
  organizationId: string,
): Promise<{ balanceMicro: bigint; heldMicro: bigint }> {
  const [row] = await exec
    .select({
      balance: sql<string>`COALESCE(SUM(${creditEntries.balanceDeltaMicro}), 0)::text`,
      held: sql<string>`COALESCE(SUM(${creditEntries.heldDeltaMicro}), 0)::text`,
    })
    .from(creditEntries)
    .where(eq(creditEntries.organizationId, organizationId));
  return {
    balanceMicro: BigInt(row?.balance ?? "0"),
    heldMicro: BigInt(row?.held ?? "0"),
  };
}

export async function listEntries(
  exec: Executor,
  organizationId: string,
  options: { limit?: number } = {},
): Promise<Entry[]> {
  return exec
    .select()
    .from(creditEntries)
    .where(eq(creditEntries.organizationId, organizationId))
    .orderBy(desc(creditEntries.createdAt), desc(creditEntries.id))
    .limit(options.limit ?? 100);
}

function sameEntry(e: Entry, org: string, kind: EntryKind, delta: bigint) {
  return (
    e.organizationId === org &&
    e.kind === kind &&
    (e.balanceDeltaMicro === delta || e.heldDeltaMicro === delta)
  );
}

export interface CreditInput {
  organizationId: string;
  amountMicro: bigint;
  idempotencyKey: string;
  configVersion: string;
  source: string;
  expiresAt?: Date | null;
  externalRef?: string;
  purchaseId?: string;
  metadata?: Record<string, unknown>;
}

/** Ajoute des crédits (achat, crédits inclus d'un abonnement, geste commercial). Idempotent. */
export async function credit(
  exec: Executor,
  input: CreditInput,
): Promise<{ entry: Entry; replayed: boolean }> {
  assertPositive(input.amountMicro);
  return inTx(exec, async (tx) => {
    const acct = await lockAccount(tx, input.organizationId);
    const existing = await findEntryByKey(tx, input.idempotencyKey);
    if (existing) {
      if (
        !sameEntry(existing, input.organizationId, "credit", input.amountMicro)
      )
        throw new LedgerError("idempotency_conflict", "clé déjà utilisée");
      return { entry: existing, replayed: true };
    }
    const { entry } = await appendEntry(tx, acct, {
      organizationId: input.organizationId,
      kind: "credit",
      balanceDeltaMicro: input.amountMicro,
      heldDeltaMicro: 0n,
      idempotencyKey: input.idempotencyKey,
      configVersion: input.configVersion,
      source: input.source,
      expiresAt: input.expiresAt,
      externalRef: input.externalRef,
      purchaseId: input.purchaseId,
      metadata: input.metadata,
    });
    return { entry, replayed: false };
  });
}

export interface DebitInput {
  organizationId: string;
  kind: "refund" | "dispute";
  amountMicro: bigint;
  idempotencyKey: string;
  configVersion: string;
  source: string;
  purchaseId?: string;
  externalRef?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Débit consécutif à un remboursement ou à un litige. Le seul chemin qui peut rendre le solde
 * négatif (le compte est alors bloqué, voir `Account.blocked`). Idempotent.
 */
export async function debit(
  exec: Executor,
  input: DebitInput,
): Promise<{ entry: Entry; replayed: boolean }> {
  if (input.kind !== "refund" && input.kind !== "dispute")
    throw new LedgerError("invalid_kind", "refund ou dispute attendu");
  assertPositive(input.amountMicro);
  return inTx(exec, async (tx) => {
    const acct = await lockAccount(tx, input.organizationId);
    const existing = await findEntryByKey(tx, input.idempotencyKey);
    if (existing) {
      if (
        !sameEntry(
          existing,
          input.organizationId,
          input.kind,
          -input.amountMicro,
        )
      )
        throw new LedgerError("idempotency_conflict", "clé déjà utilisée");
      return { entry: existing, replayed: true };
    }
    const { entry } = await appendEntry(tx, acct, {
      organizationId: input.organizationId,
      kind: input.kind,
      balanceDeltaMicro: -input.amountMicro,
      heldDeltaMicro: 0n,
      idempotencyKey: input.idempotencyKey,
      configVersion: input.configVersion,
      source: input.source,
      purchaseId: input.purchaseId,
      externalRef: input.externalRef,
      metadata: input.metadata,
    });
    return { entry, replayed: false };
  });
}

export interface ReserveInput {
  organizationId: string;
  amountMicro: bigint;
  idempotencyKey: string;
  configVersion: string;
}

export type ReserveResult =
  | { status: "reserved"; reservation: Reservation; entry: Entry }
  | { status: "replayed"; reservation: Reservation }
  | { status: "insufficient_funds"; availableMicro: bigint }
  | { status: "blocked"; balanceMicro: bigint };

/**
 * Réserve atomiquement le coût maximal estimé d'une requête. Le verrou de ligne sérialise les
 * réservations d'une organisation : le total retenu ne dépasse jamais le solde.
 */
export async function reserve(
  exec: Executor,
  input: ReserveInput,
): Promise<ReserveResult> {
  assertPositive(input.amountMicro);
  return inTx(exec, async (tx) => {
    const acct = await lockAccount(tx, input.organizationId);
    const [existing] = await tx
      .select()
      .from(creditReservations)
      .where(eq(creditReservations.idempotencyKey, input.idempotencyKey));
    if (existing) {
      if (
        existing.organizationId !== input.organizationId ||
        existing.amountMicro !== input.amountMicro
      )
        throw new LedgerError("idempotency_conflict", "clé déjà utilisée");
      return { status: "replayed", reservation: existing };
    }
    if (acct.balanceMicro < 0n)
      return { status: "blocked", balanceMicro: acct.balanceMicro };
    const available = acct.balanceMicro - acct.heldMicro;
    if (available < input.amountMicro)
      return { status: "insufficient_funds", availableMicro: available };

    const [reservation] = await tx
      .insert(creditReservations)
      .values({
        organizationId: input.organizationId,
        amountMicro: input.amountMicro,
        idempotencyKey: input.idempotencyKey,
        configVersion: input.configVersion,
      })
      .returning();
    if (!reservation) throw new Error("réservation non créée");
    const { entry } = await appendEntry(tx, acct, {
      organizationId: input.organizationId,
      kind: "reserve",
      balanceDeltaMicro: 0n,
      heldDeltaMicro: input.amountMicro,
      idempotencyKey: `reserve:${reservation.id}`,
      configVersion: input.configVersion,
      source: "usage",
      reservationId: reservation.id,
    });
    return { status: "reserved", reservation, entry };
  });
}

async function lockReservation(
  tx: Tx,
  organizationId: string,
  reservationId: string,
): Promise<Reservation> {
  const [row] = await tx
    .select()
    .from(creditReservations)
    .where(
      and(
        eq(creditReservations.id, reservationId),
        eq(creditReservations.organizationId, organizationId),
      ),
    )
    .for("update");
  if (!row) throw new LedgerError("not_found", "réservation introuvable");
  return row;
}

export interface SettleInput {
  organizationId: string;
  reservationId: string;
  /** Coût réel (jetons × prix de vente). Plafonné au montant réservé. */
  actualMicro: bigint;
  configVersion?: string;
}

/** Règle une réservation au coût réel et libère le surplus. Une seule fois ; un rejeu renvoie le premier. */
export async function settleReservation(
  exec: Executor,
  input: SettleInput,
): Promise<{ entry: Entry; replayed: boolean }> {
  if (typeof input.actualMicro !== "bigint" || input.actualMicro < 0n)
    throw new LedgerError("invalid_amount", "coût réel : entier ≥ 0 attendu");
  return inTx(exec, async (tx) => {
    const acct = await lockAccount(tx, input.organizationId);
    const res = await lockReservation(
      tx,
      input.organizationId,
      input.reservationId,
    );
    if (res.status === "settled") {
      const existing = await findEntryByKey(tx, `settle:${res.id}`);
      if (!existing)
        throw new LedgerError("not_found", "écriture de règlement absente");
      return { entry: existing, replayed: true };
    }
    if (res.status === "released")
      throw new LedgerError("reservation_closed", "réservation déjà libérée");

    const cost = minBigint(input.actualMicro, res.amountMicro);
    const overage = input.actualMicro - cost;
    const { entry } = await appendEntry(tx, acct, {
      organizationId: input.organizationId,
      kind: "settle",
      balanceDeltaMicro: -cost,
      heldDeltaMicro: -res.amountMicro,
      idempotencyKey: `settle:${res.id}`,
      configVersion: input.configVersion ?? res.configVersion,
      source: "usage",
      reservationId: res.id,
      metadata: overage > 0n ? { overageMicro: overage.toString() } : {},
    });
    await tx
      .update(creditReservations)
      .set({ status: "settled", settledMicro: cost, closedAt: sql`now()` })
      .where(eq(creditReservations.id, res.id));
    return { entry, replayed: false };
  });
}

/** Libère une réservation sans rien dépenser (requête échouée ou annulée). Idempotent. */
export async function releaseReservation(
  exec: Executor,
  input: { organizationId: string; reservationId: string },
): Promise<{ entry: Entry; replayed: boolean }> {
  return inTx(exec, async (tx) => {
    const acct = await lockAccount(tx, input.organizationId);
    const res = await lockReservation(
      tx,
      input.organizationId,
      input.reservationId,
    );
    if (res.status === "released") {
      const existing = await findEntryByKey(tx, `release:${res.id}`);
      if (!existing)
        throw new LedgerError("not_found", "écriture de libération absente");
      return { entry: existing, replayed: true };
    }
    if (res.status === "settled")
      throw new LedgerError("reservation_closed", "réservation déjà réglée");
    const { entry } = await appendEntry(tx, acct, {
      organizationId: input.organizationId,
      kind: "release",
      balanceDeltaMicro: 0n,
      heldDeltaMicro: -res.amountMicro,
      idempotencyKey: `release:${res.id}`,
      configVersion: res.configVersion,
      source: "usage",
      reservationId: res.id,
    });
    await tx
      .update(creditReservations)
      .set({ status: "released", closedAt: sql`now()` })
      .where(eq(creditReservations.id, res.id));
    return { entry, replayed: false };
  });
}

/**
 * Libère les réservations ouvertes depuis `olderThan` (requête perdue : plantage entre la
 * réservation et le règlement). À appeler périodiquement par le worker. Renvoie le nombre libéré.
 */
export async function releaseStaleReservations(
  exec: Executor,
  options: { olderThan: Date },
): Promise<number> {
  const stale = await exec
    .select({
      id: creditReservations.id,
      organizationId: creditReservations.organizationId,
    })
    .from(creditReservations)
    .where(
      and(
        eq(creditReservations.status, "open"),
        lt(creditReservations.createdAt, options.olderThan),
      ),
    )
    .orderBy(asc(creditReservations.createdAt))
    .limit(500);
  let released = 0;
  for (const r of stale) {
    try {
      const out = await releaseReservation(exec, {
        organizationId: r.organizationId,
        reservationId: r.id,
      });
      if (!out.replayed) released += 1;
    } catch (error) {
      // Réglée entre-temps : rien à libérer.
      if (
        !(error instanceof LedgerError && error.code === "reservation_closed")
      )
        throw error;
    }
  }
  return released;
}

export interface ExpireInput {
  organizationId: string;
  now: Date;
  configVersion: string;
}

/**
 * Expire les crédits échus et non consommés (12 mois par défaut, fixés à l'écriture du lot).
 *
 * Attribution : toute consommation (règlements, remboursements, litiges) est imputée aux lots
 * dans l'ordre d'échéance (le plus proche d'abord, sans échéance en dernier). La part non
 * consommée d'un lot échu est retirée, sans jamais entamer les montants réservés ni rendre le
 * disponible négatif. Rejouable : la clé d'une expiration dépend du montant déjà expiré du lot.
 */
export async function expireDue(
  exec: Executor,
  input: ExpireInput,
): Promise<{ expiredMicro: bigint; entries: Entry[] }> {
  return inTx(exec, async (tx) => {
    const acct = await lockAccount(tx, input.organizationId);
    const lots = await tx
      .select()
      .from(creditEntries)
      .where(
        and(
          eq(creditEntries.organizationId, input.organizationId),
          eq(creditEntries.kind, "credit"),
        ),
      )
      .orderBy(
        sql`${creditEntries.expiresAt} ASC NULLS LAST`,
        asc(creditEntries.createdAt),
        asc(creditEntries.id),
      );
    const [consumed] = await tx
      .select({
        total: sql<string>`COALESCE(-SUM(${creditEntries.balanceDeltaMicro}), 0)::text`,
      })
      .from(creditEntries)
      .where(
        and(
          eq(creditEntries.organizationId, input.organizationId),
          inArray(creditEntries.kind, ["settle", "refund", "dispute"]),
        ),
      );
    const expiredRows = await tx
      .select({
        lot: creditEntries.lotEntryId,
        total: sql<string>`(-SUM(${creditEntries.balanceDeltaMicro}))::text`,
      })
      .from(creditEntries)
      .where(
        and(
          eq(creditEntries.organizationId, input.organizationId),
          eq(creditEntries.kind, "expire"),
        ),
      )
      .groupBy(creditEntries.lotEntryId);
    const alreadyExpired = new Map(
      expiredRows.map((r) => [r.lot, BigInt(r.total)] as const),
    );

    let remainingConsumption = BigInt(consumed?.total ?? "0");
    let state = { balanceMicro: acct.balanceMicro, heldMicro: acct.heldMicro };
    let expiredMicro = 0n;
    const entries: Entry[] = [];

    for (const lot of lots) {
      const used = minBigint(remainingConsumption, lot.balanceDeltaMicro);
      remainingConsumption -= used;
      if (!lot.expiresAt || lot.expiresAt > input.now) continue;
      const done = alreadyExpired.get(lot.id) ?? 0n;
      const unused = lot.balanceDeltaMicro - used - done;
      if (unused <= 0n) continue;
      const available = state.balanceMicro - state.heldMicro;
      const amount = minBigint(unused, available);
      if (amount <= 0n) continue;
      const res = await appendEntry(tx, state, {
        organizationId: input.organizationId,
        kind: "expire",
        balanceDeltaMicro: -amount,
        heldDeltaMicro: 0n,
        idempotencyKey: `expire:${lot.id}:${done}`,
        configVersion: input.configVersion,
        source: "expiration",
        lotEntryId: lot.id,
        metadata: { lotExpiresAt: lot.expiresAt.toISOString() },
      });
      state = { balanceMicro: res.balanceMicro, heldMicro: res.heldMicro };
      expiredMicro += amount;
      entries.push(res.entry);
    }
    return { expiredMicro, entries };
  });
}
