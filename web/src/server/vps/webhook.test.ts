import { randomBytes } from "node:crypto";
import {
  billingCustomers,
  creditEntries,
  eq,
  jobs,
  subscriptions,
  vpsInstances,
  vpsOrders,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createOrder } from "@nexora/vps";
import { ProxmoxSimulator } from "@nexora/vps/simulator";
import {
  CUSTOMER_KEY,
  type Fixture,
  SIM_TOKEN,
  seedFixture,
} from "@nexora/vps/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { processStripeEvent, type WebhookDeps } from "../billing/webhook";
import { DEFAULT_BILLING_CONFIG } from "../ledger/config";
import { buildEvent } from "../stripe/testing";

let t: TestDatabase;
let fx: Fixture;
let close: () => Promise<void>;
const silentLog = { debug() {}, info() {}, warn() {}, error() {} } as never;
// Une source de plans qui échoue si on l'interroge : un abonnement VPS n'est pas un plan Directus.
const noDirectus = {
  async listPublished() {
    throw new Error("Directus ne doit pas être consulté pour un VPS");
  },
  async getByCode() {
    throw new Error("Directus ne doit pas être consulté pour un VPS");
  },
  async getByPriceId() {
    throw new Error("Directus ne doit pas être consulté pour un VPS");
  },
};
const deps = (): WebhookDeps => ({
  db: t.db,
  plans: noDirectus,
  config: DEFAULT_BILLING_CONFIG,
  log: silentLog,
});
const T0 = Math.floor(new Date("2026-11-01T12:00:00Z").getTime() / 1000);
const DAY = 86_400;

beforeAll(async () => {
  t = await createTestDatabase();
  const sim = new ProxmoxSimulator({ token: SIM_TOKEN });
  const s = await sim.start();
  close = s.close;
  fx = await seedFixture(t.db, { simPort: s.port });
  await t.db
    .insert(billingCustomers)
    .values({ organizationId: fx.organizationId, stripeCustomerId: "cus_vps" });
});
afterAll(async () => {
  await close();
  await t.drop();
});

let seq = 0;
async function newOrder() {
  const { order } = await createOrder(t.db, {
    organizationId: fx.organizationId,
    idempotencyKey: `k-${++seq}-${randomBytes(3).toString("hex")}`,
    planCode: fx.planCode,
    appCode: fx.appCode,
    term: "month",
    sshPublicKey: CUSTOMER_KEY,
    maxPerOrganization: 99,
  });
  return { orderId: order.id, subId: `sub_${randomBytes(4).toString("hex")}` };
}
const meta = (orderId: string) => ({
  kind: "vps",
  organization_id: fx.organizationId,
  vps_order_id: orderId,
});
const session = (orderId: string, subId: string) => ({
  id: `cs_${randomBytes(4).toString("hex")}`,
  object: "checkout.session",
  mode: "subscription",
  payment_status: "paid",
  client_reference_id: fx.organizationId,
  customer: "cus_vps",
  subscription: subId,
  metadata: meta(orderId),
});
const invoice = (orderId: string, subId: string) => ({
  id: `in_${randomBytes(4).toString("hex")}`,
  customer: "cus_vps",
  billing_reason: "subscription_create",
  parent: {
    subscription_details: { subscription: subId, metadata: meta(orderId) },
  },
  lines: {
    data: [
      {
        period: { start: T0, end: T0 + 30 * DAY },
        pricing: { price_details: { price: "price_test_month" } },
      },
    ],
  },
});
const subObj = (orderId: string, subId: string, status: string) => ({
  id: subId,
  customer: "cus_vps",
  status,
  cancel_at_period_end: false,
  metadata: meta(orderId),
  items: {
    data: [
      {
        current_period_start: T0,
        current_period_end: T0 + 30 * DAY,
        price: { id: "price_test_month" },
      },
    ],
  },
});
const jobsOf = async (type: string, needle: string) =>
  (await t.db.select().from(jobs)).filter(
    (j) => j.type === type && JSON.stringify(j.payload).includes(needle),
  );
const orderRow = async (id: string) =>
  (await t.db.select().from(vpsOrders).where(eq(vpsOrders.id, id)))[0];

describe("webhook Stripe : abonnement VPS → provisionnement", () => {
  it("relie la commande, provisionne après la facture payée, une seule fois, sans crédits ni Directus", async () => {
    const { orderId, subId } = await newOrder();
    await processStripeEvent(
      deps(),
      buildEvent("checkout.session.completed", session(orderId, subId), {
        created: T0,
      }),
    );
    expect(await orderRow(orderId)).toMatchObject({
      status: "awaiting_payment",
      stripeSubscriptionId: subId,
    });
    expect(await jobsOf("vps.provision", orderId)).toHaveLength(0);

    const paid = buildEvent("invoice.paid", invoice(orderId, subId), {
      created: T0 + 1,
    });
    expect((await processStripeEvent(deps(), paid)).status).toBe("processed");
    expect((await processStripeEvent(deps(), paid)).status).toBe("duplicate");
    await processStripeEvent(
      deps(),
      buildEvent(
        "customer.subscription.updated",
        subObj(orderId, subId, "active"),
        { created: T0 + 2 },
      ),
    );
    expect(await orderRow(orderId)).toMatchObject({ status: "paid" });
    expect(await jobsOf("vps.provision", orderId)).toHaveLength(1);
    const entries = await t.db
      .select()
      .from(creditEntries)
      .where(eq(creditEntries.organizationId, fx.organizationId));
    expect(entries).toHaveLength(0);
  });

  it("une facture arrivée AVANT la fin de la session relie quand même la commande", async () => {
    const { orderId, subId } = await newOrder();
    await processStripeEvent(
      deps(),
      buildEvent("invoice.paid", invoice(orderId, subId), { created: T0 }),
    );
    expect(await orderRow(orderId)).toMatchObject({
      status: "paid",
      stripeSubscriptionId: subId,
    });
    expect(await jobsOf("vps.provision", orderId)).toHaveLength(1);
  });

  it("un échec de paiement du premier prélèvement ne provisionne rien", async () => {
    const { orderId, subId } = await newOrder();
    await processStripeEvent(
      deps(),
      buildEvent("checkout.session.completed", session(orderId, subId), {
        created: T0,
      }),
    );
    await processStripeEvent(
      deps(),
      buildEvent("invoice.payment_failed", invoice(orderId, subId), {
        created: T0 + 1,
      }),
    );
    expect((await orderRow(orderId))?.status).toBe("awaiting_payment");
    expect(await jobsOf("vps.provision", orderId)).toHaveLength(0);
  });
});

describe("webhook Stripe : suspension et résiliation d'un VPS actif", () => {
  async function liveOrder() {
    const { orderId, subId } = await newOrder();
    await processStripeEvent(
      deps(),
      buildEvent("invoice.paid", invoice(orderId, subId), { created: T0 }),
    );
    const [inst] = await t.db
      .insert(vpsInstances)
      .values({
        orderId,
        organizationId: fx.organizationId,
        vcpu: 2,
        ramMb: 4096,
        diskGb: 40,
        planCode: fx.planCode,
        appCode: fx.appCode,
        appVersion: "1.2.3",
        catalogVersionId: fx.catalogVersionId,
        vmName: `nx-${orderId.slice(0, 8)}`,
        status: "active",
        step: "done",
      })
      .returning();
    await t.db
      .update(vpsOrders)
      .set({ status: "fulfilled" })
      .where(eq(vpsOrders.id, orderId));
    return { orderId, subId, instanceId: inst?.id as string };
  }

  it("le délai de grâce garde le service ; la suspension est demandée seulement une fois la grâce écoulée", async () => {
    const { orderId, subId, instanceId } = await liveOrder();
    await processStripeEvent(
      deps(),
      buildEvent("invoice.payment_failed", invoice(orderId, subId), {
        created: T0 + 10,
      }),
    );
    const [sub] = await t.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, subId));
    expect(sub?.status).toBe("past_due");
    expect(sub?.graceEndsAt).not.toBeNull();
    expect(await jobsOf("vps.lifecycle", instanceId)).toHaveLength(0);

    // Stripe passe l'abonnement à « unpaid » après ses relances : accès suspendu.
    await processStripeEvent(
      deps(),
      buildEvent(
        "customer.subscription.updated",
        subObj(orderId, subId, "unpaid"),
        { created: T0 + 20 * DAY },
      ),
    );
    const q = await jobsOf("vps.lifecycle", instanceId);
    expect(q).toHaveLength(1);
    expect(q[0]?.payload).toMatchObject({ action: "suspend" });
  });

  it("la résiliation de l'abonnement demande l'arrêt et la rétention du VPS", async () => {
    const { orderId, subId, instanceId } = await liveOrder();
    await processStripeEvent(
      deps(),
      buildEvent(
        "customer.subscription.deleted",
        subObj(orderId, subId, "canceled"),
        { created: T0 + 30 * DAY },
      ),
    );
    const q = await jobsOf("vps.lifecycle", instanceId);
    expect(q).toHaveLength(1);
    expect(q[0]?.payload).toMatchObject({ action: "terminate" });
  });
});
