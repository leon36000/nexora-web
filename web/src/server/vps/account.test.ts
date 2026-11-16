import { randomBytes } from "node:crypto";
import {
  eq,
  osTemplates,
  subscriptions,
  type VpsInstanceStatus,
  vpsEvents,
  vpsInstances,
  vpsOrders,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createOrder, recordVpsEvent } from "@nexora/vps";
import {
  CUSTOMER_KEY,
  type Fixture,
  newOrg,
  seedFixture,
} from "@nexora/vps/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_VPS_EVENT_LIMIT,
  loadAccountVps,
  publicEventMessage,
} from "./account";

let t: TestDatabase;
let fx: Fixture;

beforeAll(async () => {
  t = await createTestDatabase();
  fx = await seedFixture(t.db, { simPort: 8006, withPorts: true });
});
afterAll(async () => {
  await t.drop();
});

const uid = () => randomBytes(4).toString("hex");
let numeroInstance = 0;

async function order(
  organizationId: string,
  over: Partial<typeof vpsOrders.$inferInsert> = {},
) {
  const { order: o } = await createOrder(t.db, {
    organizationId,
    idempotencyKey: `acct-${uid()}`,
    planCode: fx.planCode,
    appCode: fx.appCode,
    term: "month",
    sshPublicKey: CUSTOMER_KEY,
    maxPerOrganization: 99,
  });
  if (Object.keys(over).length)
    await t.db.update(vpsOrders).set(over).where(eq(vpsOrders.id, o.id));
  return o;
}

async function instance(
  organizationId: string,
  status: VpsInstanceStatus,
  over: Partial<typeof vpsInstances.$inferInsert> = {},
  orderOver: Partial<typeof vpsOrders.$inferInsert> = {},
) {
  const o = await order(organizationId, {
    status: "fulfilled",
    stripeSubscriptionId: `sub_${uid()}`,
    ...orderOver,
  });
  const numero = numeroInstance++;
  const [row] = await t.db
    .insert(vpsInstances)
    .values({
      orderId: o.id,
      organizationId,
      vcpu: 2,
      ramMb: 4096,
      diskGb: 40,
      planCode: fx.planCode,
      appCode: fx.appCode,
      appVersion: "1.2.3",
      catalogVersionId: fx.catalogVersionId,
      vmName: `nx-${o.id.slice(0, 8)}`,
      serverId: fx.serverId,
      vmid: 10_000 + numero,
      ipv4: `10.20.${Math.floor(numero / 254)}.${(numero % 254) + 1}`,
      status,
      step: "done",
      power: "running",
      leaseOwner: "worker-secret-owner",
      lastError: "ssh: connexion refusée vers 10.9.9.9 avec jeton interne",
      sshHostKeyFingerprint: "SHA256:hostkeyfingerprint",
      ...over,
    })
    .returning();
  if (!row) throw new Error("instance non créée");
  return { inst: row, order: o };
}

describe("loadAccountVps", () => {
  it("crée des fixtures distinctes même si le générateur aléatoire répète sa valeur", async () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const org = await newOrg(t.db);
      const premier = await instance(org, "active");
      const second = await instance(org, "active");
      expect(premier.inst.vmid).not.toBe(second.inst.vmid);
      expect(premier.inst.ipv4).not.toBe(second.inst.ipv4);
    } finally {
      random.mockRestore();
    }
  });
  it("renvoie les VPS de l'organisation seulement, avec plan, application, accès et dates", async () => {
    const a = await newOrg(t.db);
    const b = await newOrg(t.db);
    const mine = await instance(a, "active", {
      activatedAt: new Date("2026-10-01T12:00:00Z"),
    });
    await instance(b, "active");

    const data = await loadAccountVps(t.db, a);
    expect(data.instances).toHaveLength(1);
    const i = data.instances[0];
    expect(i).toMatchObject({
      id: mine.inst.id,
      status: "active",
      step: "done",
      power: "running",
      pendingAction: null,
      plan: {
        code: fx.planCode,
        name: "Plan d'essai",
        vcpu: 2,
        ramMb: 4096,
        diskGb: 40,
      },
      app: { code: fx.appCode, name: "Application d'essai", version: "1.2.3" },
      ipv4: mine.inst.ipv4,
      region: "quebec",
      hostname: mine.order.hostname,
      sshUser: "debian",
      sshKeyFingerprint: mine.order.sshKeyFingerprint,
      hostKeyFingerprint: "SHA256:hostkeyfingerprint",
    });
    expect(i?.activatedAt?.toISOString()).toBe("2026-10-01T12:00:00.000Z");
    expect(i?.billing).toMatchObject({
      term: "month",
      priceCents: 1500,
      currency: "cad",
      nextDueAt: null,
      cancelAtPeriodEnd: false,
      subscriptionStatus: null,
    });
    // Ports publics du catalogue : le client en a besoin pour son tunnel SSH.
    expect(i?.ports.map((p) => [p.port, p.exposure])).toEqual([
      [3001, "tunnel"],
      [8443, "public"],
    ]);
    expect((await loadAccountVps(t.db, b)).instances[0]?.id).not.toBe(
      mine.inst.id,
    );
  });

  it("l'utilisateur SSH vient du gabarit du serveur (repli : debian)", async () => {
    const a = await newOrg(t.db);
    await t.db
      .update(osTemplates)
      .set({ ciUser: "ubuntu" })
      .where(eq(osTemplates.id, fx.templateId));
    try {
      const { inst } = await instance(a, "active");
      const ok = (await loadAccountVps(t.db, a)).instances.find(
        (x) => x.id === inst.id,
      );
      expect(ok?.sshUser).toBe("ubuntu");
    } finally {
      await t.db
        .update(osTemplates)
        .set({ ciUser: "debian" })
        .where(eq(osTemplates.id, fx.templateId));
    }
    // Sans serveur attribué, ou version de catalogue illisible : « debian ».
    const c = await newOrg(t.db);
    await instance(c, "provisioning", {
      serverId: null,
      vmid: null,
      ipv4: null,
      step: "placement",
    });
    expect((await loadAccountVps(t.db, c)).instances[0]?.sshUser).toBe(
      "debian",
    );
    const d = await newOrg(t.db);
    await instance(d, "active", {
      catalogVersionId: "00000000-0000-4000-8000-000000000000",
    });
    const broken = (await loadAccountVps(t.db, d)).instances[0];
    expect(broken?.sshUser).toBe("debian");
    expect(broken?.plan.name).toBe(fx.planCode);
    expect(broken?.app.name).toBe(fx.appCode);
  });

  it("les VPS vivants passent avant les supprimés et les échoués, du plus récent au plus ancien", async () => {
    const a = await newOrg(t.db);
    const deleted = await instance(a, "deleted", {
      deletedAt: new Date(),
      ipv4: null,
    });
    const first = await instance(a, "active");
    const failed = await instance(a, "failed", { step: "install", ipv4: null });
    const second = await instance(a, "suspended", { suspendedAt: new Date() });
    // Vieux supprimé : plus affiché.
    const old = await instance(a, "deleted", {
      deletedAt: new Date(),
      ipv4: null,
    });
    await t.db
      .update(vpsInstances)
      .set({ createdAt: new Date(Date.now() - 200 * 86_400_000) })
      .where(eq(vpsInstances.id, old.inst.id));

    const ids = (await loadAccountVps(t.db, a)).instances.map((i) => i.id);
    expect(ids).toEqual([
      second.inst.id,
      first.inst.id,
      failed.inst.id,
      deleted.inst.id,
    ]);
  });

  it("prochaine échéance et résiliation demandée viennent de l'abonnement relié à la commande", async () => {
    const a = await newOrg(t.db);
    const subId = `sub_${uid()}`;
    const end = new Date("2026-11-15T00:00:00Z");
    await t.db.insert(subscriptions).values({
      organizationId: a,
      stripeSubscriptionId: subId,
      stripeCustomerId: `cus_${uid()}`,
      status: "active",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: end,
    });
    await instance(a, "active", {}, { stripeSubscriptionId: subId });
    const i = (await loadAccountVps(t.db, a)).instances[0];
    expect(i?.billing.cancelAtPeriodEnd).toBe(true);
    expect(i?.billing.nextDueAt?.toISOString()).toBe(end.toISOString());
    expect(i?.billing.subscriptionStatus).toBe("active");
  });

  it("n'utilise pas l'abonnement d'une autre organisation même avec le même identifiant Stripe", async () => {
    const a = await newOrg(t.db);
    const other = await newOrg(t.db);
    const subId = `sub_${uid()}`;
    await t.db.insert(subscriptions).values({
      organizationId: other,
      stripeSubscriptionId: subId,
      stripeCustomerId: `cus_${uid()}`,
      status: "active",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date("2027-01-01T00:00:00Z"),
    });
    await instance(a, "active", {}, { stripeSubscriptionId: subId });
    const i = (await loadAccountVps(t.db, a)).instances[0];
    expect(i?.billing.subscriptionStatus).toBeNull();
    expect(i?.billing.nextDueAt).toBeNull();
  });

  it("journal : 15 derniers événements, récents d'abord, ceux de la commande inclus, une autre organisation exclue", async () => {
    const a = await newOrg(t.db);
    const other = await newOrg(t.db);
    const { inst, order: o } = await instance(a, "active");
    for (let n = 0; n < 20; n++)
      await t.db.insert(vpsEvents).values({
        organizationId: a,
        orderId: o.id,
        instanceId: inst.id,
        actor: "worker",
        kind: "power_reboot",
        message: `n°${n}`,
        createdAt: new Date(Date.UTC(2090, 9, 1, 0, n)),
      });
    // Événement de commande seulement (sans instance) : il fait partie de l'histoire du VPS.
    await t.db.insert(vpsEvents).values({
      organizationId: a,
      orderId: o.id,
      actor: "stripe",
      kind: "paid",
      message: "paiement confirmé",
      createdAt: new Date(Date.UTC(2090, 9, 2)),
    });
    // Événement d'une autre organisation qui vise la même instance : ignoré.
    await t.db.insert(vpsEvents).values({
      organizationId: other,
      instanceId: inst.id,
      actor: "operator",
      kind: "paid",
      message: "ne doit pas apparaître",
      createdAt: new Date(Date.UTC(2090, 9, 3)),
    });
    const events = (await loadAccountVps(t.db, a)).instances[0]?.events ?? [];
    expect(events).toHaveLength(ACCOUNT_VPS_EVENT_LIMIT);
    expect(events[0]).toMatchObject({ kind: "paid", actor: "stripe" });
    expect(events.map((e) => e.message)).not.toContain(
      "ne doit pas apparaître",
    );
    expect(events.map((e) => e.createdAt.getTime())).toEqual(
      [...events.map((e) => e.createdAt.getTime())].sort((x, y) => y - x),
    );
  });

  it("messages techniques retirés du journal, secrets nettoyés", async () => {
    const a = await newOrg(t.db);
    const { inst, order: o } = await instance(a, "failed", { step: "install" });
    const base = { organizationId: a, orderId: o.id, instanceId: inst.id };
    await recordVpsEvent(t.db, {
      ...base,
      actor: "worker",
      kind: "step_error",
      message: "ssh: refus sur 10.1.2.3 vmid 12345",
    });
    await recordVpsEvent(t.db, {
      ...base,
      actor: "worker",
      kind: "provision_failed",
      message: "capacité Proxmox srv-interne",
    });
    await recordVpsEvent(t.db, {
      ...base,
      actor: "system",
      kind: "note",
      message: "Authorization: Bearer abcDEF123456789xyz",
    });
    const events = (await loadAccountVps(t.db, a)).instances[0]?.events ?? [];
    const by = (kind: string) => events.find((e) => e.kind === kind);
    expect(by("step_error")?.message).toBe("");
    expect(by("provision_failed")?.message).toBe("");
    expect(by("note")?.message).not.toContain("abcDEF123456789xyz");
  });

  it("n'expose ni bail, ni vmid, ni serveur, ni erreur brute, ni clé SSH complète, ni courriel", async () => {
    const a = await newOrg(t.db);
    const { inst, order: o } = await instance(a, "failed", { step: "install" });
    await t.db.insert(vpsEvents).values({
      organizationId: a,
      orderId: o.id,
      instanceId: inst.id,
      actor: "worker",
      kind: "paid",
      message: "ok",
      detail: { vmid: inst.vmid, secret: "detail-interne" },
    });
    await t.db
      .update(vpsOrders)
      .set({ createdBy: "user_secret_id" })
      .where(eq(vpsOrders.id, o.id));
    const data = await loadAccountVps(t.db, a);
    const text = JSON.stringify(data);
    for (const forbidden of [
      "worker-secret-owner",
      "leaseOwner",
      "leaseUntil",
      "vmid",
      "vmName",
      `nx-${o.id.slice(0, 8)}`,
      fx.serverId,
      "serverId",
      "lastError",
      "connexion refusée",
      "jeton interne",
      "detail-interne",
      CUSTOMER_KEY,
      CUSTOMER_KEY.split(" ")[1] as string,
      "user_secret_id",
      "sshPublicKey",
      "@",
      "previousVmid",
      "tokenRef",
      "installScript",
    ])
      expect(text, forbidden).not.toContain(forbidden);
    expect(Object.keys(data.instances[0] ?? {}).sort()).toEqual(
      [
        "activatedAt",
        "app",
        "billing",
        "canceledAt",
        "createdAt",
        "deletedAt",
        "events",
        "hostKeyFingerprint",
        "hostname",
        "id",
        "ipv4",
        "pendingAction",
        "plan",
        "ports",
        "power",
        "region",
        "retentionEndsAt",
        "sshKeyFingerprint",
        "sshUser",
        "status",
        "step",
        "suspendedAt",
      ].sort(),
    );
  });

  it("commandes sans instance : paiement attendu, payée, expirée ; les anciennes échouées disparaissent ; l'autre organisation n'y est pas", async () => {
    const a = await newOrg(t.db);
    const b = await newOrg(t.db);
    const waiting = await order(a);
    const expired = await order(a, { status: "expired" });
    const staleFailed = await order(a, {
      status: "failed",
      failureReason: "interne",
    });
    await t.db
      .update(vpsOrders)
      .set({ createdAt: new Date(Date.now() - 90 * 86_400_000) })
      .where(eq(vpsOrders.id, staleFailed.id));
    await order(b);
    await instance(a, "active"); // sa commande a une instance : pas dans la liste

    const data = await loadAccountVps(t.db, a);
    expect(data.orders.map((o) => [o.id, o.status])).toEqual([
      [expired.id, "expired"],
      [waiting.id, "awaiting_payment"],
    ]);
    expect(data.orders[1]).toMatchObject({
      planCode: fx.planCode,
      planName: "Plan d'essai",
      appName: "Application d'essai",
      term: "month",
      priceCents: 1500,
    });
    expect(JSON.stringify(data.orders)).not.toContain("interne");
    expect(Object.keys(data.orders[0] ?? {}).sort()).toEqual(
      [
        "appCode",
        "appName",
        "createdAt",
        "currency",
        "hostname",
        "id",
        "planCode",
        "planName",
        "priceCents",
        "region",
        "status",
        "term",
      ].sort(),
    );
  });

  it("une organisation sans VPS : listes vides", async () => {
    const a = await newOrg(t.db);
    expect(await loadAccountVps(t.db, a)).toEqual({
      instances: [],
      orders: [],
    });
  });
});

describe("publicEventMessage", () => {
  it("vide pour les types techniques, nettoie et borne les autres", () => {
    expect(publicEventMessage("step_error", "boom")).toBe("");
    expect(publicEventMessage("placed", "serveur srv-1 retenu")).toBe("");
    expect(publicEventMessage("power_stop", "VPS arrêté")).toBe("VPS arrêté");
    expect(publicEventMessage("x", "a".repeat(500))).toHaveLength(200);
    expect(publicEventMessage("x", "a\n\n  b")).toBe("a b");
  });
});
