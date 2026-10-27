import {
  and,
  billingCustomers,
  credit,
  creditEntries,
  creditPurchases,
  type Database,
  debit,
  type Executor,
  eq,
  minBigint,
  organizations,
  recordEventOnce,
  SUBSCRIPTION_STATUSES,
  sql,
  subscriptions,
} from "@nexora/db";
import type { Logger } from "@nexora/log";
import { onVpsCheckoutCompleted, reconcileVpsSubscription } from "@nexora/vps";
import type Stripe from "stripe";
import { type BillingConfig, configVersion } from "../ledger/config";
import {
  addMonths,
  centsToMicro,
  creditsToDebitForRefund,
} from "../ledger/money";
import {
  type ChargePayload,
  chargeSchema,
  checkoutSessionSchema,
  disputeSchema,
  idOf,
  invoiceSchema,
  subscriptionIdOfInvoice,
  subscriptionSchema,
} from "../stripe/payloads";
import {
  type PlanSource,
  planConfigVersion,
  type SubscriptionPlan,
} from "./plans";
import {
  applySubscriptionEvent,
  type SubEvent,
  type SubState,
} from "./subscription-state";

export interface WebhookDeps {
  db: Database;
  plans: PlanSource;
  config: BillingConfig;
  log: Logger;
}

export interface WebhookOutcome {
  status: "processed" | "duplicate" | "ignored";
  type: string;
}

/** Types d'événements gérés ; les autres sont ignorés sans être enregistrés. */
export const HANDLED_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "invoice.paid",
  "invoice.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
] as const;
const HANDLED = new Set<string>(HANDLED_EVENT_TYPES);

type HandlerResult = "processed" | "ignored";
interface Ctx {
  tx: Executor;
  deps: WebhookDeps;
  /** Instant de l'événement chez Stripe : les délais (grâce, échéances) en dépendent, pas de l'horloge locale. */
  at: Date;
  created: number;
  /** Identifiant de l'événement Stripe : sert de clé aux tâches VPS qu'il déclenche. */
  eventId: string;
  cfgVersion: string;
}

/**
 * Traite un événement Stripe VÉRIFIÉ (signature contrôlée par l'appelant). Un événement n'a d'effet
 * qu'une fois : l'enregistrement dans `processed_events` et tous les effets (grand livre,
 * abonnements) sont dans une seule transaction. Si le traitement échoue, rien n'est enregistré et
 * Stripe renvoie l'événement.
 */
export async function processStripeEvent(
  deps: WebhookDeps,
  event: Stripe.Event,
): Promise<WebhookOutcome> {
  if (!HANDLED.has(event.type)) return { status: "ignored", type: event.type };
  return deps.db.transaction(async (tx) => {
    const first = await recordEventOnce(tx, "stripe", event.id);
    if (!first) return { status: "duplicate" as const, type: event.type };
    const ctx: Ctx = {
      tx,
      deps,
      at: new Date(event.created * 1000),
      created: event.created,
      eventId: event.id,
      cfgVersion: configVersion(deps.config),
    };
    const result = await dispatch(ctx, event);
    if (result === "ignored")
      deps.log.warn("stripe : événement sans effet", {
        type: event.type,
        eventId: event.id,
      });
    return { status: result, type: event.type };
  });
}

async function dispatch(ctx: Ctx, event: Stripe.Event): Promise<HandlerResult> {
  const object = event.data.object as unknown;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return onCheckoutSession(ctx, checkoutSessionSchema.parse(object));
    case "invoice.paid":
      return onInvoice(ctx, invoiceSchema.parse(object), "invoice_paid");
    case "invoice.payment_failed":
      return onInvoice(
        ctx,
        invoiceSchema.parse(object),
        "invoice_payment_failed",
      );
    case "charge.refunded":
      return onChargeRefunded(ctx, chargeSchema.parse(object));
    case "charge.dispute.created":
      return onDisputeCreated(ctx, disputeSchema.parse(object));
    case "charge.dispute.closed":
      return onDisputeClosed(ctx, disputeSchema.parse(object));
    case "customer.subscription.created":
    case "customer.subscription.updated":
      return onSubscription(
        ctx,
        subscriptionSchema.parse(object),
        "subscription_updated",
      );
    case "customer.subscription.deleted":
      return onSubscription(
        ctx,
        subscriptionSchema.parse(object),
        "subscription_deleted",
      );
    default:
      return "ignored";
  }
}

// ---------------------------------------------------------------------------------------------
// Organisation et client Stripe
// ---------------------------------------------------------------------------------------------

async function orgExists(tx: Executor, orgId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  return Boolean(row);
}

async function linkCustomer(tx: Executor, orgId: string, customerId: string) {
  await tx
    .insert(billingCustomers)
    .values({ organizationId: orgId, stripeCustomerId: customerId })
    .onConflictDoNothing();
}

/** Organisation d'un client Stripe : lien enregistré d'abord, métadonnée de repli (puis lien créé). */
async function resolveOrg(
  tx: Executor,
  customerId: string | null,
  metadataOrg: string | null | undefined,
): Promise<string | null> {
  if (customerId) {
    const [row] = await tx
      .select({ orgId: billingCustomers.organizationId })
      .from(billingCustomers)
      .where(eq(billingCustomers.stripeCustomerId, customerId));
    if (row) return row.orgId;
  }
  if (metadataOrg && (await orgExists(tx, metadataOrg))) {
    if (customerId) await linkCustomer(tx, metadataOrg, customerId);
    return metadataOrg;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Achat de crédits
// ---------------------------------------------------------------------------------------------

async function onCheckoutSession(
  ctx: Ctx,
  session: ReturnType<typeof checkoutSessionSchema.parse>,
): Promise<HandlerResult> {
  const { tx, deps } = ctx;
  const orgId = session.client_reference_id ?? session.metadata.organization_id;
  if (!orgId || !(await orgExists(tx, orgId))) return "ignored";
  const customerId = session.customer ? idOf(session.customer) : null;

  if (session.mode === "subscription") {
    if (customerId) await linkCustomer(tx, orgId, customerId);
    const subId = session.subscription ? idOf(session.subscription) : null;
    if (!subId || !customerId) return "ignored";
    await tx
      .insert(subscriptions)
      .values({
        organizationId: orgId,
        stripeSubscriptionId: subId,
        stripeCustomerId: customerId,
        planCode: session.metadata.plan_code ?? null,
        status: "incomplete",
        lastEventCreated: 0,
      })
      .onConflictDoNothing();
    // VPS (S6) : la commande est reliée à la session et à l'abonnement ; le provisionnement attend
    // le paiement confirmé (`invoice.paid`), jamais la seule fin de la session.
    if (session.metadata.kind === "vps" && session.metadata.vps_order_id)
      await onVpsCheckoutCompleted(tx, {
        orderId: session.metadata.vps_order_id,
        organizationId: orgId,
        sessionId: session.id,
        subscriptionId: subId,
      });
    return "processed";
  }

  if (session.mode !== "payment" || session.metadata.kind !== "credits")
    return "ignored";
  // Paiement différé (virement, prélèvement) : les crédits arrivent à `async_payment_succeeded`.
  if (session.payment_status !== "paid") return "processed";
  if (session.currency !== deps.config.currency) return "ignored";
  const subtotal = session.amount_subtotal;
  const total = session.amount_total;
  if (!subtotal || subtotal <= 0 || !total || total <= 0) return "ignored";

  if (customerId) await linkCustomer(tx, orgId, customerId);
  const creditsMicro = centsToMicro(subtotal);
  const paymentIntent = session.payment_intent
    ? idOf(session.payment_intent)
    : null;

  await tx
    .insert(creditPurchases)
    .values({
      organizationId: orgId,
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: paymentIntent,
      currency: session.currency,
      amountSubtotalCents: subtotal,
      taxCents:
        session.total_details?.amount_tax ?? Math.max(total - subtotal, 0),
      amountTotalCents: total,
      creditsMicro,
      configVersion: ctx.cfgVersion,
    })
    .onConflictDoNothing({ target: creditPurchases.stripeCheckoutSessionId });
  const [purchase] = await tx
    .select()
    .from(creditPurchases)
    .where(eq(creditPurchases.stripeCheckoutSessionId, session.id));
  if (!purchase) throw new Error("achat introuvable après insertion");

  await credit(tx, {
    organizationId: orgId,
    amountMicro: creditsMicro,
    idempotencyKey: `purchase:${session.id}`,
    configVersion: ctx.cfgVersion,
    source: "purchase",
    expiresAt: addMonths(ctx.at, deps.config.creditExpiryMonths),
    externalRef: session.id,
    purchaseId: purchase.id,
  });
  return "processed";
}

// ---------------------------------------------------------------------------------------------
// Remboursements et litiges
// ---------------------------------------------------------------------------------------------

async function purchaseByPaymentIntent(tx: Executor, paymentIntent: string) {
  const [row] = await tx
    .select()
    .from(creditPurchases)
    .where(eq(creditPurchases.stripePaymentIntentId, paymentIntent));
  return row;
}

/** Crédits déjà retirés (remboursements et litiges) pour un achat, nets des litiges gagnés. */
async function netDebitedMicro(
  tx: Executor,
  purchaseId: string,
): Promise<bigint> {
  const [row] = await tx
    .select({
      total: sql<string>`COALESCE(-SUM(${creditEntries.balanceDeltaMicro}), 0)::text`,
    })
    .from(creditEntries)
    .where(
      and(
        eq(creditEntries.purchaseId, purchaseId),
        sql`${creditEntries.source} <> 'purchase'`,
      ),
    );
  return BigInt(row?.total ?? "0");
}

async function onChargeRefunded(
  ctx: Ctx,
  charge: ChargePayload,
): Promise<HandlerResult> {
  const { tx } = ctx;
  if (!charge.payment_intent) return "ignored";
  const purchase = await purchaseByPaymentIntent(
    tx,
    idOf(charge.payment_intent),
  );
  if (!purchase) return "ignored";

  const already = await netDebitedMicro(tx, purchase.id);
  const delta = creditsToDebitForRefund({
    creditsMicro: purchase.creditsMicro,
    amountTotalCents: purchase.amountTotalCents,
    cumulativeRefundedCents: charge.amount_refunded,
    alreadyDebitedMicro: already,
  });
  if (delta > 0n) {
    await debit(tx, {
      organizationId: purchase.organizationId,
      kind: "refund",
      amountMicro: delta,
      idempotencyKey: `refund:${purchase.id}:${charge.amount_refunded}:${delta}`,
      configVersion: ctx.cfgVersion,
      source: "stripe_refund",
      purchaseId: purchase.id,
      externalRef: charge.id,
    });
  }
  const status =
    charge.amount_refunded >= purchase.amountTotalCents
      ? "refunded"
      : "partially_refunded";
  if (purchase.status !== "disputed")
    await tx
      .update(creditPurchases)
      .set({ status })
      .where(eq(creditPurchases.id, purchase.id));
  return "processed";
}

async function onDisputeCreated(
  ctx: Ctx,
  dispute: ReturnType<typeof disputeSchema.parse>,
): Promise<HandlerResult> {
  const { tx } = ctx;
  if (!dispute.payment_intent) return "ignored";
  const purchase = await purchaseByPaymentIntent(
    tx,
    idOf(dispute.payment_intent),
  );
  if (!purchase) return "ignored";

  const already = await netDebitedMicro(tx, purchase.id);
  const wanted = creditsToDebitForRefund({
    creditsMicro: purchase.creditsMicro,
    amountTotalCents: purchase.amountTotalCents,
    cumulativeRefundedCents: dispute.amount,
    alreadyDebitedMicro: 0n,
  });
  const room = purchase.creditsMicro - already;
  const amount = minBigint(wanted, room);
  if (amount > 0n) {
    await debit(tx, {
      organizationId: purchase.organizationId,
      kind: "dispute",
      amountMicro: amount,
      idempotencyKey: `dispute:${dispute.id}`,
      configVersion: ctx.cfgVersion,
      source: "stripe_dispute",
      purchaseId: purchase.id,
      externalRef: dispute.id,
    });
  }
  await tx
    .update(creditPurchases)
    .set({ status: "disputed" })
    .where(eq(creditPurchases.id, purchase.id));
  return "processed";
}

async function onDisputeClosed(
  ctx: Ctx,
  dispute: ReturnType<typeof disputeSchema.parse>,
): Promise<HandlerResult> {
  const { tx, deps } = ctx;
  if (dispute.status !== "won" || !dispute.payment_intent) return "processed";
  const purchase = await purchaseByPaymentIntent(
    tx,
    idOf(dispute.payment_intent),
  );
  if (!purchase) return "ignored";
  const [withdrawn] = await tx
    .select()
    .from(creditEntries)
    .where(eq(creditEntries.idempotencyKey, `dispute:${dispute.id}`));
  if (!withdrawn) return "processed"; // rien n'avait été retiré
  const [lot] = await tx
    .select({ expiresAt: creditEntries.expiresAt })
    .from(creditEntries)
    .where(
      and(
        eq(creditEntries.purchaseId, purchase.id),
        eq(creditEntries.source, "purchase"),
      ),
    );
  await credit(tx, {
    organizationId: purchase.organizationId,
    amountMicro: -withdrawn.balanceDeltaMicro,
    idempotencyKey: `dispute-won:${dispute.id}`,
    configVersion: ctx.cfgVersion,
    source: "dispute_reversal",
    // Les crédits rendus gardent l'échéance de l'achat d'origine.
    expiresAt:
      lot?.expiresAt ?? addMonths(ctx.at, deps.config.creditExpiryMonths),
    purchaseId: purchase.id,
    externalRef: dispute.id,
  });
  const stillOut = await netDebitedMicro(tx, purchase.id);
  await tx
    .update(creditPurchases)
    .set({ status: stillOut > 0n ? "partially_refunded" : "paid" })
    .where(eq(creditPurchases.id, purchase.id));
  return "processed";
}

// ---------------------------------------------------------------------------------------------
// Abonnements
// ---------------------------------------------------------------------------------------------

interface SubUpdate {
  stripeSubscriptionId: string;
  customerId: string;
  orgId: string;
  event: SubEvent;
  planCode?: string | null;
  priceId?: string | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  configVersion?: string | null;
  /** Commande VPS portée par la métadonnée de l'abonnement (S6). */
  vpsOrderId?: string | null;
}

/** Verrouille (ou crée) la ligne d'abonnement, applique la machine à états et enregistre le résultat. */
async function updateSubscription(ctx: Ctx, u: SubUpdate): Promise<SubState> {
  const { tx, deps } = ctx;
  await tx
    .insert(subscriptions)
    .values({
      organizationId: u.orgId,
      stripeSubscriptionId: u.stripeSubscriptionId,
      stripeCustomerId: u.customerId,
      status: "incomplete",
      lastEventCreated: 0,
    })
    .onConflictDoNothing({ target: subscriptions.stripeSubscriptionId });
  const [row] = await tx
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, u.stripeSubscriptionId))
    .for("update");
  if (!row) throw new Error("abonnement introuvable après insertion");

  const current: SubState = {
    status: row.status,
    graceEndsAt: row.graceEndsAt,
    canceledAt: row.canceledAt,
    lastEventCreated: row.lastEventCreated,
  };
  const next = applySubscriptionEvent(current, u.event, {
    graceDays: deps.config.graceDays,
    now: ctx.at,
  });
  // Événement en retard : la machine renvoie l'état tel quel, on n'écrase aucun autre champ.
  const stale = u.event.created < row.lastEventCreated;
  await tx
    .update(subscriptions)
    .set({
      status: next.status,
      graceEndsAt: next.graceEndsAt,
      canceledAt: next.canceledAt,
      lastEventCreated: next.lastEventCreated,
      ...(stale
        ? {}
        : {
            planCode: u.planCode ?? row.planCode,
            stripePriceId: u.priceId ?? row.stripePriceId,
            currentPeriodStart: u.periodStart ?? row.currentPeriodStart,
            currentPeriodEnd: u.periodEnd ?? row.currentPeriodEnd,
            cancelAtPeriodEnd: u.cancelAtPeriodEnd ?? row.cancelAtPeriodEnd,
            configVersion: u.configVersion ?? row.configVersion,
          }),
      updatedAt: sql`now()`,
    })
    .where(eq(subscriptions.id, row.id));
  // VPS (S6) : provisionne, suspend, reprend ou résilie selon le nouvel état (même transaction).
  await reconcileVpsSubscription(tx, {
    stripeSubscriptionId: u.stripeSubscriptionId,
    organizationId: u.orgId,
    linkOrderId: u.vpsOrderId,
    state: { status: next.status, graceEndsAt: next.graceEndsAt },
    eventId: ctx.eventId,
    now: ctx.at,
  });
  return next;
}

async function findPlan(
  deps: WebhookDeps,
  code: string | null | undefined,
  priceId: string | null | undefined,
): Promise<SubscriptionPlan | null> {
  if (code) {
    const byCode = await deps.plans.getByCode(code);
    if (byCode) return byCode;
  }
  if (priceId) return deps.plans.getByPriceId(priceId);
  return null;
}

const GRANTING_REASONS = new Set(["subscription_create", "subscription_cycle"]);

async function onInvoice(
  ctx: Ctx,
  invoice: ReturnType<typeof invoiceSchema.parse>,
  type: "invoice_paid" | "invoice_payment_failed",
): Promise<HandlerResult> {
  const { tx, deps } = ctx;
  const subId = subscriptionIdOfInvoice(invoice);
  if (!subId) return "ignored"; // facture d'un achat de crédits ou facture manuelle
  const customerId = invoice.customer ? idOf(invoice.customer) : null;
  const meta = invoice.parent?.subscription_details?.metadata ?? {};
  const orgId = await resolveOrg(tx, customerId, meta.organization_id);
  if (!orgId || !customerId) return "ignored";

  const line = invoice.lines?.data[0];
  const priceId = line?.pricing?.price_details?.price ?? null;
  const period = line?.period ?? null;
  const isVps = meta.kind === "vps";
  // Un abonnement VPS n'est pas un plan Directus : pas de recherche de plan ni de crédits inclus.
  const plan = isVps ? null : await findPlan(deps, meta.plan_code, priceId);

  await updateSubscription(ctx, {
    stripeSubscriptionId: subId,
    customerId,
    orgId,
    event: { type, created: ctx.created },
    planCode: plan?.code ?? meta.plan_code ?? null,
    priceId,
    periodStart: period ? new Date(period.start * 1000) : null,
    periodEnd: period ? new Date(period.end * 1000) : null,
    configVersion: plan ? planConfigVersion(plan) : null,
    vpsOrderId: isVps ? (meta.vps_order_id ?? null) : null,
  });

  if (
    !isVps &&
    type === "invoice_paid" &&
    invoice.billing_reason &&
    GRANTING_REASONS.has(invoice.billing_reason)
  ) {
    if (!plan) {
      deps.log.error("stripe : plan introuvable, crédits inclus non accordés", {
        invoiceId: invoice.id,
        planCode: meta.plan_code ?? null,
      });
    } else if (plan.includedCreditsCents > 0) {
      await credit(tx, {
        organizationId: orgId,
        amountMicro: centsToMicro(plan.includedCreditsCents),
        idempotencyKey: `sub-credit:${invoice.id}`,
        configVersion: planConfigVersion(plan),
        source: "subscription",
        // Crédits offerts : valables jusqu'à la fin de la période payée.
        expiresAt: period ? new Date(period.end * 1000) : addMonths(ctx.at, 1),
        externalRef: invoice.id,
      });
    }
  }
  return "processed";
}

async function onSubscription(
  ctx: Ctx,
  sub: ReturnType<typeof subscriptionSchema.parse>,
  type: "subscription_updated" | "subscription_deleted",
): Promise<HandlerResult> {
  const { tx, deps } = ctx;
  if (!(SUBSCRIPTION_STATUSES as readonly string[]).includes(sub.status)) {
    deps.log.warn("stripe : statut d'abonnement inconnu", {
      status: sub.status,
    });
    return "ignored";
  }
  const customerId = idOf(sub.customer);
  const orgId = await resolveOrg(tx, customerId, sub.metadata.organization_id);
  if (!orgId) return "ignored";

  const item = sub.items?.data[0];
  const priceId = item?.price?.id ?? null;
  const isVps = sub.metadata.kind === "vps";
  let planCode: string | null = sub.metadata.plan_code ?? null;
  let cfg: string | null = null;
  if (!isVps && !planCode && priceId) {
    try {
      const plan = await deps.plans.getByPriceId(priceId);
      planCode = plan?.code ?? null;
      cfg = plan ? planConfigVersion(plan) : null;
    } catch {
      // Directus indisponible : le code du plan sera renseigné par un prochain événement.
    }
  }
  await updateSubscription(ctx, {
    stripeSubscriptionId: sub.id,
    customerId,
    orgId,
    event:
      type === "subscription_deleted"
        ? { type, created: ctx.created }
        : { type, created: ctx.created, stripeStatus: sub.status },
    planCode,
    priceId,
    periodStart: item?.current_period_start
      ? new Date(item.current_period_start * 1000)
      : null,
    periodEnd: item?.current_period_end
      ? new Date(item.current_period_end * 1000)
      : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    configVersion: cfg,
    vpsOrderId: isVps ? (sub.metadata.vps_order_id ?? null) : null,
  });
  return "processed";
}
