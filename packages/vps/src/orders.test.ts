import { eq, jobs, vpsOrders } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  approveCatalogVersion,
  createApp,
  createDraftVersion,
  createPlan,
  markCatalogApplied,
  publishCatalogVersion,
  updateApp,
  updatePlan,
} from "./catalog.ts";
import {
  createOrder,
  OrderError,
  onVpsCheckoutCompleted,
  reconcileVpsSubscription,
} from "./orders.ts";
import { ensureInstance } from "./provision.ts";
import { ProxmoxSimulator } from "./proxmox/simulator.ts";
import {
  CUSTOMER_KEY,
  createSimRunner,
  engineDeps,
  type Fixture,
  newOrg,
  SIM_TOKEN,
  seedFixture,
} from "./testing.ts";

let t: TestDatabase;
let fx: Fixture;
let close: () => Promise<void>;
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

let n = 0;
const input = (over: Partial<Parameters<typeof createOrder>[1]> = {}) => ({
  organizationId: fx.organizationId,
  idempotencyKey: `cle-${++n}-${Math.random()}`,
  planCode: fx.planCode,
  appCode: fx.appCode,
  term: "month" as const,
  sshPublicKey: CUSTOMER_KEY,
  maxPerOrganization: 100,
  ...over,
});
const failsWith = async (p: Promise<unknown>, code: string) =>
  expect(p).rejects.toMatchObject({ name: "OrderError", code });

describe("création d'une commande", () => {
  it("fige le prix, la version de catalogue et la clé SSH, sans aucun mot de passe", async () => {
    const { order, created } = await createOrder(t.db, input({ term: "year" }));
    expect(created).toBe(true);
    expect(order).toMatchObject({
      status: "awaiting_payment",
      priceCents: 15000,
      term: "year",
      currency: "cad",
      region: "quebec",
    });
    expect(order.catalogVersionId).toBe(fx.catalogVersionId);
    expect(order.sshPublicKey).toBe(CUSTOMER_KEY);
    expect(order.sshKeyFingerprint).toMatch(/^SHA256:/);
    expect(JSON.stringify(order)).not.toMatch(/password|motdepasse/i);
  });

  it("un double envoi du formulaire (même clé) ne crée qu'une commande, même en concurrence", async () => {
    const i = input();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => createOrder(t.db, i)),
    );
    expect(new Set(results.map((r) => r.order.id)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
  });

  it("refuse la clé de commande d'une autre organisation", async () => {
    const i = input();
    await createOrder(t.db, i);
    await failsWith(
      createOrder(t.db, { ...i, organizationId: await newOrg(t.db) }),
      "limit_reached",
    );
  });

  it("refuse une clé SSH invalide, un plan ou une application non publiés, un guide, un plan trop petit, une durée absente", async () => {
    await failsWith(
      createOrder(t.db, input({ sshPublicKey: "motdepasse123" })),
      "invalid_ssh_key",
    );
    await failsWith(
      createOrder(t.db, input({ planCode: "inconnu" })),
      "plan_unavailable",
    );
    await failsWith(
      createOrder(t.db, input({ appCode: "inconnue" })),
      "app_unavailable",
    );
    await failsWith(
      createOrder(t.db, input({ hostname: "Pas Valide!" })),
      "invalid_hostname",
    );
  });

  it("refuse un plan sans prix Stripe publié pour la durée, un plan trop petit et un guide", async () => {
    const small = await createPlan(t.db, {
      code: "mini",
      name: "Mini",
      vcpu: 1,
      ramMb: 1024,
      diskGb: 10,
      bandwidthGb: 100,
      templateCode: "debian-12-ci",
      priceMonthlyCents: 500,
    });
    const guide = await createApp(t.db, {
      code: "n8n-g",
      name: "n8n",
      kind: "guide",
      version: "2.0.0",
      upstreamUrl: "https://github.com/n8n-io/n8n",
      license: "SUL-1.0",
      licenseUrl: "https://github.com/n8n-io/n8n/blob/master/LICENSE.md",
      licenseWarningFr: "a",
      licenseWarningEn: "a",
      guideFr: "g",
      guideEn: "g",
    });
    const big = await createPlan(t.db, {
      code: "gros",
      name: "Gros",
      vcpu: 4,
      ramMb: 8192,
      diskGb: 100,
      bandwidthGb: 100,
      templateCode: "debian-12-ci",
      priceMonthlyCents: 2500,
    });
    for (const p of [small, big]) {
      await updatePlan(t.db, p.id, { status: "approved" });
      await updatePlan(t.db, p.id, { status: "published" });
    }
    await updateApp(t.db, guide.id, { status: "approved" });
    await updateApp(t.db, guide.id, { status: "published" });
    const g = { allowDevSamples: true };
    const d = await createDraftVersion(t.db, g);
    await approveCatalogVersion(t.db, d.version.id, g);
    const v = await publishCatalogVersion(t.db, d.version.id, g);
    // « gros » est nouveau : les prix Stripe ne sont pas repris tant qu'on ne relance pas la publication vers Stripe.
    await failsWith(
      createOrder(t.db, input({ planCode: "gros" })),
      "plan_not_synced",
    );
    await markCatalogApplied(t.db, v.id, {
      status: "applied",
      detail: {
        stripe: {
          plans: {
            mini: { productId: "p", monthly: "price_mini" },
            gros: { productId: "p", monthly: "price_gros" },
            [fx.planCode]: {
              productId: "p",
              monthly: "price_a",
              yearly: "price_b",
            },
          },
        },
      },
    });
    await failsWith(
      createOrder(t.db, input({ planCode: "mini" })),
      "plan_too_small",
    );
    await failsWith(
      createOrder(t.db, input({ planCode: "gros", term: "year" })),
      "term_unavailable",
    );
    await failsWith(
      createOrder(t.db, input({ appCode: "n8n-g" })),
      "app_not_installable",
    );
  });

  it("plafonne le nombre de VPS par organisation (anti-abus)", async () => {
    const org = await newOrg(t.db);
    await createOrder(
      t.db,
      input({ organizationId: org, maxPerOrganization: 2 }),
    );
    await createOrder(
      t.db,
      input({ organizationId: org, maxPerOrganization: 2 }),
    );
    await failsWith(
      createOrder(t.db, input({ organizationId: org, maxPerOrganization: 2 })),
      "limit_reached",
    );
  });
});

const SUB = "sub_reconcile";
async function fresh(subId: string) {
  const { order } = await createOrder(t.db, input());
  await t.db.transaction((tx) =>
    onVpsCheckoutCompleted(tx, {
      orderId: order.id,
      organizationId: fx.organizationId,
      sessionId: `cs_${subId}`,
      subscriptionId: subId,
    }),
  );
  return order.id;
}
const reconcile = (
  subId: string,
  status: Parameters<typeof reconcileVpsSubscription>[1]["state"]["status"],
  over: {
    graceEndsAt?: Date | null;
    eventId?: string;
    link?: string;
    now?: Date;
  } = {},
) =>
  t.db.transaction((tx) =>
    reconcileVpsSubscription(tx, {
      stripeSubscriptionId: subId,
      organizationId: fx.organizationId,
      linkOrderId: over.link,
      state: { status, graceEndsAt: over.graceEndsAt ?? null },
      eventId: over.eventId ?? `evt_${Math.random()}`,
      now: over.now ?? new Date(),
    }),
  );
const jobsOf = async (type: string, key: string) =>
  (await t.db.select().from(jobs)).filter(
    (j) => j.type === type && j.idempotencyKey?.includes(key),
  );

describe("paiement confirmé par Stripe → provisionnement", () => {
  it("un premier paiement réussi met la commande « payée » et en file UNE tâche, même si les événements se répètent", async () => {
    const orderId = await fresh(`${SUB}_1`);
    expect(
      (await t.db.select().from(vpsOrders).where(eq(vpsOrders.id, orderId)))[0]
        ?.status,
    ).toBe("awaiting_payment");
    const out = await reconcile(`${SUB}_1`, "incomplete");
    expect(out.provisioned).toEqual([]);
    await reconcile(`${SUB}_1`, "active");
    await reconcile(`${SUB}_1`, "active");
    await Promise.all(
      Array.from({ length: 5 }, () => reconcile(`${SUB}_1`, "active")),
    );
    const [order] = await t.db
      .select()
      .from(vpsOrders)
      .where(eq(vpsOrders.id, orderId));
    expect(order?.status).toBe("paid");
    expect(order?.paidAt).not.toBeNull();
    expect(await jobsOf("vps.provision", orderId)).toHaveLength(1);
  });

  it("relie la commande par la métadonnée quand la facture arrive avant la fin du paiement", async () => {
    const { order } = await createOrder(t.db, input());
    await reconcile(`${SUB}_2`, "active", { link: order.id });
    expect(
      (
        await t.db.select().from(vpsOrders).where(eq(vpsOrders.id, order.id))
      )[0],
    ).toMatchObject({ status: "paid", stripeSubscriptionId: `${SUB}_2` });
    expect(await jobsOf("vps.provision", order.id)).toHaveLength(1);
  });

  it("ne relie pas la commande d'une autre organisation", async () => {
    const { order } = await createOrder(
      t.db,
      input({ organizationId: await newOrg(t.db) }),
    );
    await reconcile(`${SUB}_3`, "active", { link: order.id });
    expect(
      (await t.db.select().from(vpsOrders).where(eq(vpsOrders.id, order.id)))[0]
        ?.status,
    ).toBe("awaiting_payment");
  });

  it("un abonnement qui n'aboutit jamais fait expirer la commande", async () => {
    const orderId = await fresh(`${SUB}_4`);
    await reconcile(`${SUB}_4`, "incomplete_expired");
    expect(
      (await t.db.select().from(vpsOrders).where(eq(vpsOrders.id, orderId)))[0]
        ?.status,
    ).toBe("expired");
  });
});

describe("abonnement → cycle de vie du service", () => {
  async function liveInstance(subId: string) {
    const orderId = await fresh(subId);
    await reconcile(subId, "active");
    const sim = new ProxmoxSimulator({ token: SIM_TOKEN });
    const deps = engineDeps(t.db, createSimRunner(sim).runner);
    const inst = await ensureInstance(deps, orderId);
    const { vpsInstances } = await import("@nexora/db");
    await t.db
      .update(vpsInstances)
      .set({ status: "active", step: "done" })
      .where(eq(vpsInstances.id, inst.id));
    await t.db
      .update(vpsOrders)
      .set({ status: "fulfilled" })
      .where(eq(vpsOrders.id, orderId));
    return inst.id;
  }

  it("garde le service pendant la grâce, demande la suspension après, la reprise au paiement", async () => {
    const id = await liveInstance(`${SUB}_5`);
    const now = new Date();
    const inGrace = await reconcile(`${SUB}_5`, "past_due", {
      graceEndsAt: new Date(now.getTime() + 5 * 86_400_000),
      now,
    });
    expect(inGrace.lifecycle).toEqual([]);
    const expired = await reconcile(`${SUB}_5`, "past_due", {
      graceEndsAt: new Date(now.getTime() - 1000),
      now,
      eventId: "evt_expired",
    });
    expect(expired.lifecycle).toEqual([`${id}:suspend`]);
    // Rejouer le même événement ne met pas une seconde tâche en file.
    await reconcile(`${SUB}_5`, "past_due", {
      graceEndsAt: new Date(now.getTime() - 1000),
      now,
      eventId: "evt_expired",
    });
    expect(
      await jobsOf("vps.lifecycle", `${id}:suspend:evt_expired`),
    ).toHaveLength(1);
  });

  it("demande la résiliation quand l'abonnement est annulé", async () => {
    const id = await liveInstance(`${SUB}_6`);
    const out = await reconcile(`${SUB}_6`, "canceled", {
      eventId: "evt_cancel",
    });
    expect(out.lifecycle).toEqual([`${id}:terminate`]);
  });
});

export { OrderError };
