import { randomBytes } from "node:crypto";
import { billingCustomers, eq, jobs, organizations, vpsEvents, vpsInstances, vpsOrders } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createOrder } from "@nexora/vps";
import { ProxmoxSimulator } from "@nexora/vps/simulator";
import { CUSTOMER_KEY, type Fixture, newOrg, SIM_TOKEN, seedFixture } from "@nexora/vps/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_BILLING_CONFIG } from "../ledger/config";
import { handleVpsAction, handleVpsCheckout, type VpsCustomerDeps } from "./customer-handlers";

let t: TestDatabase;
let fx: Fixture;
let close: () => Promise<void>;
const SITE = "http://localhost:3500";
const silent = { debug() {}, info() {}, warn() {}, error() {} } as never;

const sessions = { create: vi.fn(async (_p: Record<string, unknown>, _o?: Record<string, unknown>) => ({ id: "cs_test_vps", url: "https://checkout.stripe.test/c/pay/cs_test_vps" })) };
const customers = { create: vi.fn(async () => ({ id: `cus_${randomBytes(3).toString("hex")}` })) };
const subscriptions = { update: vi.fn(async (_id: string, _p: unknown) => ({})) };
const stripe = { customers, checkout: { sessions }, billingPortal: { sessions: {} }, subscriptions } as never;

type Ctx = { userId: string; email: string; organizationId: string; role: "owner" | "member" } | null;
function deps(ctx: Ctx, over: Partial<VpsCustomerDeps> = {}): VpsCustomerDeps {
  return {
    db: () => t.db,
    siteUrl: SITE,
    getContext: async () => ctx,
    stripe: async () => stripe,
    config: DEFAULT_BILLING_CONFIG,
    log: silent,
    now: () => new Date(),
    maxPerOrganization: 5,
    ...over,
  };
}
const req = (path: string, body: unknown, origin: string | null = SITE) =>
  new Request(`${SITE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", ...(origin ? { origin } : {}) },
    body: JSON.stringify(body),
  });
const owner = (): Ctx => ({ userId: "u1", email: "client@exemple.ca", organizationId: fx.organizationId, role: "owner" });

beforeAll(async () => {
  t = await createTestDatabase();
  const sim = new ProxmoxSimulator({ token: SIM_TOKEN });
  const s = await sim.start();
  close = s.close;
  fx = await seedFixture(t.db, { simPort: s.port });
});
afterAll(async () => {
  await close();
  await t.drop();
});

const form = (over: Record<string, unknown> = {}) => ({ plan: fx.planCode, app: fx.appCode, term: "month", sshKey: CUSTOMER_KEY, requestId: `req-${randomBytes(6).toString("hex")}`, lang: "fr", ...over });

describe("POST /api/vps/checkout", () => {
  it("crée la commande et une session d'abonnement avec le prix Stripe de la version publiée et la commande dans les métadonnées", async () => {
    const body = form({ requestId: "req-abcdef12" });
    const res = await handleVpsCheckout(req("/api/vps/checkout", body), deps(owner()));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { url: string; orderId: string };
    expect(json.url).toContain("checkout.stripe.test");
    const params = sessions.create.mock.calls.at(-1)?.[0] as Record<string, any>;
    expect(params).toMatchObject({
      mode: "subscription",
      line_items: [{ price: "price_test_month", quantity: 1 }],
      automatic_tax: { enabled: true },
      billing_address_collection: "required",
      metadata: { kind: "vps", vps_order_id: json.orderId, organization_id: fx.organizationId },
      subscription_data: { metadata: { kind: "vps", vps_order_id: json.orderId } },
    });
    expect(String(params.success_url)).toContain("/compte/vps?commande=ok");
    const opts = sessions.create.mock.calls.at(-1)?.[1] as { idempotencyKey: string };
    expect(opts.idempotencyKey).toBe(`vps-checkout:${json.orderId}`);
    const [order] = await t.db.select().from(vpsOrders).where(eq(vpsOrders.id, json.orderId));
    expect(order).toMatchObject({ status: "awaiting_payment", stripeCheckoutSessionId: "cs_test_vps", priceCents: 1500 });

    // Même formulaire renvoyé : la même commande, pas une deuxième.
    const again = await handleVpsCheckout(req("/api/vps/checkout", body), deps(owner()));
    expect(((await again.json()) as { orderId: string }).orderId).toBe(json.orderId);
  });

  it("refuse une origine étrangère, l'absence de session, un membre non propriétaire, un formulaire invalide", async () => {
    expect((await handleVpsCheckout(req("/api/vps/checkout", form(), "https://evil.example"), deps(owner()))).status).toBe(403);
    expect((await handleVpsCheckout(req("/api/vps/checkout", form()), deps(null))).status).toBe(401);
    expect((await handleVpsCheckout(req("/api/vps/checkout", form()), deps({ ...(owner() as object), role: "member" } as Ctx))).status).toBe(403);
    expect((await handleVpsCheckout(req("/api/vps/checkout", form({ term: "decade" })), deps(owner()))).status).toBe(422);
    const noKey = await handleVpsCheckout(req("/api/vps/checkout", form({ sshKey: "monmotdepasse" })), deps(owner()));
    expect(noKey.status).toBe(422);
    expect(((await noKey.json()) as { error: string }).error).toBe("invalid_ssh_key");
  });

  it("l'organisation vient de la session, jamais du formulaire", async () => {
    const other = await newOrg(t.db);
    await handleVpsCheckout(req("/api/vps/checkout", form({ organizationId: other })), deps(owner()));
    const rows = await t.db.select().from(vpsOrders).where(eq(vpsOrders.organizationId, other));
    expect(rows).toHaveLength(0);
  });

  it("Stripe indisponible : 502 sans détail, la commande reste en attente", async () => {
    sessions.create.mockRejectedValueOnce(Object.assign(new Error("secret sk_test_xxxxxxxxxxxx"), { type: "StripeConnectionError" }));
    const res = await handleVpsCheckout(req("/api/vps/checkout", form()), deps({ ...(owner() as object), userId: "u-stripe-down" } as Ctx));
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("sk_test");
  });
});

describe("POST /api/account/vps/{id}/action", () => {
  async function instance(orgId: string, status: "active" | "suspended" = "active") {
    const { order } = await createOrder(t.db, { organizationId: orgId, idempotencyKey: `h-${randomBytes(5).toString("hex")}`, planCode: fx.planCode, appCode: fx.appCode, term: "month", sshPublicKey: CUSTOMER_KEY, maxPerOrganization: 99 });
    const orderId = order.id;
    await t.db.update(vpsOrders).set({ status: "fulfilled", stripeSubscriptionId: `sub_${randomBytes(3).toString("hex")}` }).where(eq(vpsOrders.id, orderId));
    const [inst] = await t.db.insert(vpsInstances).values({ orderId, organizationId: orgId, vcpu: 2, ramMb: 4096, diskGb: 40, planCode: fx.planCode, appCode: fx.appCode, appVersion: "1.2.3", catalogVersionId: fx.catalogVersionId, vmName: `nx-${orderId.slice(0, 8)}`, status, step: "done" }).returning();
    return { id: inst?.id as string, orderId };
  }
  const act = (id: string, body: Record<string, unknown>, d: VpsCustomerDeps, origin: string | null = SITE) =>
    handleVpsAction(req(`/api/account/vps/${id}/action`, { requestId: `r-${randomBytes(5).toString("hex")}`, ...body }, origin), id, d);
  const jobsFor = async (id: string) => (await t.db.select().from(jobs)).filter((j) => JSON.stringify(j.payload).includes(id));

  it("démarrer / arrêter / redémarrer : tâche mise en file une seule fois par requête, y compris pour un membre", async () => {
    const { id } = await instance(fx.organizationId);
    const member: Ctx = { userId: "u2", email: "m@x.ca", organizationId: fx.organizationId, role: "member" };
    const body = { action: "stop", requestId: "same-request-1" };
    expect((await act(id, body, deps(member))).status).toBe(202);
    await act(id, body, deps(member));
    const q = (await jobsFor(id)).filter((j) => j.type === "vps.action");
    expect(q).toHaveLength(1);
    expect(q[0]?.payload).toMatchObject({ action: "stop" });
    expect((await t.db.select().from(vpsInstances).where(eq(vpsInstances.id, id)))[0]?.pendingAction).toBe("stop");
  });

  it("refuse l'action sur un VPS suspendu", async () => {
    const { id } = await instance(fx.organizationId, "suspended");
    const res = await act(id, { action: "start" }, deps(owner()));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("not_active");
  });

  it("réinstaller exige une confirmation explicite et le propriétaire ; l'instance passe en réinstallation avec sa tâche", async () => {
    const { id } = await instance(fx.organizationId);
    const member: Ctx = { userId: "u2", email: "m@x.ca", organizationId: fx.organizationId, role: "member" };
    expect((await act(id, { action: "reinstall", confirm: true }, deps(member))).status).toBe(403);
    const unconfirmed = await act(id, { action: "reinstall" }, deps(owner()));
    expect(unconfirmed.status).toBe(422);
    expect(((await unconfirmed.json()) as { error: string }).error).toBe("confirmation_required");
    expect((await t.db.select().from(vpsInstances).where(eq(vpsInstances.id, id)))[0]?.status).toBe("active");

    expect((await act(id, { action: "reinstall", confirm: true, requestId: "reinstall-1" }, deps(owner()))).status).toBe(202);
    expect((await t.db.select().from(vpsInstances).where(eq(vpsInstances.id, id)))[0]).toMatchObject({ status: "reinstalling", step: "snapshot" });
    expect((await jobsFor(id)).filter((j) => j.idempotencyKey === `vps-reinstall:${id}:reinstall-1`)).toHaveLength(0); // la clé porte l'orderId dans la charge
    expect((await t.db.select().from(jobs)).filter((j) => j.idempotencyKey === `vps-reinstall:${id}:reinstall-1`)).toHaveLength(1);
  });

  it("résilier demande l'arrêt à la fin de la période chez Stripe, avec confirmation, et journalise", async () => {
    const { id, orderId } = await instance(fx.organizationId);
    expect((await act(id, { action: "cancel" }, deps(owner()))).status).toBe(422);
    expect(subscriptions.update).not.toHaveBeenCalled();
    expect((await act(id, { action: "cancel", confirm: "true" }, deps(owner()))).status).toBe(202);
    expect(subscriptions.update).toHaveBeenCalledWith(expect.stringMatching(/^sub_/), { cancel_at_period_end: true });
    const events = await t.db.select().from(vpsEvents).where(eq(vpsEvents.orderId, orderId));
    expect(events.map((e) => e.kind)).toContain("cancel_requested");
  });

  it("une instance d'une autre organisation n'existe pas pour l'utilisateur (404) ; origine et session contrôlées", async () => {
    const other = await newOrg(t.db);
    await t.db.insert(billingCustomers).values({ organizationId: other, stripeCustomerId: `cus_${randomBytes(3).toString("hex")}` });
    const { id } = await instance(other);
    expect((await act(id, { action: "stop" }, deps(owner()))).status).toBe(404);
    expect((await act(id, { action: "stop" }, deps(owner()), "https://evil.example")).status).toBe(403);
    expect((await act(id, { action: "stop" }, deps(null))).status).toBe(401);
    expect((await act("pas-un-uuid", { action: "stop" }, deps(owner()))).status).toBe(404);
  });
});

void organizations;
