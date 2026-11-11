import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { Database } from "./client.ts";
import { recordFinding } from "./intents.ts";
import {
  apiKeys,
  creditAccounts,
  creditEntries,
  creditReservations,
  type EntryKind,
  usageEvents,
  usageIntents,
} from "./schema.ts";

/**
 * Grand livre de crédits (D1/D7), en micro-unités CAD entières (`bigint`, 1 CAD = 1 000 000).
 *
 * - Les écritures (`credit_entries`) sont immuables (déclencheur SQL) et idempotentes par clé.
 * - Chaque opération verrouille la ligne `credit_accounts` de l'organisation (FOR UPDATE) :
 *   les écritures d'une même organisation sont sérialisées, ce qui rend la réservation atomique.
 * - Solde disponible = solde − montants réservés. Une réservation exige un disponible suffisant ;
 *   seuls un remboursement, un litige ou le dépassement d'une réservation (écriture « overage »)
 *   peuvent rendre le solde négatif, et l'API est alors bloquée (402).
 * - Règlement au coût RÉEL (D1) : jusqu'au montant réservé, une écriture « settle » ; au-delà, une
 *   écriture « overage » distincte, dans la même transaction et idempotente par réservation.
 *   Nexora n'absorbe jamais le dépassement d'une estimation trop basse.
 * - Plafond de dépense d'une clé API : retenu et rendu dans la MÊME transaction que la réservation
 *   du grand livre (jamais d'état intermédiaire), y compris à la libération périodique.
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
  /** Métadonnées internes de l'écriture de réservation (ex. libellé du produit). */
  metadata?: Record<string, unknown>;
  /**
   * Clé API qui émet la requête. Si elle a un plafond de dépense, le montant y est retenu dans la même
   * transaction (et rendu au règlement ou à la libération) ; sinon seul le coût réglé s'y ajoute.
   */
  apiKeyId?: string;
}

export type ReserveResult =
  | { status: "reserved"; reservation: Reservation; entry: Entry }
  | { status: "replayed"; reservation: Reservation }
  | { status: "insufficient_funds"; availableMicro: bigint }
  | { status: "blocked"; balanceMicro: bigint }
  /** Le plafond de dépense de la clé serait dépassé : rien n'est écrit. */
  | { status: "key_cap_exceeded" };

/** Ajuste la dépense cumulée d'une clé (jamais sous zéro). Sans effet pour un delta nul. */
async function adjustKeySpend(
  tx: Tx,
  apiKeyId: string | null,
  deltaMicro: bigint,
): Promise<void> {
  if (!apiKeyId || deltaMicro === 0n) return;
  await tx
    .update(apiKeys)
    .set({
      spentMicro: sql`GREATEST(${apiKeys.spentMicro} + ${deltaMicro.toString()}::bigint, 0)`,
    })
    .where(eq(apiKeys.id, apiKeyId));
}

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
        existing.amountMicro !== input.amountMicro ||
        existing.apiKeyId !== (input.apiKeyId ?? null)
      )
        throw new LedgerError("idempotency_conflict", "clé déjà utilisée");
      return { status: "replayed", reservation: existing };
    }
    // Plafond de la clé (verrou pris après celui du compte, comme au règlement : pas d'interblocage).
    let keySpendHeld = false;
    if (input.apiKeyId) {
      const [key] = await tx
        .select({
          organizationId: apiKeys.organizationId,
          spendCapMicro: apiKeys.spendCapMicro,
          spentMicro: apiKeys.spentMicro,
        })
        .from(apiKeys)
        .where(eq(apiKeys.id, input.apiKeyId))
        .for("update");
      if (!key || key.organizationId !== input.organizationId)
        throw new LedgerError("not_found", "clé API introuvable");
      if (key.spendCapMicro !== null) {
        if (key.spentMicro + input.amountMicro > key.spendCapMicro)
          return { status: "key_cap_exceeded" };
        keySpendHeld = true;
      }
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
        apiKeyId: input.apiKeyId ?? null,
        keySpendHeld,
      })
      .returning();
    if (!reservation) throw new Error("réservation non créée");
    if (keySpendHeld)
      await adjustKeySpend(tx, input.apiKeyId ?? null, input.amountMicro);
    const { entry } = await appendEntry(tx, acct, {
      organizationId: input.organizationId,
      kind: "reserve",
      balanceDeltaMicro: 0n,
      heldDeltaMicro: input.amountMicro,
      idempotencyKey: `reserve:${reservation.id}`,
      configVersion: input.configVersion,
      source: "usage",
      reservationId: reservation.id,
      metadata: input.metadata,
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
  /** Coût réel (jetons × prix de vente). Facturé en entier, même au-delà du montant réservé. */
  actualMicro: bigint;
  configVersion?: string;
}

export interface SettleResult {
  /** Écriture « settle » (ou « overage » seule si la réservation avait déjà été libérée). */
  entry: Entry;
  /** Écriture de dépassement : le coût réel excédait la réservation (ou elle avait été libérée). */
  overageEntry: Entry | null;
  /** Montant total débité du solde pour cette réservation. */
  chargedMicro: bigint;
  replayed: boolean;
}

/**
 * Règle une réservation au coût RÉEL (D1). Jusqu'au montant réservé : une écriture « settle » qui libère
 * le surplus. Au-delà : une écriture « overage » supplémentaire, dans la même transaction, qui peut
 * rendre le solde négatif (l'API est alors bloquée). Une seule fois ; un rejeu renvoie le premier résultat.
 *
 * Réservation déjà libérée (libération périodique d'une requête lente) : le coût réel est dû quand même,
 * débité en entier par une écriture « overage » (aucun montant n'est plus retenu). Un coût nul ne produit rien.
 */
export async function settleReservation(
  exec: Executor,
  input: SettleInput,
): Promise<SettleResult> {
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
      const entry = await findEntryByKey(tx, `settle:${res.id}`);
      if (!entry)
        throw new LedgerError("not_found", "écriture de règlement absente");
      const overageEntry =
        (await findEntryByKey(tx, `overage:${res.id}`)) ?? null;
      return {
        entry,
        overageEntry,
        chargedMicro: res.settledMicro ?? -entry.balanceDeltaMicro,
        replayed: true,
      };
    }
    if (res.status === "released") {
      const late = await findEntryByKey(tx, `overage:${res.id}`);
      if (late)
        return {
          entry: late,
          overageEntry: late,
          chargedMicro: -late.balanceDeltaMicro,
          replayed: true,
        };
      if (res.settledMicro !== null) {
        if (res.settledMicro !== 0n)
          throw new LedgerError("not_found", "écriture de règlement absente");
        const released = await findEntryByKey(tx, `release:${res.id}`);
        if (!released)
          throw new LedgerError("not_found", "écriture de libération absente");
        return {
          entry: released,
          overageEntry: null,
          chargedMicro: 0n,
          replayed: true,
        };
      }
      if (input.actualMicro === 0n) {
        const released = await findEntryByKey(tx, `release:${res.id}`);
        if (!released)
          throw new LedgerError("not_found", "écriture de libération absente");
        await tx
          .update(creditReservations)
          .set({ settledMicro: 0n })
          .where(eq(creditReservations.id, res.id));
        return {
          entry: released,
          overageEntry: null,
          chargedMicro: 0n,
          replayed: false,
        };
      }
      const { entry } = await appendEntry(tx, acct, {
        organizationId: input.organizationId,
        kind: "overage",
        balanceDeltaMicro: -input.actualMicro,
        heldDeltaMicro: 0n,
        idempotencyKey: `overage:${res.id}`,
        configVersion: input.configVersion ?? res.configVersion,
        source: "usage",
        reservationId: res.id,
        metadata: { overageMicro: input.actualMicro.toString(), late: true },
      });
      await tx
        .update(creditReservations)
        .set({ settledMicro: input.actualMicro })
        .where(eq(creditReservations.id, res.id));
      // La libération avait déjà rendu la part retenue sur le plafond de la clé : tout le coût s'y ajoute.
      await adjustKeySpend(tx, res.apiKeyId, input.actualMicro);
      return {
        entry,
        overageEntry: entry,
        chargedMicro: input.actualMicro,
        replayed: false,
      };
    }

    const cost = minBigint(input.actualMicro, res.amountMicro);
    const overage = input.actualMicro - cost;
    const configVersion = input.configVersion ?? res.configVersion;
    const { entry, ...after } = await appendEntry(tx, acct, {
      organizationId: input.organizationId,
      kind: "settle",
      balanceDeltaMicro: -cost,
      heldDeltaMicro: -res.amountMicro,
      idempotencyKey: `settle:${res.id}`,
      configVersion,
      source: "usage",
      reservationId: res.id,
    });
    let overageEntry: Entry | null = null;
    if (overage > 0n) {
      const out = await appendEntry(tx, after, {
        organizationId: input.organizationId,
        kind: "overage",
        balanceDeltaMicro: -overage,
        heldDeltaMicro: 0n,
        idempotencyKey: `overage:${res.id}`,
        configVersion,
        source: "usage",
        reservationId: res.id,
        metadata: {
          overageMicro: overage.toString(),
          reservedMicro: res.amountMicro.toString(),
        },
      });
      overageEntry = out.entry;
    }
    await tx
      .update(creditReservations)
      .set({
        status: "settled",
        settledMicro: input.actualMicro,
        closedAt: sql`now()`,
      })
      .where(eq(creditReservations.id, res.id));
    await adjustKeySpend(
      tx,
      res.apiKeyId,
      input.actualMicro - (res.keySpendHeld ? res.amountMicro : 0n),
    );
    return {
      entry,
      overageEntry,
      chargedMicro: input.actualMicro,
      replayed: false,
    };
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
    if (res.keySpendHeld)
      await adjustKeySpend(tx, res.apiKeyId, -res.amountMicro);
    return { entry, replayed: false };
  });
}

/** Résultat d'un passage de reprise : réservations libérées, requêtes perdues réglées à l'estimé, anomalies consignées. */
export interface StaleOutcome {
  /** Réservations hors passerelle (WebPilot, Creative…) libérées comme avant. */
  released: number;
  /** Requêtes de la passerelle perdues, réglées à l'estimé (invite seule) et consignées « recovered_in_flight ». */
  recovered: number;
  /** Réservations de la passerelle libérées sans règlement possible : consignées « lost_reservation ». */
  anomalies: number;
}

/** Préfixe de la clé d'idempotence des réservations de la passerelle (`gw:<requestId>`). */
const GATEWAY_KEY_PREFIX = "gw:";

const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

/**
 * Ferme une réservation ouverte et perdue. Passerelle (`gw:…`) : jamais « à zéro sans trace » (audit F-01).
 * - intention en attente avec identifiant d'appel LiteLLM : règle à l'estimé (l'invite, au prix figé de l'intention),
 *   écrit l'événement d'usage « settled_by_recovery » daté de la requête et consigne `recovered_in_flight` ;
 * - sinon (antérieure au journal, agent hébergé) : libère et consigne `lost_reservation`.
 * Ordre des verrous : compte, réservation, puis lignes de l'événement et de l'intention (comme le règlement normal).
 */
async function closeStaleReservation(
  exec: Executor,
  r: { id: string; organizationId: string; idempotencyKey: string },
): Promise<"released" | "recovered" | "anomaly" | "skipped"> {
  if (!r.idempotencyKey.startsWith(GATEWAY_KEY_PREFIX)) {
    const out = await releaseReservation(exec, {
      organizationId: r.organizationId,
      reservationId: r.id,
    });
    return out.replayed ? "skipped" : "released";
  }
  const requestId = r.idempotencyKey.slice(GATEWAY_KEY_PREFIX.length);
  return inTx(exec, async (tx) => {
    await lockAccount(tx, r.organizationId);
    const res = await lockReservation(tx, r.organizationId, r.id);
    if (res.status !== "open") return "skipped";
    const [intent] = await tx
      .select()
      .from(usageIntents)
      .where(eq(usageIntents.requestId, requestId));
    const ageSeconds = Math.round(
      (Date.now() - res.createdAt.getTime()) / 1000,
    );
    if (intent && intent.status === "pending" && intent.litellmCallId) {
      const settled = await settleReservation(tx, {
        organizationId: r.organizationId,
        reservationId: r.id,
        actualMicro: minBigint(intent.recoveryCostMicro, res.amountMicro),
      });
      await insertRecoveryEvent(tx, intent, {
        chargedMicro: settled.chargedMicro,
        reservationId: r.id,
      });
      await tx
        .update(usageIntents)
        .set({ status: "recovered", resolvedAt: sql`now()` })
        .where(
          and(
            eq(usageIntents.requestId, requestId),
            eq(usageIntents.status, "pending"),
          ),
        );
      await recordFinding(tx, {
        dedupeKey: `recovered_in_flight:${requestId}`,
        kind: "recovered_in_flight",
        organizationId: r.organizationId,
        requestId,
        litellmCallId: intent.litellmCallId,
        model: intent.modelPublicId,
        day: intent.createdAt.toISOString().slice(0, 10),
        detail: {
          chargedMicro: settled.chargedMicro.toString(),
          reservedMicro: res.amountMicro.toString(),
          promptEstimate: intent.promptEstimate,
          ageSeconds,
          note: "réglée à l'estimé (invite seule) ; la réconciliation compare à la dépense réelle de l'amont",
        },
      });
      return "recovered";
    }
    await releaseReservation(tx, {
      organizationId: r.organizationId,
      reservationId: r.id,
    });
    const reason = !intent
      ? "no_intent"
      : intent.status !== "pending"
        ? "intent_not_pending"
        : "no_call_id";
    if (intent && intent.status === "pending")
      await tx
        .update(usageIntents)
        .set({ status: "anomaly", resolvedAt: sql`now()` })
        .where(
          and(
            eq(usageIntents.requestId, requestId),
            eq(usageIntents.status, "pending"),
          ),
        );
    await recordFinding(tx, {
      dedupeKey: `lost_reservation:${requestId}`,
      kind: "lost_reservation",
      organizationId: r.organizationId,
      requestId,
      litellmCallId: intent?.litellmCallId ?? null,
      model: intent?.modelPublicId ?? null,
      day: (intent?.createdAt ?? res.createdAt).toISOString().slice(0, 10),
      detail: {
        reason,
        reservedMicro: res.amountMicro.toString(),
        ageSeconds,
        note: "réservation libérée sans règlement : la consommation amont éventuelle n'est pas facturée",
      },
    });
    return "anomaly";
  });
}

type Intent = typeof usageIntents.$inferSelect;

/** Événement d'usage d'une requête perdue, réglée à l'estimé (jamais plus que l'invite) ; daté de la requête. */
async function insertRecoveryEvent(
  tx: Tx,
  intent: Intent,
  settled: { chargedMicro: bigint; reservationId: string | null },
): Promise<void> {
  const house = settled.reservationId === null;
  await tx
    .insert(usageEvents)
    .values({
      requestId: intent.requestId,
      organizationId: intent.organizationId,
      apiKeyId: intent.apiKeyId,
      modelPublicId: intent.modelPublicId,
      endpoint: intent.endpoint,
      configVersion: intent.configVersion,
      status: "aborted",
      httpStatus: 499,
      errorCode: "lost_in_flight",
      stream: intent.stream,
      promptTokens: intent.promptEstimate,
      completionTokens: 0,
      costMicro: house ? 0n : settled.chargedMicro,
      billed: !house,
      valueMicro: house ? intent.recoveryCostMicro : settled.chargedMicro,
      upstreamCostUsdMicro: ceilDiv(intent.recoveryUpstreamCostUsdNano, 1000n),
      upstreamCostUsdNano: intent.recoveryUpstreamCostUsdNano,
      priceInputMicro: intent.priceInputMicro,
      priceOutputMicro: intent.priceOutputMicro,
      priceCacheMicro: intent.priceCacheMicro,
      priceCacheWriteMicro: intent.priceCacheWriteMicro,
      priceWindow: intent.priceWindow,
      usageSource: "settled_by_recovery",
      litellmCallId: intent.litellmCallId,
      fxUsdToCadMicro: intent.fxUsdToCadMicro,
      reservationId: settled.reservationId,
      createdAt: intent.createdAt,
    })
    .onConflictDoNothing({ target: usageEvents.requestId });
}

/**
 * Ferme les réservations ouvertes depuis `olderThan` (requête perdue : plantage entre la réservation et le règlement)
 * SANS jamais les abandonner sans trace (audit F-01) : une requête de la passerelle qui a une intention est réglée à
 * l'estimé (invite seule, événement « settled_by_recovery »), une autre est libérée en laissant une anomalie visible
 * (`reconciliation_findings`). Les organisations « maison », sans réservation, sont reprises par leur intention seule.
 * Rejouable. À appeler périodiquement par le worker. Le seuil DOIT dépasser la durée maximale d'un flux : un règlement
 * tardif est facturé au réel (écriture « overage ») mais une libération trop hâtive prêterait gratuitement le
 * disponible. Le plafond de dépense de la clé est rendu avec la libération.
 */
export async function releaseStaleReservationsDetailed(
  exec: Executor,
  options: { olderThan: Date },
): Promise<StaleOutcome> {
  const stale = await exec
    .select({
      id: creditReservations.id,
      organizationId: creditReservations.organizationId,
      idempotencyKey: creditReservations.idempotencyKey,
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
  const out: StaleOutcome = { released: 0, recovered: 0, anomalies: 0 };
  for (const r of stale) {
    try {
      const result = await closeStaleReservation(exec, r);
      if (result === "released") out.released += 1;
      else if (result === "recovered") out.recovered += 1;
      else if (result === "anomaly") out.anomalies += 1;
    } catch (error) {
      // Réglée entre-temps : rien à libérer.
      if (
        !(error instanceof LedgerError && error.code === "reservation_closed")
      )
        throw error;
    }
  }
  // Organisations « maison » : aucune réservation, seule l'intention garde la trace de l'usage perdu.
  const houseStale = await exec
    .select()
    .from(usageIntents)
    .where(
      and(
        eq(usageIntents.status, "pending"),
        sql`${usageIntents.reservationId} IS NULL`,
        lt(usageIntents.createdAt, options.olderThan),
      ),
    )
    .orderBy(asc(usageIntents.createdAt))
    .limit(500);
  for (const intent of houseStale) {
    const done = await inTx(exec, async (tx) => {
      const claimed = await tx
        .update(usageIntents)
        .set({
          status: intent.litellmCallId ? "recovered" : "anomaly",
          resolvedAt: sql`now()`,
        })
        .where(
          and(
            eq(usageIntents.id, intent.id),
            eq(usageIntents.status, "pending"),
          ),
        )
        .returning({ id: usageIntents.id });
      if (claimed.length === 0) return false;
      if (intent.litellmCallId) {
        await insertRecoveryEvent(tx, intent, {
          chargedMicro: 0n,
          reservationId: null,
        });
        await recordFinding(tx, {
          dedupeKey: `recovered_in_flight:${intent.requestId}`,
          kind: "recovered_in_flight",
          organizationId: intent.organizationId,
          requestId: intent.requestId,
          litellmCallId: intent.litellmCallId,
          model: intent.modelPublicId,
          day: intent.createdAt.toISOString().slice(0, 10),
          detail: { house: true, promptEstimate: intent.promptEstimate },
        });
      } else
        await recordFinding(tx, {
          dedupeKey: `lost_reservation:${intent.requestId}`,
          kind: "lost_reservation",
          organizationId: intent.organizationId,
          requestId: intent.requestId,
          model: intent.modelPublicId,
          day: intent.createdAt.toISOString().slice(0, 10),
          detail: { reason: "no_call_id", house: true },
        });
      return true;
    });
    if (done) {
      if (intent.litellmCallId) out.recovered += 1;
      else out.anomalies += 1;
    }
  }
  return out;
}

/** Comme `releaseStaleReservationsDetailed`, en ne renvoyant que le nombre de réservations ou requêtes fermées. */
export async function releaseStaleReservations(
  exec: Executor,
  options: { olderThan: Date },
): Promise<number> {
  const out = await releaseStaleReservationsDetailed(exec, options);
  return out.released + out.recovered + out.anomalies;
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
          inArray(creditEntries.kind, [
            "settle",
            "overage",
            "refund",
            "dispute",
          ]),
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

/**
 * Expire, pour toutes les organisations ayant un lot échu non encore expiré en entier, les crédits non
 * consommés (voir `expireDue`). À appeler une fois par jour par le worker ; rejouable sans effet. Renvoie
 * le nombre d'organisations touchées et le total expiré.
 */
export async function expireAllDue(
  exec: Executor,
  input: { now: Date; configVersion: string },
): Promise<{ organizations: number; expiredMicro: bigint }> {
  const due = await exec
    .select({ organizationId: creditEntries.organizationId })
    .from(creditEntries)
    .where(
      and(
        eq(creditEntries.kind, "credit"),
        lt(creditEntries.expiresAt, input.now),
        sql`${creditEntries.balanceDeltaMicro} > COALESCE((
          SELECT -SUM(x.balance_delta_micro) FROM credit_entries x
          WHERE x.kind = 'expire' AND x.lot_entry_id = ${creditEntries.id}
        ), 0)`,
      ),
    )
    .groupBy(creditEntries.organizationId)
    .orderBy(asc(creditEntries.organizationId));
  let expiredMicro = 0n;
  let touched = 0;
  for (const row of due) {
    const out = await expireDue(exec, {
      organizationId: row.organizationId,
      now: input.now,
      configVersion: input.configVersion,
    });
    if (out.expiredMicro > 0n) touched += 1;
    expiredMicro += out.expiredMicro;
  }
  return { organizations: touched, expiredMicro };
}
