import {
  eq,
  jobs,
  proxmoxServers,
  vpsEvents,
  vpsInstances,
  vpsOrders,
} from "@nexora/db";
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
  onVpsCheckoutExpired,
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
    // Un VPS offert par l'équipe ne passe pas par Stripe : aucun prix Stripe n'est exigé.
    const gift = await createOrder(
      t.db,
      input({ planCode: "gros", allowUnsynced: true }),
    );
    expect(gift.created).toBe(true);
    expect(gift.order.status).toBe("awaiting_payment");
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

describe("paiement confirmé APRÈS l'expiration de la commande (I3)", () => {
  async function expiredOrder(subId: string) {
    const orderId = await fresh(subId);
    await t.db
      .update(vpsOrders)
      .set({ status: "expired" })
      .where(eq(vpsOrders.id, orderId));
    return orderId;
  }
  const orderOf = async (id: string) =>
    (await t.db.select().from(vpsOrders).where(eq(vpsOrders.id, id)))[0];
  const eventsOf = async (orderId: string, kind: string) =>
    (
      await t.db.select().from(vpsEvents).where(eq(vpsEvents.orderId, orderId))
    ).filter((e) => e.kind === kind);
  async function withoutCapacity<T>(fn: () => Promise<T>): Promise<T> {
    await t.db
      .update(proxmoxServers)
      .set({ state: "offline" })
      .where(eq(proxmoxServers.id, fx.serverId));
    try {
      return await fn();
    } finally {
      await t.db
        .update(proxmoxServers)
        .set({ state: "ready" })
        .where(eq(proxmoxServers.id, fx.serverId));
    }
  }

  it("avec de la capacité : la commande est REPRISE (payée, provisionnée une seule fois), sans doublon au rejeu", async () => {
    const orderId = await expiredOrder(`${SUB}_late1`);
    const out = await reconcile(`${SUB}_late1`, "active", { eventId: "evt_a" });
    expect(out.provisioned).toEqual([orderId]);
    expect(await orderOf(orderId)).toMatchObject({ status: "paid" });
    expect((await orderOf(orderId))?.paidAt).not.toBeNull();
    expect(await jobsOf("vps.provision", orderId)).toHaveLength(1);
    expect(await eventsOf(orderId, "resumed_after_expiry")).toHaveLength(1);
    // Rejeu : même événement, puis un autre événement de l'abonnement.
    await reconcile(`${SUB}_late1`, "active", { eventId: "evt_a" });
    await reconcile(`${SUB}_late1`, "active", { eventId: "evt_b" });
    expect(await jobsOf("vps.provision", orderId)).toHaveLength(1);
    expect(await eventsOf(orderId, "resumed_after_expiry")).toHaveLength(1);
    expect(await orderOf(orderId)).toMatchObject({ status: "paid" });
  });

  it("sans capacité : « late_payment », alerte de l'opérateur, aucune instance, aucune tâche de provisionnement, rejouable", async () => {
    const orderId = await expiredOrder(`${SUB}_late2`);
    await withoutCapacity(async () => {
      const out = await reconcile(`${SUB}_late2`, "active", {
        eventId: "evt_c",
      });
      expect(out.provisioned).toEqual([]);
      expect(out.held).toEqual([orderId]);
      await reconcile(`${SUB}_late2`, "active", { eventId: "evt_c" });
      await reconcile(`${SUB}_late2`, "active", { eventId: "evt_d" });
    });
    expect(await orderOf(orderId)).toMatchObject({ status: "late_payment" });
    expect(await jobsOf("vps.provision", orderId)).toHaveLength(0);
    const alerts = (await t.db.select().from(jobs)).filter(
      (j) =>
        j.type === "vps.alert" && JSON.stringify(j.payload).includes(orderId),
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.payload).toMatchObject({ reason: "late_payment" });
    expect(await eventsOf(orderId, "paid_after_expiry")).toHaveLength(1);
    expect(
      await t.db
        .select()
        .from(vpsInstances)
        .where(eq(vpsInstances.orderId, orderId)),
    ).toHaveLength(0);
  });

  it("la capacité revient : le paiement suivant reprend la commande en attente, sans nouvelle alerte", async () => {
    const orderId = await expiredOrder(`${SUB}_late3`);
    await withoutCapacity(() => reconcile(`${SUB}_late3`, "active"));
    expect(await orderOf(orderId)).toMatchObject({ status: "late_payment" });
    await reconcile(`${SUB}_late3`, "active", { eventId: "evt_e" });
    expect(await orderOf(orderId)).toMatchObject({ status: "paid" });
    expect(await jobsOf("vps.provision", orderId)).toHaveLength(1);
  });

  it("un paiement non confirmé ne reprend rien ; une résiliation clôt la commande en attente", async () => {
    const orderId = await expiredOrder(`${SUB}_late4`);
    await reconcile(`${SUB}_late4`, "incomplete");
    expect(await orderOf(orderId)).toMatchObject({ status: "expired" });
    const held = await expiredOrder(`${SUB}_late5`);
    await withoutCapacity(() => reconcile(`${SUB}_late5`, "active"));
    await reconcile(`${SUB}_late5`, "canceled", { eventId: "evt_f" });
    expect(await orderOf(held)).toMatchObject({ status: "canceled" });
  });
});

describe("expiration d'une session Checkout (I3 : Stripe fait foi)", () => {
  it("`checkout.session.expired` fait expirer la commande en attente, une seule fois", async () => {
    const { order } = await createOrder(t.db, input());
    const run = () =>
      t.db.transaction((tx) =>
        onVpsCheckoutExpired(tx, {
          orderId: order.id,
          organizationId: fx.organizationId,
          sessionId: "cs_expired_1",
        }),
      );
    expect(await run()).toBe(true);
    expect(await run()).toBe(false);
    const [row] = await t.db
      .select()
      .from(vpsOrders)
      .where(eq(vpsOrders.id, order.id));
    expect(row?.status).toBe("expired");
    const kinds = (
      await t.db.select().from(vpsEvents).where(eq(vpsEvents.orderId, order.id))
    ).filter((e) => e.kind === "checkout_expired");
    expect(kinds).toHaveLength(1);
  });

  it("n'expire ni une commande déjà payée ni celle d'une autre organisation", async () => {
    const { order } = await createOrder(t.db, input());
    await t.db
      .update(vpsOrders)
      .set({ status: "paid" })
      .where(eq(vpsOrders.id, order.id));
    expect(
      await t.db.transaction((tx) =>
        onVpsCheckoutExpired(tx, {
          orderId: order.id,
          organizationId: fx.organizationId,
          sessionId: "cs_expired_2",
        }),
      ),
    ).toBe(false);
    const other = await createOrder(t.db, input());
    expect(
      await t.db.transaction((tx) =>
        onVpsCheckoutExpired(tx, {
          orderId: other.order.id,
          organizationId: "org_inconnue",
          sessionId: "cs_expired_3",
        }),
      ),
    ).toBe(false);
    expect(
      (
        await t.db
          .select()
          .from(vpsOrders)
          .where(eq(vpsOrders.id, other.order.id))
      )[0]?.status,
    ).toBe("awaiting_payment");
  });
});

describe("expiration d'une ancienne session Checkout (I3)", () => {
  it("l'expiration d'une ANCIENNE session ne fait pas expirer la commande dont une session plus récente est ouverte", async () => {
    const { order } = await createOrder(t.db, input());
    await t.db
      .update(vpsOrders)
      .set({ stripeCheckoutSessionId: "cs_recente" })
      .where(eq(vpsOrders.id, order.id));
    const old = await t.db.transaction((tx) =>
      onVpsCheckoutExpired(tx, {
        orderId: order.id,
        organizationId: fx.organizationId,
        sessionId: "cs_ancienne",
      }),
    );
    expect(old).toBe(false);
    const current = await t.db.transaction((tx) =>
      onVpsCheckoutExpired(tx, {
        orderId: order.id,
        organizationId: fx.organizationId,
        sessionId: "cs_recente",
      }),
    );
    expect(current).toBe(true);
  });

  it("n'expire pas une commande dont l'abonnement est déjà relié (prélèvement en cours de confirmation)", async () => {
    const orderId = await fresh(`${SUB}_exp_linked`);
    const done = await t.db.transaction((tx) =>
      onVpsCheckoutExpired(tx, {
        orderId,
        organizationId: fx.organizationId,
        sessionId: "cs_x",
      }),
    );
    expect(done).toBe(false);
    expect(
      (await t.db.select().from(vpsOrders).where(eq(vpsOrders.id, orderId)))[0]
        ?.status,
    ).toBe("awaiting_payment");
  });
});

export { OrderError };
