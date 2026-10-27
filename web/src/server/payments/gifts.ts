import { randomUUID } from "node:crypto";
import {
  and,
  credit,
  type Database,
  debit,
  desc,
  type Executor,
  eq,
  type GiftKind,
  getAccount,
  giftGrants,
  gte,
  lt,
  promoRedemptions,
  sql,
  staffAccounts,
  subscriptions,
  users,
} from "@nexora/db";
import {
  type CreateOrderInput,
  createOrder,
  reconcileVpsSubscription,
} from "@nexora/vps";
import { type BillingConfig, configVersion } from "../ledger/config";
import { addMonths, centsToMicro } from "../ledger/money";
import { auditPayment } from "./settings";

export type GiftErrorCode =
  | "not_found"
  | "not_staff"
  | "already_gifted"
  | "cap_reached"
  | "invalid_amount";

export class GiftError extends Error {
  readonly code: GiftErrorCode;
  readonly remainingCents?: number;
  constructor(code: GiftErrorCode, message: string, remainingCents?: number) {
    super(message);
    this.name = "GiftError";
    this.code = code;
    this.remainingCents = remainingCents;
  }
}

export type GiftRow = typeof giftGrants.$inferSelect;

const GIFT_PREFIX = "gift_";
export const isGiftSubscriptionRef = (ref: string): boolean =>
  ref.startsWith(GIFT_PREFIX);

/** Pose ou retire le drapeau « personnel » d'un compte client. Journalisé. */
export async function setStaffFlag(
  db: Database,
  input: { userId: string; on: boolean; actor: string; note?: string },
): Promise<void> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, input.userId));
  if (!user) throw new GiftError("not_found", "Compte introuvable.");
  if (input.on)
    await db
      .insert(staffAccounts)
      .values({
        userId: input.userId,
        grantedBy: input.actor,
        note: input.note ?? "",
      })
      .onConflictDoUpdate({
        target: staffAccounts.userId,
        set: {
          revokedAt: null,
          grantedBy: input.actor,
          note: input.note ?? "",
        },
      });
  else
    await db
      .update(staffAccounts)
      .set({ revokedAt: new Date() })
      .where(eq(staffAccounts.userId, input.userId));
  await auditPayment(db, {
    actor: input.actor,
    action: input.on ? "staff.grant" : "staff.revoke",
    subject: input.userId,
  });
}

async function assertStaff(tx: Executor, userId: string): Promise<void> {
  const [row] = await tx
    .select({ revokedAt: staffAccounts.revokedAt })
    .from(staffAccounts)
    .where(eq(staffAccounts.userId, userId));
  if (!row || row.revokedAt)
    throw new GiftError(
      "not_staff",
      "Ce compte n'est pas un compte du personnel.",
    );
}

export interface GiftBase {
  organizationId: string;
  userId: string;
  promoCodeId: string | null;
  now: Date;
  reason?: string;
}

async function recordGiftRedemption(
  tx: Executor,
  base: GiftBase,
  scope: "subscriptions" | "credits" | "vps",
  grantId: string,
) {
  if (!base.promoCodeId) return;
  await tx.insert(promoRedemptions).values({
    promoCodeId: base.promoCodeId,
    organizationId: base.organizationId,
    scope,
    source: "gift",
    stripeSessionId: `gift:${grantId}`,
  });
}

/** Insère la ligne `subscriptions` synthétique d'un abonnement offert et renvoie sa référence. */
async function insertGiftSubscription(
  tx: Executor,
  base: GiftBase,
  planCode: string | null,
): Promise<string> {
  const ref = `${GIFT_PREFIX}${randomUUID()}`;
  await tx.insert(subscriptions).values({
    organizationId: base.organizationId,
    stripeSubscriptionId: ref,
    stripeCustomerId: "gift",
    planCode,
    status: "gifted",
    configVersion: null,
  });
  return ref;
}

/** Abonnement offert : aucun Stripe, accès complet (statut « gifted »), révocable. */
export async function grantGiftSubscription(
  db: Database,
  input: GiftBase & { planCode: string },
): Promise<GiftRow> {
  return db.transaction(async (tx) => {
    await assertStaff(tx, input.userId);
    const [running] = await tx
      .select({ id: giftGrants.id })
      .from(giftGrants)
      .where(
        and(
          eq(giftGrants.organizationId, input.organizationId),
          eq(giftGrants.kind, "subscription"),
          eq(giftGrants.planCode, input.planCode),
          eq(giftGrants.status, "active"),
        ),
      );
    if (running)
      throw new GiftError(
        "already_gifted",
        "Cette organisation a déjà cette offre en cadeau.",
      );
    const grantId = randomUUID();
    const ref = await insertGiftSubscription(tx, input, input.planCode);
    const [grant] = await tx
      .insert(giftGrants)
      .values({
        id: grantId,
        organizationId: input.organizationId,
        userId: input.userId,
        promoCodeId: input.promoCodeId,
        kind: "subscription",
        planCode: input.planCode,
        subscriptionRef: ref,
        reason: input.reason ?? "",
        idempotencyKey: `gift:${grantId}`,
      })
      .returning();
    await recordGiftRedemption(tx, input, "subscriptions", grantId);
    await auditPayment(tx, {
      actor: "staff",
      action: "gift.subscription",
      subject: input.organizationId,
      detail: { plan: input.planCode, grantId },
    });
    return grant as GiftRow;
  });
}

/** VPS offert : commande normale (même provisionnement), reliée à un abonnement offert au lieu de Stripe. */
export async function grantGiftVps(
  db: Database,
  input: GiftBase & {
    order: Omit<
      CreateOrderInput,
      "organizationId" | "userId" | "allowUnsynced"
    >;
  },
): Promise<GiftRow> {
  await assertStaff(db, input.userId);
  const { order } = await createOrder(db, {
    ...input.order,
    organizationId: input.organizationId,
    userId: input.userId,
    allowUnsynced: true,
  });
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(giftGrants)
      .where(eq(giftGrants.vpsOrderId, order.id));
    if (existing) return existing; // rejeu du même formulaire
    const grantId = randomUUID();
    const ref = await insertGiftSubscription(
      tx,
      input,
      `vps-${order.planCode}`,
    );
    const [grant] = await tx
      .insert(giftGrants)
      .values({
        id: grantId,
        organizationId: input.organizationId,
        userId: input.userId,
        promoCodeId: input.promoCodeId,
        kind: "vps",
        planCode: order.planCode,
        subscriptionRef: ref,
        vpsOrderId: order.id,
        reason: input.reason ?? "",
        idempotencyKey: `gift:${grantId}`,
      })
      .returning();
    await recordGiftRedemption(tx, input, "vps", grantId);
    await reconcileVpsSubscription(tx, {
      stripeSubscriptionId: ref,
      organizationId: input.organizationId,
      linkOrderId: order.id,
      state: { status: "gifted", graceEndsAt: null },
      eventId: `gift:${grantId}`,
      now: input.now,
    });
    await auditPayment(tx, {
      actor: "staff",
      action: "gift.vps",
      subject: input.organizationId,
      detail: { plan: order.planCode, orderId: order.id, grantId },
    });
    return grant as GiftRow;
  });
}

const monthStart = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const nextMonthStart = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));

/** Crédits offerts ce mois-ci (UTC) par ce compte du personnel, en cents CAD (dons révoqués exclus). */
export async function monthlyGiftedCents(
  db: Executor,
  userId: string,
  now: Date,
): Promise<number> {
  const [row] = await db
    .select({
      micro: sql<string>`coalesce(sum(${giftGrants.creditsMicro}), 0)::text`,
    })
    .from(giftGrants)
    .where(
      and(
        eq(giftGrants.userId, userId),
        eq(giftGrants.kind, "credits"),
        eq(giftGrants.status, "active"),
        gte(giftGrants.createdAt, monthStart(now)),
        lt(giftGrants.createdAt, nextMonthStart(now)),
      ),
    );
  return Number(BigInt(row?.micro ?? "0") / 10_000n);
}

/**
 * Crédits offerts, plafonnés par mois et par compte du personnel (les appels de modèles coûtent de l'argent
 * réel). Inscrits au grand livre avec leur motif ; le plafond est vérifié sous verrou : deux dons simultanés
 * ne le dépassent pas.
 */
export async function grantGiftCredits(
  db: Database,
  input: GiftBase & {
    amountCents: number;
    capCents: number;
    config: BillingConfig;
  },
): Promise<GiftRow> {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0)
    throw new GiftError("invalid_amount", "Montant invalide.");
  return db.transaction(async (tx) => {
    await assertStaff(tx, input.userId);
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`staff-gift:${input.userId}`}))`,
    );
    const used = await monthlyGiftedCents(tx, input.userId, input.now);
    const remaining = Math.max(input.capCents - used, 0);
    if (input.amountCents > remaining)
      throw new GiftError(
        "cap_reached",
        "Le plafond mensuel de crédits offerts serait dépassé.",
        remaining,
      );
    const grantId = randomUUID();
    const micro = centsToMicro(input.amountCents);
    const [grant] = await tx
      .insert(giftGrants)
      .values({
        id: grantId,
        organizationId: input.organizationId,
        userId: input.userId,
        promoCodeId: input.promoCodeId,
        kind: "credits",
        creditsMicro: micro,
        reason: input.reason ?? "",
        idempotencyKey: `gift:${grantId}`,
        createdAt: input.now,
      })
      .returning();
    await credit(tx, {
      organizationId: input.organizationId,
      amountMicro: micro,
      idempotencyKey: `staff-gift:${grantId}`,
      configVersion: configVersion(input.config),
      source: "staff_gift",
      expiresAt: addMonths(input.now, input.config.creditExpiryMonths),
      externalRef: grantId,
      metadata: { reason: input.reason ?? "", grantId, userId: input.userId },
    });
    await recordGiftRedemption(tx, input, "credits", grantId);
    await auditPayment(tx, {
      actor: "staff",
      action: "gift.credits",
      subject: input.organizationId,
      detail: { cents: input.amountCents, grantId },
    });
    return grant as GiftRow;
  });
}

/** Résilie l'abonnement offert `subscriptionRef` (et les VPS qui en dépendent) ; marque le don révoqué. */
async function cancelGiftTx(
  tx: Executor,
  input: { subscriptionRef: string; actor: string; reason?: string; now: Date },
): Promise<boolean> {
  const [sub] = await tx
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, input.subscriptionRef))
    .for("update");
  if (!sub || !isGiftSubscriptionRef(sub.stripeSubscriptionId)) return false;
  if (sub.status !== "canceled") {
    await tx
      .update(subscriptions)
      .set({
        status: "canceled",
        canceledAt: input.now,
        graceEndsAt: null,
        updatedAt: input.now,
      })
      .where(eq(subscriptions.id, sub.id));
    await reconcileVpsSubscription(tx, {
      stripeSubscriptionId: sub.stripeSubscriptionId,
      organizationId: sub.organizationId,
      state: { status: "canceled", graceEndsAt: null },
      eventId: `gift-revoke:${sub.stripeSubscriptionId}`,
      now: input.now,
    });
  }
  await tx
    .update(giftGrants)
    .set({
      status: "revoked",
      revokedAt: input.now,
      revokedBy: input.actor,
      revokeReason: input.reason ?? null,
    })
    .where(
      and(
        eq(giftGrants.subscriptionRef, input.subscriptionRef),
        eq(giftGrants.status, "active"),
      ),
    );
  await auditPayment(tx, {
    actor: input.actor,
    action: "gift.revoke",
    subject: sub.organizationId,
    detail: { subscriptionRef: input.subscriptionRef },
  });
  return true;
}

/** Résiliation d'un abonnement ou VPS offert (par le client ou l'admin). Faux si la référence n'est pas un don. */
export async function cancelGiftSubscription(
  db: Database,
  input: { subscriptionRef: string; actor: string; reason?: string; now: Date },
): Promise<boolean> {
  if (!isGiftSubscriptionRef(input.subscriptionRef)) return false;
  return db.transaction((tx) => cancelGiftTx(tx, input));
}

/** Révoque un don : abonnement et VPS résiliés, crédits repris dans la limite du solde disponible. Rejouable. */
export async function revokeGift(
  db: Database,
  grantId: string,
  opts: { actor: string; reason?: string; now: Date; config: BillingConfig },
): Promise<GiftRow> {
  return db.transaction(async (tx) => {
    const [grant] = await tx
      .select()
      .from(giftGrants)
      .where(eq(giftGrants.id, grantId))
      .for("update");
    if (!grant) throw new GiftError("not_found", "Don introuvable.");
    if (grant.status === "revoked") return grant;
    if (grant.subscriptionRef) {
      await cancelGiftTx(tx, {
        subscriptionRef: grant.subscriptionRef,
        actor: opts.actor,
        reason: opts.reason,
        now: opts.now,
      });
    } else if (grant.kind === "credits" && grant.creditsMicro) {
      const account = await getAccount(
        tx as unknown as Database,
        grant.organizationId,
      );
      const available =
        account.availableMicro > 0n ? account.availableMicro : 0n;
      const take =
        available < grant.creditsMicro ? available : grant.creditsMicro;
      if (take > 0n)
        await debit(tx, {
          organizationId: grant.organizationId,
          kind: "refund",
          amountMicro: take,
          idempotencyKey: `staff-gift-revoke:${grant.id}`,
          configVersion: configVersion(opts.config),
          source: "staff_gift_revoked",
          externalRef: grant.id,
          metadata: { reason: opts.reason ?? "", grantId: grant.id },
        });
      await tx
        .update(giftGrants)
        .set({
          status: "revoked",
          revokedAt: opts.now,
          revokedBy: opts.actor,
          revokeReason: opts.reason ?? null,
        })
        .where(eq(giftGrants.id, grant.id));
      await auditPayment(tx, {
        actor: opts.actor,
        action: "gift.revoke",
        subject: grant.organizationId,
        detail: { grantId: grant.id, takenMicro: take.toString() },
      });
    }
    const [done] = await tx
      .select()
      .from(giftGrants)
      .where(eq(giftGrants.id, grant.id));
    return done as GiftRow;
  });
}

export async function listGifts(
  db: Database,
  filter: { organizationId?: string; userId?: string; limit?: number },
): Promise<GiftRow[]> {
  return db
    .select()
    .from(giftGrants)
    .where(
      and(
        filter.organizationId
          ? eq(giftGrants.organizationId, filter.organizationId)
          : undefined,
        filter.userId ? eq(giftGrants.userId, filter.userId) : undefined,
      ),
    )
    .orderBy(desc(giftGrants.createdAt))
    .limit(Math.min(filter.limit ?? 100, 500));
}

export type { GiftKind };
