import {
  eq,
  jobs,
  proxmoxServers,
  type SubscriptionStatus,
  subscriptions,
  vpsEvents,
  vpsInstances,
  vpsOrders,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BusyError,
  requestReinstall,
  runLifecycle,
  runPowerAction,
  sweep,
} from "./operate.ts";
import { createOrder } from "./orders.ts";
import { provisionOrder } from "./provision.ts";
import { ProxmoxSimulator } from "./proxmox/simulator.ts";
import {
  CUSTOMER_KEY,
  createSimRunner,
  engineDeps,
  paidOrder,
  SIM_TOKEN,
  seedFixture,
} from "./testing.ts";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

const DAY = 86_400_000;

async function active() {
  const sim = new ProxmoxSimulator({
    token: SIM_TOKEN,
    taskPolls: 1,
    agentPolls: 1,
  });
  const s = await sim.start();
  const fx = await seedFixture(t.db, { simPort: s.port });
  const guest = createSimRunner(sim);
  const clock = { now: new Date() };
  const deps = engineDeps(t.db, guest.runner, { now: () => clock.now });
  const orderId = await paidOrder(t.db, fx);
  expect(await provisionOrder(deps, orderId)).toEqual({ outcome: "done" });
  const [inst] = await t.db
    .select()
    .from(vpsInstances)
    .where(eq(vpsInstances.orderId, orderId));
  const [order] = await t.db
    .select()
    .from(vpsOrders)
    .where(eq(vpsOrders.id, orderId));
  if (!inst || !order) throw new Error("fixture");
  const sub = async (
    status: SubscriptionStatus,
    graceEndsAt: Date | null = null,
  ) => {
    await t.db
      .insert(subscriptions)
      .values({
        organizationId: fx.organizationId,
        stripeSubscriptionId: order.stripeSubscriptionId as string,
        stripeCustomerId: "cus_test",
        status,
        graceEndsAt,
      })
      .onConflictDoUpdate({
        target: subscriptions.stripeSubscriptionId,
        set: { status, graceEndsAt },
      });
  };
  const reload = async () =>
    (
      await t.db.select().from(vpsInstances).where(eq(vpsInstances.id, inst.id))
    )[0]!;
  const close = async () => {
    await t.db
      .update(proxmoxServers)
      .set({ state: "offline" })
      .where(eq(proxmoxServers.id, fx.serverId));
    await s.close();
  };
  await sub("active");
  return { sim, fx, guest, deps, clock, orderId, inst, sub, reload, close };
}

describe("démarrer, arrêter, redémarrer", () => {
  it("arrête proprement, redémarre et rejoue sans erreur", async () => {
    const w = await active();
    try {
      await runPowerAction(w.deps, w.inst.id, "stop");
      expect(w.sim.vms.get(w.inst.vmid as number)?.status).toBe("stopped");
      expect((await w.reload()).power).toBe("stopped");
      await runPowerAction(w.deps, w.inst.id, "stop"); // déjà arrêtée : sans effet
      await runPowerAction(w.deps, w.inst.id, "start");
      expect(w.sim.vms.get(w.inst.vmid as number)?.status).toBe("running");
      await runPowerAction(w.deps, w.inst.id, "reboot");
      expect((await w.reload()).power).toBe("running");
      const kinds = (
        await t.db
          .select()
          .from(vpsEvents)
          .where(eq(vpsEvents.instanceId, w.inst.id))
      ).map((e) => e.kind);
      expect(kinds).toEqual(
        expect.arrayContaining(["power_stop", "power_start", "power_reboot"]),
      );
    } finally {
      await w.close();
    }
  });

  it("refuse d'agir sur une instance occupée par un autre worker", async () => {
    const w = await active();
    try {
      await t.db
        .update(vpsInstances)
        .set({ leaseOwner: "autre", leaseUntil: new Date(Date.now() + 60_000) })
        .where(eq(vpsInstances.id, w.inst.id));
      await expect(
        runPowerAction(w.deps, w.inst.id, "stop"),
      ).rejects.toBeInstanceOf(BusyError);
    } finally {
      await w.close();
    }
  });

  it("ne touche pas un VPS suspendu (le client ne contourne pas la suspension)", async () => {
    const w = await active();
    try {
      await w.sub("unpaid");
      await runLifecycle(w.deps, w.inst.id, "suspend");
      const out = await runPowerAction(w.deps, w.inst.id, "start");
      expect(out).toMatchObject({ skipped: "instance suspended" });
      expect(w.sim.vms.get(w.inst.vmid as number)?.status).toBe("stopped");
    } finally {
      await w.close();
    }
  });
});

describe("suspension après échec de paiement (D7)", () => {
  it("garde le service pendant la grâce, suspend après, reprend au paiement", async () => {
    const w = await active();
    try {
      await w.sub("past_due", new Date(w.clock.now.getTime() + 7 * DAY));
      expect(await runLifecycle(w.deps, w.inst.id, "suspend")).toMatchObject({
        done: false,
      });
      expect((await w.reload()).status).toBe("active");

      w.clock.now = new Date(w.clock.now.getTime() + 8 * DAY); // la grâce est écoulée
      expect(await runLifecycle(w.deps, w.inst.id, "suspend")).toEqual({
        done: true,
      });
      expect(await w.reload()).toMatchObject({
        status: "suspended",
        power: "stopped",
      });
      expect(w.sim.vms.get(w.inst.vmid as number)?.status).toBe("stopped");

      await w.sub("active");
      expect(await runLifecycle(w.deps, w.inst.id, "resume")).toEqual({
        done: true,
      });
      expect(await w.reload()).toMatchObject({
        status: "active",
        power: "running",
      });
      expect(w.sim.vms.get(w.inst.vmid as number)?.status).toBe("running");
    } finally {
      await w.close();
    }
  });

  it("ignore un message de suspension devenu périmé (paiement arrivé entre-temps)", async () => {
    const w = await active();
    try {
      expect(await runLifecycle(w.deps, w.inst.id, "suspend")).toMatchObject({
        done: false,
      });
      expect((await w.reload()).status).toBe("active");
    } finally {
      await w.close();
    }
  });
});

describe("résiliation, rétention de 7 jours, suppression", () => {
  it("arrête la VM, la garde 7 jours, puis la supprime (horloge simulée)", async () => {
    const w = await active();
    try {
      await w.sub("canceled");
      expect(await runLifecycle(w.deps, w.inst.id, "terminate")).toEqual({
        done: true,
      });
      const canceled = await w.reload();
      expect(canceled).toMatchObject({ status: "canceled", power: "stopped" });
      expect(canceled.retentionEndsAt?.getTime()).toBe(
        w.clock.now.getTime() + 7 * DAY,
      );
      expect(
        (
          await t.db.select().from(vpsOrders).where(eq(vpsOrders.id, w.orderId))
        )[0]?.status,
      ).toBe("canceled");
      expect(w.sim.vms.has(w.inst.vmid as number)).toBe(true);

      // Pas de suppression avant la fin de la rétention.
      expect(await runLifecycle(w.deps, w.inst.id, "delete")).toMatchObject({
        done: false,
      });
      w.clock.now = new Date(w.clock.now.getTime() + 6 * DAY);
      expect(await runLifecycle(w.deps, w.inst.id, "delete")).toMatchObject({
        done: false,
      });
      expect(w.sim.vms.has(w.inst.vmid as number)).toBe(true);

      w.clock.now = new Date(w.clock.now.getTime() + 2 * DAY);
      expect(await runLifecycle(w.deps, w.inst.id, "delete")).toEqual({
        done: true,
      });
      expect(w.sim.vms.has(w.inst.vmid as number)).toBe(false);
      expect(await w.reload()).toMatchObject({ status: "deleted" });
      // Rejouer ne fait rien.
      expect(await runLifecycle(w.deps, w.inst.id, "delete")).toMatchObject({
        done: false,
      });
    } finally {
      await w.close();
    }
  });

  it("le balayage met en file la suspension et la suppression dues, sans doublon", async () => {
    const w = await active();
    try {
      await w.sub("past_due", new Date(w.clock.now.getTime() - DAY));
      const first = await sweep(w.deps);
      expect(first.lifecycle).toBe(1);
      await sweep(w.deps); // même tranche de 10 minutes : même clé de tâche
      const queued = (await t.db.select().from(jobs)).filter(
        (j) =>
          j.type === "vps.lifecycle" &&
          (j.payload as { instanceId?: string }).instanceId === w.inst.id,
      );
      expect(queued).toHaveLength(1);
      expect(queued[0]?.payload).toMatchObject({ action: "suspend" });
    } finally {
      await w.close();
    }
  });
});

describe("réinstallation avec instantané préalable", () => {
  it("garde l'ancienne VM et son instantané 7 jours, crée une VM neuve avec la même adresse, puis nettoie", async () => {
    const w = await active();
    try {
      const oldVmid = w.inst.vmid as number;
      expect(await requestReinstall(w.deps, w.inst.id, "req-1")).toEqual({
        accepted: true,
      });
      expect(await w.reload()).toMatchObject({
        status: "reinstalling",
        step: "snapshot",
      });
      // Une seconde demande pendant la réinstallation est refusée.
      expect(await requestReinstall(w.deps, w.inst.id, "req-2")).toMatchObject({
        accepted: false,
      });

      expect(await provisionOrder(w.deps, w.orderId)).toEqual({
        outcome: "done",
      });
      const after = await w.reload();
      expect(after).toMatchObject({
        status: "active",
        ipv4: w.inst.ipv4,
        previousVmid: oldVmid,
      });
      expect(after.vmid).not.toBe(oldVmid);
      expect(after.lastSnapshotName).toMatch(/^avant-reinstall-/);

      const old = w.sim.vms.get(oldVmid);
      expect(old).toMatchObject({
        status: "stopped",
        name: `${w.inst.vmName}-old`,
      });
      expect(old?.snapshots.map((s) => s.name)).toContain(
        after.lastSnapshotName,
      );
      expect(old?.config.net0).toBeUndefined();
      expect(old?.config.ipconfig0).toBeUndefined();
      expect(w.sim.vms.get(after.vmid as number)).toMatchObject({
        status: "running",
        name: w.inst.vmName,
      });
      expect(w.guest.installs).toHaveLength(2);

      // Rétention : pas de suppression avant 7 jours, puis suppression.
      expect(await runLifecycle(w.deps, w.inst.id, "purge_old")).toMatchObject({
        done: false,
      });
      expect(w.sim.vms.has(oldVmid)).toBe(true);
      w.clock.now = new Date(w.clock.now.getTime() + 8 * DAY);
      expect(await runLifecycle(w.deps, w.inst.id, "purge_old")).toEqual({
        done: true,
      });
      expect(w.sim.vms.has(oldVmid)).toBe(false);
      expect((await w.reload()).previousVmid).toBeNull();
    } finally {
      await w.close();
    }
  });

  it("une réinstallation interrompue reprend sans refaire l'instantané ni perdre l'ancienne VM", async () => {
    const w = await active();
    try {
      const oldVmid = w.inst.vmid as number;
      await requestReinstall(w.deps, w.inst.id, "req-3");
      w.guest.state.failNext = 1;
      await expect(
        provisionOrder(w.deps, w.orderId, { attempt: 1, maxAttempts: 3 }),
      ).rejects.toThrow();
      expect(
        await provisionOrder(w.deps, w.orderId, { attempt: 2, maxAttempts: 3 }),
      ).toEqual({ outcome: "done" });
      expect(w.sim.vms.get(oldVmid)?.snapshots).toHaveLength(1);
      expect(w.sim.callsTo("POST", `/qemu/${oldVmid}/snapshot`)).toHaveLength(
        1,
      );
    } finally {
      await w.close();
    }
  });
});

describe("balayage : commandes impayées et paiements tardifs (I3)", () => {
  async function world() {
    const sim = new ProxmoxSimulator({ token: SIM_TOKEN });
    const s = await sim.start();
    const fx = await seedFixture(t.db, { simPort: s.port });
    const clock = { now: new Date() };
    const deps = engineDeps(t.db, createSimRunner(sim).runner, {
      now: () => clock.now,
    });
    const order = async (subscriptionId: string | null) => {
      const { order } = await createOrder(t.db, {
        organizationId: fx.organizationId,
        idempotencyKey: `sweep-${Math.random()}`,
        planCode: fx.planCode,
        appCode: fx.appCode,
        term: "month",
        sshPublicKey: CUSTOMER_KEY,
        maxPerOrganization: 99,
      });
      await t.db
        .update(vpsOrders)
        .set({
          stripeSubscriptionId: subscriptionId,
          createdAt: new Date(clock.now.getTime() - 25 * 3_600_000),
        })
        .where(eq(vpsOrders.id, order.id));
      return order.id;
    };
    const status = async (id: string) =>
      (await t.db.select().from(vpsOrders).where(eq(vpsOrders.id, id)))[0]
        ?.status;
    const server = (state: "ready" | "offline") =>
      t.db
        .update(proxmoxServers)
        .set({ state })
        .where(eq(proxmoxServers.id, fx.serverId));
    const close = async () => {
      await server("offline");
      await s.close();
    };
    return { fx, deps, clock, order, status, server, close };
  }

  it("filet de 24 h : expire seulement une commande sans abonnement relié ; Stripe fait foi dès que le Checkout est terminé", async () => {
    const w = await world();
    try {
      const abandoned = await w.order(null);
      const processing = await w.order(`sub_proc_${Math.random()}`);
      const out = await sweep(w.deps);
      expect(out.expired).toBeGreaterThanOrEqual(1);
      expect(await w.status(abandoned)).toBe("expired");
      expect(await w.status(processing)).toBe("awaiting_payment");
    } finally {
      await w.close();
    }
  });

  it("reprend une commande « payée après expiration » dès que la capacité revient et que l'abonnement est actif", async () => {
    const w = await world();
    try {
      const subId = `sub_late_${Math.random()}`;
      const id = await w.order(subId);
      await t.db
        .update(vpsOrders)
        .set({ status: "late_payment" })
        .where(eq(vpsOrders.id, id));
      await t.db.insert(subscriptions).values({
        organizationId: w.fx.organizationId,
        stripeSubscriptionId: subId,
        stripeCustomerId: "cus_late",
        status: "active",
      });
      await w.server("offline");
      await sweep(w.deps);
      expect(await w.status(id)).toBe("late_payment"); // toujours sans capacité
      await w.server("ready");
      await sweep(w.deps);
      expect(await w.status(id)).toBe("paid");
      await sweep(w.deps); // rejeu : une seule tâche de provisionnement
      const queued = (await t.db.select().from(jobs)).filter(
        (j) =>
          j.type === "vps.provision" && JSON.stringify(j.payload).includes(id),
      );
      expect(queued).toHaveLength(1);
    } finally {
      await w.close();
    }
  });
});
