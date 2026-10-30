import {
  and,
  billingCustomers,
  createAnnualTranches,
  credit,
  creditEntries,
  creditPurchases,
  type Database,
  debit,
  desc,
  type Executor,
  eq,
  grantedMicro,
  grantFirstTranche,
  hasTranches,
  holdPendingTranches,
  minBigint,
  or,
  organizations,
  type PromoScope,
  promoCodes,
  promoRedemptions,
  recordEventOnce,
  reducedMicro,
  reduceUnpaidTranches,
  releaseHeldTranches,
  SUBSCRIPTION_STATUSES,
  settleLostDispute,
  sql,
  stripeInvoicePayments,
  subscriptionCreditGrants,
  subscriptions,
} from "@nexora/db";
import type { Logger } from "@nexora/log";
import { onVpsCheckoutCompleted, reconcileVpsSubscription } from "@nexora/vps";
import type Stripe from "stripe";
import {
  type BillingConfig,
  configVersion,
  creditExpiresAt,
} from "../ledger/config";
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
  type InvoicePayload,
  idOf,
  invoicePaymentSchema,
  invoiceSchema,
  subscriptionIdOfInvoice,
  subscriptionSchema,
} from "../stripe/payloads";
import { onVpsSessionExpired } from "../vps/checkout-expired";
import { recordDisputeClosed, recordDisputeOpened } from "./disputes";
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
import { enforceTrialUniqueness, type TrialInspector } from "./trial-guard";

export interface WebhookDeps {
  db: Database;
  plans: PlanSource;
  config: BillingConfig;
  log: Logger;
  /**
   * Retrouve le code de promotion Stripe appliqué à une session quand le client l'a saisi sur la page de
   * Stripe (aucune métadonnée de chez nous). Facultatif et sans effet sur le paiement : un échec est ignoré.
   */
  resolveSessionPromotion?: (sessionId: string) => Promise<string | null>;
  /**
   * Un essai gratuit par carte et par courriel (voir `trial-guard.ts`) : lecture de la carte et du courriel chez Stripe,
   * résiliation d'un essai déjà consommé. Absent : aucun contrôle (essais et développement sans Stripe).
   */
  trials?: TrialInspector;
}

export interface WebhookOutcome {
  status: "processed" | "duplicate" | "ignored";
  type: string;
}

/** Types d'événements gérés ; les autres sont ignorés sans être enregistrés. */
export const HANDLED_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.expired",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice_payment.paid",
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
    case "checkout.session.expired":
      // VPS (S6) : Stripe fait expirer la commande jamais payée (le balayage n'est qu'un filet).
      return onVpsSessionExpired(ctx.tx, checkoutSessionSchema.parse(object));
    case "invoice.paid":
      return onInvoice(ctx, invoiceSchema.parse(object), "invoice_paid");
    case "invoice.payment_failed":
      return onInvoice(
        ctx,
        invoiceSchema.parse(object),
        "invoice_payment_failed",
      );
    case "invoice_payment.paid":
      return onInvoicePayment(ctx, invoicePaymentSchema.parse(object));
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

/** Utilisation d'un code promo par une session payée : une ligne par (code, session), rejouable. */
async function recordPromoRedemption(
  ctx: Ctx,
  session: ReturnType<typeof checkoutSessionSchema.parse>,
  orgId: string,
  scope: PromoScope,
  subscriptionId: string | null,
): Promise<void> {
  const { tx, deps } = ctx;
  const discount = Math.max(session.total_details?.amount_discount ?? 0, 0);
  let promoId: string | null = session.metadata.promo_code_id ?? null;
  if (promoId) {
    const [known] = await tx
      .select({ id: promoCodes.id })
      .from(promoCodes)
      .where(eq(promoCodes.id, promoId));
    if (!known) promoId = null;
  }
  if (!promoId && discount > 0 && deps.resolveSessionPromotion) {
    try {
      const stripePromo = await deps.resolveSessionPromotion(session.id);
      if (stripePromo) {
        const [found] = await tx
          .select({ id: promoCodes.id })
          .from(promoCodes)
          .where(eq(promoCodes.stripePromotionCodeId, stripePromo));
        promoId = found?.id ?? null;
      }
    } catch {
      // Statistique seulement : le paiement ne dépend jamais de cette résolution.
    }
  }
  if (!promoId) return;
  await tx
    .insert(promoRedemptions)
    .values({
      promoCodeId: promoId,
      organizationId: orgId,
      scope,
      source: "stripe",
      stripeSessionId: session.id,
      stripeSubscriptionId: subscriptionId,
      discountCents: discount,
    })
    .onConflictDoNothing();
}

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
    await recordPromoRedemption(
      ctx,
      session,
      orgId,
      session.metadata.kind === "vps" ? "vps" : "subscriptions",
      subId,
    );
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
  // Crédits accordés : le montant avant taxes et avant rabais, net des frais de recharge éventuels (métadonnée
  // posée par notre Checkout) ; jamais plus que le montant payé avant rabais.
  const wanted = Number(session.metadata.credits_cents);
  const creditsCents =
    Number.isSafeInteger(wanted) && wanted > 0
      ? Math.min(wanted, subtotal)
      : subtotal;
  const creditsMicro = centsToMicro(creditsCents);
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
    // Crédits de recharge : sans expiration (creditExpiryMonths = 0), sauf réglage contraire de l'opérateur.
    expiresAt: creditExpiresAt(ctx.at, deps.config),
    externalRef: session.id,
    purchaseId: purchase.id,
  });
  await recordPromoRedemption(ctx, session, orgId, "credits", null);
  return "processed";
}

// ---------------------------------------------------------------------------------------------
// Remboursements et litiges
// ---------------------------------------------------------------------------------------------

/**
 * Ce qu'un paiement a fait entrer au grand livre : un achat de crédits ou les crédits inclus d'une
 * facture d'abonnement (I2). Les débits portent `id` dans `credit_entries.purchase_id`.
 */
interface CreditSource {
  id: string;
  organizationId: string;
  creditsMicro: bigint;
  /** Montant payé, taxes comprises : dénominateur du prorata. */
  paidCents: number;
  /** `source` de l'écriture de crédit d'origine (porte l'échéance du lot). */
  lotSource: "purchase" | "subscription";
  /** Renseigné pour un achat : son statut suit les remboursements et litiges. */
  purchase?: typeof creditPurchases.$inferSelect;
}

/**
 * Retrouve la source d'un paiement. La ligne trouvée est VERROUILLÉE jusqu'à la fin de la
 * transaction : deux événements simultanés sur le même paiement (remboursement partiel puis total)
 * calculent leur débit l'un après l'autre, sans dépasser les crédits accordés.
 */
async function creditSourceFor(
  tx: Executor,
  refs: { paymentIntent: string | null; charge: string | null },
): Promise<CreditSource | null> {
  if (refs.paymentIntent) {
    const [purchase] = await tx
      .select()
      .from(creditPurchases)
      .where(eq(creditPurchases.stripePaymentIntentId, refs.paymentIntent))
      .for("update");
    if (purchase)
      return {
        id: purchase.id,
        organizationId: purchase.organizationId,
        creditsMicro: purchase.creditsMicro,
        paidCents: purchase.amountTotalCents,
        lotSource: "purchase",
        purchase,
      };
  }
  const links = [
    refs.paymentIntent
      ? eq(stripeInvoicePayments.stripePaymentIntentId, refs.paymentIntent)
      : undefined,
    refs.charge
      ? eq(stripeInvoicePayments.stripeChargeId, refs.charge)
      : undefined,
  ].filter((c) => c !== undefined);
  if (links.length === 0) return null;
  const [row] = await tx
    .select({ grant: subscriptionCreditGrants })
    .from(subscriptionCreditGrants)
    .innerJoin(
      stripeInvoicePayments,
      eq(
        stripeInvoicePayments.stripeInvoiceId,
        subscriptionCreditGrants.stripeInvoiceId,
      ),
    )
    .where(or(...links))
    .limit(1)
    .for("update", { of: subscriptionCreditGrants });
  if (!row) return null;
  return {
    id: row.grant.id,
    organizationId: row.grant.organizationId,
    creditsMicro: row.grant.creditsMicro,
    paidCents: row.grant.amountPaidCents,
    lotSource: "subscription",
  };
}

/** Crédits déjà retirés (remboursements et litiges) pour une source, nets des litiges gagnés. */
async function netDebitedMicro(
  tx: Executor,
  sourceId: string,
): Promise<bigint> {
  const [row] = await tx
    .select({
      total: sql<string>`COALESCE(-SUM(${creditEntries.balanceDeltaMicro}), 0)::text`,
    })
    .from(creditEntries)
    .where(
      and(
        eq(creditEntries.purchaseId, sourceId),
        sql`${creditEntries.source} NOT IN ('purchase', 'subscription')`,
      ),
    );
  return BigInt(row?.total ?? "0");
}

/** Fenêtre pendant laquelle un événement dont l'achat est introuvable est « trop tôt » plutôt que « sans objet ». */
const EARLY_EVENT_WINDOW_MS = 15 * 60_000;

/**
 * Événement de remboursement ou de litige dont la source (achat, facture) n'existe pas encore : Stripe n'ordonne pas ses
 * livraisons. Récent, il échoue (500) pour que Stripe le renvoie une fois l'achat enregistré ; sans cela l'événement était
 * marqué traité et les crédits remboursés restaient acquis. Plus ancien, il ne concerne aucun achat de Nexora (ignoré).
 */
class EventBeforePurchaseError extends Error {
  constructor() {
    super("événement reçu avant l'achat qu'il concerne");
    this.name = "EventBeforePurchaseError";
  }
}
const arrivedTooEarly = (ctx: Ctx): boolean =>
  Date.now() - ctx.created * 1000 < EARLY_EVENT_WINDOW_MS;

async function onChargeRefunded(
  ctx: Ctx,
  charge: ChargePayload,
): Promise<HandlerResult> {
  const { tx } = ctx;
  const source = await creditSourceFor(tx, {
    paymentIntent: charge.payment_intent ? idOf(charge.payment_intent) : null,
    charge: charge.id,
  });
  if (!source) {
    if (arrivedTooEarly(ctx)) throw new EventBeforePurchaseError();
    return "ignored";
  }

  const tranched =
    source.lotSource === "subscription" && (await hasTranches(tx, source.id));
  // Offre annuelle : ce qui a déjà été retiré des mois à venir compte comme déjà repris.
  const already =
    (await netDebitedMicro(tx, source.id)) +
    (tranched ? await reducedMicro(tx, source.id) : 0n);
  const delta = creditsToDebitForRefund({
    creditsMicro: source.creditsMicro,
    amountTotalCents: source.paidCents,
    cumulativeRefundedCents: charge.amount_refunded,
    alreadyDebitedMicro: already,
  });
  // On retire d'abord les douzièmes pas encore versés : le solde du client n'est entamé que pour le reste.
  const fromLedger = tranched
    ? delta - (await reduceUnpaidTranches(tx, source.id, delta, ctx.at))
    : delta;
  if (fromLedger > 0n) {
    await debit(tx, {
      organizationId: source.organizationId,
      kind: "refund",
      amountMicro: fromLedger,
      idempotencyKey: `refund:${source.id}:${charge.amount_refunded}:${fromLedger}`,
      configVersion: ctx.cfgVersion,
      source: "stripe_refund",
      purchaseId: source.id,
      externalRef: charge.id,
    });
  }
  const { purchase } = source;
  if (purchase && purchase.status !== "disputed")
    await tx
      .update(creditPurchases)
      .set({
        status:
          charge.amount_refunded >= purchase.amountTotalCents
            ? "refunded"
            : "partially_refunded",
      })
      .where(eq(creditPurchases.id, purchase.id));
  return "processed";
}

async function onDisputeCreated(
  ctx: Ctx,
  dispute: ReturnType<typeof disputeSchema.parse>,
): Promise<HandlerResult> {
  const { tx } = ctx;
  const source = await creditSourceFor(tx, {
    paymentIntent: dispute.payment_intent ? idOf(dispute.payment_intent) : null,
    charge: idOf(dispute.charge),
  });
  if (!source) {
    if (arrivedTooEarly(ctx)) throw new EventBeforePurchaseError();
    return "ignored";
  }

  await recordDisputeOpened(tx, {
    id: dispute.id,
    organizationId: source.organizationId,
    amountCents: dispute.amount,
  });
  const already = await netDebitedMicro(tx, source.id);
  const wanted = creditsToDebitForRefund({
    creditsMicro: source.creditsMicro,
    amountTotalCents: source.paidCents,
    cumulativeRefundedCents: dispute.amount,
    alreadyDebitedMicro: 0n,
  });
  let room = source.creditsMicro - already;
  if (
    source.lotSource === "subscription" &&
    (await hasTranches(tx, source.id))
  ) {
    // Offre annuelle : le grand livre ne reprend que ce qui a été versé ; les mois à venir sont suspendus jusqu'à
    // l'issue du litige (gagné : ils reprennent ; perdu : ils sont retirés à hauteur du montant non repris).
    room = (await grantedMicro(tx, source.id)) - already;
    await holdPendingTranches(tx, source.id, dispute.id);
  }
  const amount = minBigint(wanted, room < 0n ? 0n : room);
  if (amount > 0n) {
    await debit(tx, {
      organizationId: source.organizationId,
      kind: "dispute",
      amountMicro: amount,
      idempotencyKey: `dispute:${dispute.id}`,
      configVersion: ctx.cfgVersion,
      source: "stripe_dispute",
      purchaseId: source.id,
      externalRef: dispute.id,
    });
  }
  if (source.purchase)
    await tx
      .update(creditPurchases)
      .set({ status: "disputed" })
      .where(eq(creditPurchases.id, source.purchase.id));
  return "processed";
}

async function onDisputeClosed(
  ctx: Ctx,
  dispute: ReturnType<typeof disputeSchema.parse>,
): Promise<HandlerResult> {
  const { tx, deps } = ctx;
  const closed = ["won", "lost", "warning_closed"];
  if (!dispute.status || !closed.includes(dispute.status)) return "processed";
  const source = await creditSourceFor(tx, {
    paymentIntent: dispute.payment_intent ? idOf(dispute.payment_intent) : null,
    charge: idOf(dispute.charge),
  });
  if (!source) return "ignored";
  await recordDisputeClosed(tx, {
    id: dispute.id,
    organizationId: source.organizationId,
    amountCents: dispute.amount,
    status: dispute.status === "lost" ? "lost" : "won",
    at: ctx.at,
  });
  const [withdrawn] = await tx
    .select()
    .from(creditEntries)
    .where(eq(creditEntries.idempotencyKey, `dispute:${dispute.id}`));
  // Offre annuelle (douzièmes) : l'issue du litige décide du sort des mois suspendus.
  const tranched =
    source.lotSource === "subscription" && (await hasTranches(tx, source.id));
  if (tranched && dispute.status === "lost") {
    const wanted = creditsToDebitForRefund({
      creditsMicro: source.creditsMicro,
      amountTotalCents: source.paidCents,
      cumulativeRefundedCents: dispute.amount,
      alreadyDebitedMicro: 0n,
    });
    const taken = withdrawn ? -withdrawn.balanceDeltaMicro : 0n;
    await settleLostDispute(
      tx,
      source.id,
      dispute.id,
      wanted > taken ? wanted - taken : 0n,
      ctx.at,
    );
    return "processed";
  }
  if (tranched) await releaseHeldTranches(tx, dispute.id);
  if (dispute.status !== "won") return "processed";
  if (!withdrawn) return "processed"; // rien n'avait été retiré
  const [lot] = await tx
    .select({ expiresAt: creditEntries.expiresAt })
    .from(creditEntries)
    .where(
      and(
        eq(creditEntries.purchaseId, source.id),
        eq(creditEntries.source, source.lotSource),
      ),
    )
    .orderBy(desc(creditEntries.expiresAt))
    .limit(1);
  // Douzièmes mensuels : le lot d'origine est souvent déjà échu, les crédits rendus valent au moins 30 jours.
  const restoredExpiry =
    tranched && lot?.expiresAt
      ? new Date(
          Math.max(lot.expiresAt.getTime(), ctx.at.getTime() + 30 * 86_400_000),
        )
      : lot
        ? lot.expiresAt // un lot sans échéance (recharge) rend des crédits sans échéance
        : creditExpiresAt(ctx.at, deps.config);
  await credit(tx, {
    organizationId: source.organizationId,
    amountMicro: -withdrawn.balanceDeltaMicro,
    idempotencyKey: `dispute-won:${dispute.id}`,
    configVersion: ctx.cfgVersion,
    source: "dispute_reversal",
    // Les crédits rendus gardent l'échéance du lot d'origine.
    expiresAt: restoredExpiry,
    purchaseId: source.id,
    externalRef: dispute.id,
  });
  if (source.purchase) {
    const stillOut = await netDebitedMicro(tx, source.id);
    await tx
      .update(creditPurchases)
      .set({ status: stillOut > 0n ? "partially_refunded" : "paid" })
      .where(eq(creditPurchases.id, source.purchase.id));
  }
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
  /** Période de facturation et espace de l'offre (octets), copiés de l'offre trouvée ; absents : inchangés. */
  billingInterval?: "month" | "year" | null;
  storageQuotaBytes?: bigint | null;
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
            billingInterval: u.billingInterval ?? row.billingInterval,
            storageQuotaBytes: u.storageQuotaBytes ?? row.storageQuotaBytes,
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
    billingInterval: plan?.interval ?? null,
    storageQuotaBytes: plan ? BigInt(plan.includedStorageBytes ?? 0) : null,
    vpsOrderId: isVps ? (meta.vps_order_id ?? null) : null,
  });

  // Le paiement d'une facture est relié à son PaymentIntent (anciennes API : porté par la facture).
  if (type === "invoice_paid")
    await linkInvoicePayment(tx, invoice.id, {
      paymentIntent: invoice.payment_intent
        ? idOf(invoice.payment_intent)
        : null,
      charge: invoice.charge ? idOf(invoice.charge) : null,
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
    } else if ((invoice.amount_paid ?? 0) <= 0) {
      // M4 : une facture à 0 $ (solde client, rabais total, essai) est « payée » sans qu'un sou ait
      // été encaissé : annuler puis se réabonner ne doit jamais redonner de crédits gratuits.
      deps.log.warn(
        "stripe : facture sans paiement, crédits inclus non accordés",
        {
          invoiceId: invoice.id,
        },
      );
    } else if (includedCreditsFor(plan, invoice) > 0) {
      await grantIncludedCredits(ctx, {
        orgId,
        invoice,
        subscriptionId: subId,
        plan,
        paidCents: invoice.amount_paid ?? 0,
        creditsCents: includedCreditsFor(plan, invoice),
        periodStart: period ? new Date(period.start * 1000) : ctx.at,
        expiresAt: period ? new Date(period.end * 1000) : addMonths(ctx.at, 1),
      });
    }
  }
  return "processed";
}

/** Enregistre (ou complète) le lien facture ↔ paiement ; sans effet si rien n'est connu. */
async function linkInvoicePayment(
  tx: Executor,
  invoiceId: string,
  refs: { paymentIntent: string | null; charge: string | null },
): Promise<boolean> {
  if (!refs.paymentIntent && !refs.charge) return false;
  await tx
    .insert(stripeInvoicePayments)
    .values({
      stripeInvoiceId: invoiceId,
      stripePaymentIntentId: refs.paymentIntent,
      stripeChargeId: refs.charge,
    })
    .onConflictDoUpdate({
      target: stripeInvoicePayments.stripeInvoiceId,
      set: {
        stripePaymentIntentId: sql`COALESCE(${stripeInvoicePayments.stripePaymentIntentId}, excluded.stripe_payment_intent_id)`,
        stripeChargeId: sql`COALESCE(${stripeInvoicePayments.stripeChargeId}, excluded.stripe_charge_id)`,
      },
    });
  return true;
}

/**
 * Crédits inclus à verser pour une facture, en cents : proportionnels au prix réellement payé (avant taxes, après
 * rabais). Ruling du 28/10 : un code de 99 % ne donne pas 100 % des crédits de l'offre (on ne vend jamais plus de crédits
 * que le prix payé n'en achète). Sans `total_excluding_tax` (anciennes versions d'API), l'octroi est complet.
 */
function includedCreditsFor(
  plan: SubscriptionPlan,
  invoice: InvoicePayload,
): number {
  const net = invoice.total_excluding_tax;
  if (net == null || plan.priceCents <= 0) return plan.includedCreditsCents;
  const paid = Math.max(0, Math.min(net, plan.priceCents));
  return Number(
    (BigInt(plan.includedCreditsCents) * BigInt(paid)) /
      BigInt(plan.priceCents),
  );
}

/**
 * Crédits inclus d'un abonnement, reliés à la facture payée (I2) : la ligne `subscription_credit_grants`
 * sert de source aux remboursements et litiges de cette facture. Offre mensuelle : un seul versement, valable jusqu'à
 * la fin de la période. Offre ANNUELLE : douze tranches (un douzième par mois, chacun valable le mois en cours), la
 * première versée tout de suite, les autres par la tâche `ledger.grant-tranches` du worker (voir
 * `packages/db/src/subscription-credits.ts`).
 */
async function grantIncludedCredits(
  ctx: Ctx,
  input: {
    orgId: string;
    invoice: InvoicePayload;
    subscriptionId: string;
    plan: SubscriptionPlan;
    paidCents: number;
    /** Crédits à verser pour cette facture (proportionnels au prix payé). */
    creditsCents: number;
    periodStart: Date;
    expiresAt: Date;
  },
): Promise<void> {
  const { tx } = ctx;
  const creditsMicro = centsToMicro(input.creditsCents);
  const version = planConfigVersion(input.plan);
  await tx
    .insert(subscriptionCreditGrants)
    .values({
      organizationId: input.orgId,
      stripeInvoiceId: input.invoice.id,
      stripeSubscriptionId: input.subscriptionId,
      amountPaidCents: input.paidCents,
      creditsMicro,
      configVersion: version,
    })
    .onConflictDoNothing({ target: subscriptionCreditGrants.stripeInvoiceId });
  const [grant] = await tx
    .select()
    .from(subscriptionCreditGrants)
    .where(eq(subscriptionCreditGrants.stripeInvoiceId, input.invoice.id));
  if (!grant) throw new Error("octroi introuvable après insertion");
  if (input.plan.interval === "year") {
    await createAnnualTranches(tx, {
      grantId: grant.id,
      organizationId: input.orgId,
      stripeInvoiceId: input.invoice.id,
      stripeSubscriptionId: input.subscriptionId,
      totalMicro: creditsMicro,
      periodStart: input.periodStart,
    });
    await grantFirstTranche(tx, {
      grantId: grant.id,
      configVersion: version,
      now: ctx.at,
    });
    return;
  }
  await credit(tx, {
    organizationId: input.orgId,
    amountMicro: creditsMicro,
    idempotencyKey: `sub-credit:${input.invoice.id}`,
    configVersion: version,
    source: "subscription",
    // Crédits inclus : valables jusqu'à la fin de la période payée.
    expiresAt: input.expiresAt,
    externalRef: input.invoice.id,
    purchaseId: grant.id,
  });
}

/** `invoice_payment.paid` : mémorise quel paiement a réglé quelle facture (avant ou après `invoice.paid`). */
async function onInvoicePayment(
  ctx: Ctx,
  payment: ReturnType<typeof invoicePaymentSchema.parse>,
): Promise<HandlerResult> {
  if (payment.status && payment.status !== "paid") return "ignored";
  const linked = await linkInvoicePayment(ctx.tx, idOf(payment.invoice), {
    paymentIntent: payment.payment?.payment_intent
      ? idOf(payment.payment.payment_intent)
      : null,
    charge: payment.payment?.charge ? idOf(payment.payment.charge) : null,
  });
  return linked ? "processed" : "ignored";
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
  let interval: "month" | "year" | null = null;
  let storageQuota: bigint | null = null;
  if (!isVps && !planCode && priceId) {
    try {
      const plan = await deps.plans.getByPriceId(priceId);
      planCode = plan?.code ?? null;
      cfg = plan ? planConfigVersion(plan) : null;
      interval = plan?.interval ?? null;
      storageQuota = plan ? BigInt(plan.includedStorageBytes ?? 0) : null;
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
    billingInterval: interval,
    storageQuotaBytes: storageQuota,
    vpsOrderId: isVps ? (sub.metadata.vps_order_id ?? null) : null,
  });
  if (
    type === "subscription_updated" &&
    sub.status === "trialing" &&
    !isVps &&
    deps.trials
  ) {
    let plan: SubscriptionPlan | null = null;
    try {
      plan = await findPlan(deps, planCode, priceId);
    } catch {
      // Directus indisponible : repli sur le code du plan.
    }
    await enforceTrialUniqueness(tx, {
      inspector: deps.trials,
      subscriptionId: sub.id,
      organizationId: orgId,
      family: plan?.family ?? planCode ?? "inconnue",
      log: deps.log,
    });
  }
  return "processed";
}
