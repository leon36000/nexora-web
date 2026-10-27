import {
  accessLevel,
  and,
  type Database,
  type Executor,
  enqueue,
  eq,
  inArray,
  type Region,
  type SubscriptionStatus,
  sql,
  type VpsTerm,
  vpsInstances,
  vpsOrders,
} from "@nexora/db";
import { getPublishedCatalog, stripePriceFor } from "./catalog.ts";
import { recordVpsEvent } from "./events.ts";
import { decideLifecycle, orderPaymentAction } from "./lifecycle.ts";
import { parseSshPublicKey } from "./ssh-key.ts";

export type OrderErrorCode =
  | "catalog_unavailable"
  | "plan_unavailable"
  | "app_unavailable"
  | "app_not_installable"
  | "plan_too_small"
  | "term_unavailable"
  | "plan_not_synced"
  | "invalid_ssh_key"
  | "limit_reached"
  | "invalid_hostname";

export class OrderError extends Error {
  readonly code: OrderErrorCode;
  constructor(code: OrderErrorCode, message: string) {
    super(message);
    this.name = "OrderError";
    this.code = code;
  }
}

export interface CreateOrderInput {
  organizationId: string;
  userId?: string | null;
  /** Fournie par le formulaire : un double envoi ne crée qu'une commande. */
  idempotencyKey: string;
  planCode: string;
  appCode: string;
  term: VpsTerm;
  sshPublicKey: string;
  hostname?: string;
  /** Plafond de VPS par organisation (anti-abus). */
  maxPerOrganization: number;
}

const HOST = /^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/;

/**
 * Crée une commande « en attente de paiement » à partir de la version de catalogue PUBLIÉE : le
 * prix, le plan et l'application sont figés à cet instant (`catalog_version_id`).
 */
export async function createOrder(db: Database, input: CreateOrderInput) {
  const [again] = await db
    .select()
    .from(vpsOrders)
    .where(eq(vpsOrders.idempotencyKey, input.idempotencyKey));
  if (again) {
    if (again.organizationId !== input.organizationId)
      throw new OrderError("limit_reached", "clé de commande déjà utilisée");
    return { order: again, created: false as const };
  }
  const key = parseSshPublicKey(input.sshPublicKey);
  if (!key.ok)
    throw new OrderError("invalid_ssh_key", `clé SSH refusée (${key.reason})`);
  const catalog = await getPublishedCatalog(db);
  if (!catalog)
    throw new OrderError("catalog_unavailable", "aucun catalogue VPS publié");
  const plan = catalog.snapshot.plans.find((p) => p.code === input.planCode);
  if (!plan) throw new OrderError("plan_unavailable", "plan non publié");
  const app = catalog.snapshot.apps.find((a) => a.code === input.appCode);
  if (!app) throw new OrderError("app_unavailable", "application non publiée");
  if (app.kind !== "installable")
    throw new OrderError(
      "app_not_installable",
      "cette application s'installe par le client (guide)",
    );
  if (plan.ramMb < app.minRamMb)
    throw new OrderError(
      "plan_too_small",
      "ce plan est trop petit pour cette application",
    );
  const price =
    input.term === "month" ? plan.priceMonthlyCents : plan.priceYearlyCents;
  if (!price)
    throw new OrderError("term_unavailable", "durée non offerte pour ce plan");
  if (!stripePriceFor(catalog, plan.code, input.term))
    throw new OrderError(
      "plan_not_synced",
      "prix Stripe absent : lancer « Publier vers Stripe »",
    );
  const hostname = input.hostname ?? "";
  if (hostname && !HOST.test(hostname))
    throw new OrderError("invalid_hostname", "nom d'hôte invalide");

  const active = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(vpsOrders)
    .where(
      and(
        eq(vpsOrders.organizationId, input.organizationId),
        inArray(vpsOrders.status, [
          "awaiting_payment",
          "paid",
          "provisioning",
          "fulfilled",
        ]),
      ),
    );
  if ((active[0]?.n ?? 0) >= input.maxPerOrganization)
    throw new OrderError(
      "limit_reached",
      "nombre maximal de VPS atteint pour cette organisation",
    );

  const id = crypto.randomUUID();
  const [order] = await db
    .insert(vpsOrders)
    .values({
      id,
      organizationId: input.organizationId,
      createdBy: input.userId ?? null,
      idempotencyKey: input.idempotencyKey,
      planId: plan.id,
      planCode: plan.code,
      appId: app.id,
      appCode: app.code,
      term: input.term,
      region: plan.region as Region,
      priceCents: price,
      catalogVersionId: catalog.id,
      catalogVersion: catalog.short,
      sshPublicKey: key.normalized,
      sshKeyFingerprint: key.fingerprint,
      hostname: hostname || `vps-${id.slice(0, 8)}`,
    })
    .onConflictDoNothing({ target: vpsOrders.idempotencyKey })
    .returning();
  if (!order) {
    const [existing] = await db
      .select()
      .from(vpsOrders)
      .where(eq(vpsOrders.idempotencyKey, input.idempotencyKey));
    if (!existing) throw new Error("commande introuvable après conflit");
    return { order: existing, created: false as const };
  }
  await recordVpsEvent(db, {
    organizationId: order.organizationId,
    orderId: order.id,
    actor: "customer",
    kind: "order_created",
    message: `commande ${plan.code} / ${app.code}`,
    detail: {
      plan: plan.code,
      app: app.code,
      term: input.term,
      catalog: catalog.short,
    },
  });
  return { order, created: true as const };
}

export interface SubscriptionState {
  status: SubscriptionStatus;
  graceEndsAt: Date | null;
}

/** Webhook `checkout.session.completed` (abonnement VPS) : relie la commande à la session et à l'abonnement. */
export async function onVpsCheckoutCompleted(
  tx: Executor,
  input: {
    orderId: string;
    organizationId: string;
    sessionId: string;
    subscriptionId: string | null;
  },
) {
  const [order] = await tx
    .update(vpsOrders)
    .set({
      stripeCheckoutSessionId: input.sessionId,
      ...(input.subscriptionId
        ? { stripeSubscriptionId: input.subscriptionId }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(vpsOrders.id, input.orderId),
        eq(vpsOrders.organizationId, input.organizationId),
      ),
    )
    .returning({ id: vpsOrders.id });
  if (order)
    await recordVpsEvent(tx, {
      organizationId: input.organizationId,
      orderId: input.orderId,
      actor: "stripe",
      kind: "checkout_completed",
      message: "paiement initial en cours de confirmation",
    });
  return Boolean(order);
}

/**
 * Appelée dans la transaction du webhook, après chaque transition d'abonnement : provisionne une
 * commande dont l'abonnement donne accès, et met en file la suspension, la reprise ou la résiliation
 * des services existants. Idempotente (clés de tâche dérivées de l'événement).
 */
export async function reconcileVpsSubscription(
  tx: Executor,
  input: {
    stripeSubscriptionId: string;
    organizationId: string;
    linkOrderId?: string | null;
    state: SubscriptionState;
    eventId: string;
    now: Date;
  },
): Promise<{ provisioned: string[]; lifecycle: string[] }> {
  if (input.linkOrderId)
    await tx
      .update(vpsOrders)
      .set({
        stripeSubscriptionId: input.stripeSubscriptionId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(vpsOrders.id, input.linkOrderId),
          eq(vpsOrders.organizationId, input.organizationId),
          sql`${vpsOrders.stripeSubscriptionId} IS NULL`,
        ),
      );
  const orders = await tx
    .select()
    .from(vpsOrders)
    .where(eq(vpsOrders.stripeSubscriptionId, input.stripeSubscriptionId));
  const provisioned: string[] = [];
  const lifecycle: string[] = [];
  const access = accessLevel(input.state, input.now);
  for (const order of orders) {
    if (orderPaymentAction(order.status, access) === "provision") {
      await tx
        .update(vpsOrders)
        .set({
          status: "paid",
          paidAt: order.paidAt ?? input.now,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(vpsOrders.id, order.id),
            inArray(vpsOrders.status, ["awaiting_payment", "paid"]),
          ),
        );
      if (order.status === "awaiting_payment")
        await recordVpsEvent(tx, {
          organizationId: order.organizationId,
          orderId: order.id,
          actor: "stripe",
          kind: "paid",
          message: "paiement confirmé",
        });
      await enqueue(tx, {
        type: "vps.provision",
        payload: { orderId: order.id },
        idempotencyKey: `vps-provision:${order.id}`,
        maxAttempts: 6,
      });
      provisioned.push(order.id);
    } else if (
      order.status === "awaiting_payment" &&
      (input.state.status === "canceled" ||
        input.state.status === "incomplete_expired")
    ) {
      await tx
        .update(vpsOrders)
        .set({
          status: input.state.status === "canceled" ? "canceled" : "expired",
          updatedAt: new Date(),
        })
        .where(eq(vpsOrders.id, order.id));
    }
    const [inst] = await tx
      .select()
      .from(vpsInstances)
      .where(eq(vpsInstances.orderId, order.id));
    if (!inst) continue;
    const decision = decideLifecycle({
      instance: { status: inst.status, retentionEndsAt: inst.retentionEndsAt },
      subscription: input.state,
      now: input.now,
    });
    if (decision.kind !== "noop" && decision.kind !== "delete") {
      await enqueue(tx, {
        type: "vps.lifecycle",
        payload: { instanceId: inst.id, action: decision.kind },
        idempotencyKey: `vps-lifecycle:${inst.id}:${decision.kind}:${input.eventId}`,
        maxAttempts: 8,
      });
      lifecycle.push(`${inst.id}:${decision.kind}`);
    }
  }
  return { provisioned, lifecycle };
}
