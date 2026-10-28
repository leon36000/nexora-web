import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
import type { Database } from "./client.ts";
import { credit, type Executor } from "./ledger.ts";
import {
  subscriptionCreditGrants,
  subscriptionCreditTranches,
  subscriptions,
} from "./schema.ts";

/**
 * Crédits inclus d'une offre ANNUELLE, versés mois par mois (décision du fondateur déléguée, 28/10/2026) : un douzième
 * chaque mois, chacun valable le mois en cours. Verser les 12 mois d'un coup exposait Nexora à un coût d'inférence payé
 * d'avance sur toute l'année (annulation, litige, remboursement) ; en douzièmes, ce qui n'est pas encore versé se retire
 * sans toucher au solde du client.
 *
 * - Une facture annuelle payée crée la ligne `subscription_credit_grants` (source des remboursements et litiges,
 *   `credits_micro` = total de l'année) et douze `subscription_credit_tranches` ; la première est versée tout de suite.
 * - La tâche `ledger.grant-tranches` du worker verse chaque tranche à son échéance (début de chaque mois à partir du début
 *   de la période payée). Un abonnement terminé n'en reçoit plus ; un abonnement impayé ou en pause attend.
 * - Remboursement : on retire d'abord ce qui n'est pas encore versé (de la fin vers le début), le reste est débité du
 *   grand livre. Litige ouvert : les tranches à venir sont suspendues ; gagné, elles reprennent ; perdu, elles sont
 *   retirées à hauteur du montant contesté non encore repris.
 * - Une tranche versée en retard (arrêt du worker) vaut 7 jours au moins au lieu d'expirer à son arrivée.
 */
export const TRANCHES_PER_YEAR = 12;
/** Validité minimale d'une tranche versée après la fin du mois qu'elle couvre. */
export const LATE_TRANCHE_VALID_DAYS = 7;

export type Tranche = typeof subscriptionCreditTranches.$inferSelect;

/** Ajoute des mois civils en UTC ; le 31 janvier + 1 mois donne le dernier jour de février. */
export function addMonthsUtc(date: Date, months: number): Date {
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

/** Partage un total en `parts` montants entiers dont la somme est exacte : le reste va aux premiers mois. */
export function splitCredits(
  total: bigint,
  parts = TRANCHES_PER_YEAR,
): bigint[] {
  if (total <= 0n) throw new RangeError("total positif attendu");
  const count = BigInt(parts);
  const base = total / count;
  const remainder = Number(total % count);
  return Array.from(
    { length: parts },
    (_, i) => base + (i < remainder ? 1n : 0n),
  );
}

/**
 * Crée les douze tranches d'une facture annuelle payée (idempotent). `periodStart` : début de la période payée.
 * Aucun versement ici (voir `grantTranche`).
 */
export async function createAnnualTranches(
  tx: Executor,
  input: {
    grantId: string;
    organizationId: string;
    stripeInvoiceId: string;
    stripeSubscriptionId: string | null;
    totalMicro: bigint;
    periodStart: Date;
  },
): Promise<void> {
  const parts = splitCredits(input.totalMicro);
  await tx
    .insert(subscriptionCreditTranches)
    .values(
      parts.map((amount, seq) => ({
        grantId: input.grantId,
        organizationId: input.organizationId,
        stripeInvoiceId: input.stripeInvoiceId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        seq,
        dueAt: addMonthsUtc(input.periodStart, seq),
        expiresAt: addMonthsUtc(input.periodStart, seq + 1),
        originalMicro: amount,
        amountMicro: amount,
      })),
    )
    .onConflictDoNothing({
      target: [
        subscriptionCreditTranches.grantId,
        subscriptionCreditTranches.seq,
      ],
    });
}

/** Clé d'idempotence de l'écriture du grand livre d'une tranche. */
export const trancheKey = (invoiceId: string, seq: number): string =>
  `sub-credit:${invoiceId}:m${seq}`;

/**
 * Verse une tranche `pending` : écriture de crédit idempotente puis statut `granted`. L'appelant a verrouillé la ligne.
 * Une tranche entièrement retirée est annulée sans écriture.
 */
export async function grantTranche(
  tx: Executor,
  tranche: Tranche,
  input: { configVersion: string; now: Date },
): Promise<"granted" | "canceled"> {
  if (tranche.amountMicro <= 0n) {
    await tx
      .update(subscriptionCreditTranches)
      .set({
        status: "canceled",
        canceledAt: input.now,
        cancelReason: "refunded",
      })
      .where(eq(subscriptionCreditTranches.id, tranche.id));
    return "canceled";
  }
  const floor = new Date(
    input.now.getTime() + LATE_TRANCHE_VALID_DAYS * 86_400_000,
  );
  const expiresAt = tranche.expiresAt > input.now ? tranche.expiresAt : floor;
  await credit(tx, {
    organizationId: tranche.organizationId,
    amountMicro: tranche.amountMicro,
    idempotencyKey: trancheKey(tranche.stripeInvoiceId, tranche.seq),
    configVersion: input.configVersion,
    source: "subscription",
    expiresAt,
    externalRef: tranche.stripeInvoiceId,
    purchaseId: tranche.grantId,
    metadata: { tranche: tranche.seq },
  });
  await tx
    .update(subscriptionCreditTranches)
    .set({ status: "granted", grantedAt: input.now })
    .where(eq(subscriptionCreditTranches.id, tranche.id));
  return "granted";
}

/** Verse tout de suite la tranche 0 (au moment du paiement de la facture), si elle est échue. */
export async function grantFirstTranche(
  tx: Executor,
  input: { grantId: string; configVersion: string; now: Date },
): Promise<void> {
  const [first] = await tx
    .select()
    .from(subscriptionCreditTranches)
    .where(
      and(
        eq(subscriptionCreditTranches.grantId, input.grantId),
        eq(subscriptionCreditTranches.seq, 0),
        eq(subscriptionCreditTranches.status, "pending"),
      ),
    )
    .for("update");
  if (first) await grantTranche(tx, first, input);
}

const ENDED = new Set(["canceled", "incomplete_expired"]);
const WAITING = new Set(["unpaid", "paused", "incomplete"]);

export interface GrantDueResult {
  granted: number;
  canceled: number;
  /** Tranches échues d'un abonnement impayé ou en pause : reprises à la prochaine exécution. */
  waiting: number;
}

/**
 * Tâche du worker : verse les tranches échues. Idempotent et sans conflit entre deux workers (`SKIP LOCKED`). Une
 * tranche d'un abonnement terminé est annulée (la période payée est allée à son terme ou l'abonnement a pris fin).
 */
export async function grantDueTranches(
  db: Database,
  input: { now: Date; batch?: number },
): Promise<GrantDueResult> {
  const result: GrantDueResult = { granted: 0, canceled: 0, waiting: 0 };
  const batch = input.batch ?? 200;
  for (;;) {
    const handled = await db.transaction(async (tx) => {
      const due = await tx
        .select({
          tranche: subscriptionCreditTranches,
          configVersion: subscriptionCreditGrants.configVersion,
          status: subscriptions.status,
        })
        .from(subscriptionCreditTranches)
        .innerJoin(
          subscriptionCreditGrants,
          eq(subscriptionCreditGrants.id, subscriptionCreditTranches.grantId),
        )
        .leftJoin(
          subscriptions,
          eq(
            subscriptions.stripeSubscriptionId,
            subscriptionCreditTranches.stripeSubscriptionId,
          ),
        )
        .where(
          and(
            eq(subscriptionCreditTranches.status, "pending"),
            lte(subscriptionCreditTranches.dueAt, input.now),
          ),
        )
        .orderBy(asc(subscriptionCreditTranches.dueAt))
        .limit(batch)
        .for("update", {
          of: subscriptionCreditTranches,
          skipLocked: true,
        });
      let progressed = 0;
      for (const row of due) {
        if (row.status && ENDED.has(row.status)) {
          await tx
            .update(subscriptionCreditTranches)
            .set({
              status: "canceled",
              canceledAt: input.now,
              cancelReason: "subscription_ended",
            })
            .where(eq(subscriptionCreditTranches.id, row.tranche.id));
          result.canceled += 1;
          progressed += 1;
        } else if (row.status && WAITING.has(row.status)) {
          result.waiting += 1;
        } else {
          const outcome = await grantTranche(tx, row.tranche, {
            configVersion: row.configVersion,
            now: input.now,
          });
          result[outcome] += 1;
          progressed += 1;
        }
      }
      return progressed;
    });
    // Lot incomplet, ou rien de traité (tout attend) : terminé.
    if (handled < batch) break;
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// Remboursements et litiges
// ---------------------------------------------------------------------------------------------

/** Total déjà retiré des tranches par des remboursements (en plus des débits du grand livre). */
export async function reducedMicro(
  tx: Executor,
  grantId: string,
): Promise<bigint> {
  const [row] = await tx
    .select({
      total: sql<string>`COALESCE(SUM(${subscriptionCreditTranches.reducedMicro}), 0)::text`,
    })
    .from(subscriptionCreditTranches)
    .where(eq(subscriptionCreditTranches.grantId, grantId));
  return BigInt(row?.total ?? "0");
}

/** Crédits déjà versés au grand livre pour cette source. */
export async function grantedMicro(
  tx: Executor,
  grantId: string,
): Promise<bigint> {
  const [row] = await tx
    .select({
      total: sql<string>`COALESCE(SUM(${subscriptionCreditTranches.originalMicro} - ${subscriptionCreditTranches.reducedMicro}), 0)::text`,
    })
    .from(subscriptionCreditTranches)
    .where(
      and(
        eq(subscriptionCreditTranches.grantId, grantId),
        eq(subscriptionCreditTranches.status, "granted"),
      ),
    );
  return BigInt(row?.total ?? "0");
}

/** La source a-t-elle des tranches (offre annuelle versée par douzièmes) ? */
export async function hasTranches(
  tx: Executor,
  grantId: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: subscriptionCreditTranches.id })
    .from(subscriptionCreditTranches)
    .where(eq(subscriptionCreditTranches.grantId, grantId))
    .limit(1);
  return Boolean(row);
}

/**
 * Retire jusqu'à `amount` des tranches pas encore versées (statuts `pending` et `held`), de la dernière à la première.
 * Une tranche vidée est annulée. Renvoie le montant réellement retiré.
 */
export async function reduceUnpaidTranches(
  tx: Executor,
  grantId: string,
  amount: bigint,
  now: Date,
): Promise<bigint> {
  if (amount <= 0n) return 0n;
  const rows = await tx
    .select()
    .from(subscriptionCreditTranches)
    .where(
      and(
        eq(subscriptionCreditTranches.grantId, grantId),
        sql`${subscriptionCreditTranches.status} IN ('pending', 'held')`,
      ),
    )
    .orderBy(desc(subscriptionCreditTranches.seq))
    .for("update");
  let left = amount;
  for (const row of rows) {
    if (left <= 0n) break;
    const take = row.amountMicro < left ? row.amountMicro : left;
    if (take <= 0n) continue;
    const remaining = row.amountMicro - take;
    await tx
      .update(subscriptionCreditTranches)
      .set({
        amountMicro: remaining,
        reducedMicro: row.reducedMicro + take,
        ...(remaining === 0n
          ? { status: "canceled", canceledAt: now, cancelReason: "refunded" }
          : {}),
      })
      .where(eq(subscriptionCreditTranches.id, row.id));
    left -= take;
  }
  return amount - left;
}

/** Suspend les tranches à venir pendant un litige ouvert. */
export async function holdPendingTranches(
  tx: Executor,
  grantId: string,
  disputeId: string,
): Promise<number> {
  const rows = await tx
    .update(subscriptionCreditTranches)
    .set({ status: "held", holdRef: disputeId })
    .where(
      and(
        eq(subscriptionCreditTranches.grantId, grantId),
        eq(subscriptionCreditTranches.status, "pending"),
      ),
    )
    .returning({ id: subscriptionCreditTranches.id });
  return rows.length;
}

/** Litige gagné : les tranches suspendues reprennent leur cours (versées à la prochaine exécution si échues). */
export async function releaseHeldTranches(
  tx: Executor,
  disputeId: string,
): Promise<number> {
  const rows = await tx
    .update(subscriptionCreditTranches)
    .set({ status: "pending", holdRef: null })
    .where(
      and(
        eq(subscriptionCreditTranches.holdRef, disputeId),
        eq(subscriptionCreditTranches.status, "held"),
      ),
    )
    .returning({ id: subscriptionCreditTranches.id });
  return rows.length;
}

/**
 * Litige perdu : retire des tranches suspendues le montant contesté que le grand livre n'a pas pu reprendre
 * (`outstanding`), de la dernière à la première, puis remet le reste en cours.
 */
export async function settleLostDispute(
  tx: Executor,
  grantId: string,
  disputeId: string,
  outstanding: bigint,
  now: Date,
): Promise<bigint> {
  const reduced = await reduceUnpaidTranches(tx, grantId, outstanding, now);
  await releaseHeldTranches(tx, disputeId);
  return reduced;
}
