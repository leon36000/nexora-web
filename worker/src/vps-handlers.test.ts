import {
  enqueue,
  eq,
  jobs,
  proxmoxServers,
  vpsInstances,
  vpsOrders,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { CLOUD_IMAGES, connectServer, startSetup } from "@nexora/vps";
import { ProxmoxSimulator } from "@nexora/vps/simulator";
import {
  createSimRunner,
  engineDeps,
  paidOrder,
  SIM_TOKEN,
  seedFixture,
} from "@nexora/vps/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { HandlerRegistry } from "./registry.ts";
import { registerVpsHandlers } from "./vps-handlers.ts";
import { Worker } from "./worker.ts";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

const silent = createLogger({ name: "test", sink: () => {} });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => Promise<boolean>, ms = 20_000) {
  const start = Date.now();
  while (!(await cond())) {
    if (Date.now() - start > ms) throw new Error("délai dépassé");
    await sleep(30);
  }
}

describe("tâches VPS exécutées par le vrai worker", () => {
  it("deux workers consomment la file : une commande payée devient un VPS actif, une seule fois, avec reprise par tâche de continuation", async () => {
    const sim = new ProxmoxSimulator({
      token: SIM_TOKEN,
      taskPolls: 2,
      agentPolls: 6,
    });
    const s = await sim.start();
    try {
      const fx = await seedFixture(t.db, { simPort: s.port });
      const guest = createSimRunner(sim);
      // Budget minuscule : le provisionnement doit passer par des tâches de continuation.
      const mk = () =>
        new Worker({
          db: t.db,
          registry: registerVpsHandlers(
            new HandlerRegistry(),
            engineDeps(t.db, guest.runner, {
              settings: { budgetMs: 5, agentRetryMs: 30 },
            }),
          ),
          logger: silent,
          concurrency: 3,
          pollIntervalMs: 20,
        });
      const workers = [mk(), mk()];
      for (const w of workers) w.start();
      const orderId = await paidOrder(t.db, fx);
      // Même tâche demandée plusieurs fois (événements Stripe répétés) : une seule existe.
      const key = `vps-provision:${orderId}`;
      await Promise.all(
        Array.from({ length: 4 }, () =>
          enqueue(t.db, {
            type: "vps.provision",
            payload: { orderId },
            idempotencyKey: key,
            maxAttempts: 6,
          }),
        ),
      );
      await until(async () => {
        const [i] = await t.db
          .select()
          .from(vpsInstances)
          .where(eq(vpsInstances.orderId, orderId));
        return i?.status === "active";
      });
      for (const w of workers) await w.stop(5_000);
      expect(sim.cloneRequests).toBe(1);
      expect(guest.installs).toHaveLength(1);
      const all = (await t.db.select().from(jobs)).filter(
        (j) => j.type === "vps.provision",
      );
      expect(all.filter((j) => j.idempotencyKey === key)).toHaveLength(1);
      expect(all.length).toBeGreaterThan(1); // continuations
      expect(all.every((j) => j.status === "succeeded")).toBe(true);
    } finally {
      await s.close();
    }
  });
});

describe("alerte de l'opérateur (vps.alert)", () => {
  it("un paiement reçu après l'expiration, sans capacité, dit qu'aucune VM n'existe et qu'il n'y a aucun remboursement automatique", async () => {
    const sim = new ProxmoxSimulator({ token: SIM_TOKEN });
    const s = await sim.start();
    try {
      const fx = await seedFixture(t.db, { simPort: s.port });
      const orderId = await paidOrder(t.db, fx);
      await t.db
        .update(vpsOrders)
        .set({ status: "late_payment" })
        .where(eq(vpsOrders.id, orderId));
      const sent: { subject: string; text: string }[] = [];
      const registry = registerVpsHandlers(
        new HandlerRegistry(),
        engineDeps(t.db, createSimRunner(sim).runner),
        {
          alertTo: "operateur@example.test",
          mailer: {
            async send(m: { subject: string; text: string }) {
              sent.push(m);
            },
          } as never,
        },
      );
      const handler = registry.get("vps.alert");
      await handler?.(
        {
          id: "j",
          type: "vps.alert",
          payload: { orderId, reason: "late_payment" },
          attempt: 1,
          maxAttempts: 1,
        },
        { log: silent, signal: new AbortController().signal },
      );
      expect(sent).toHaveLength(1);
      expect(sent[0]?.subject).toContain("Paiement reçu après expiration");
      expect(sent[0]?.text).toContain("Aucune VM");
      expect(sent[0]?.text).toContain("Aucun remboursement automatique");
      expect(sent[0]?.text).not.toContain("capacité : brancher");
    } finally {
      await s.close();
    }
  });
});

describe("tâche longue : le bail de la file est renouvelé (I4)", () => {
  // Les baux (file et instance) passent de 5 min / 240 s à 600 ms : une installation de 2,4 s
  // dure quatre fois le bail, comme les 15 minutes d'une vraie installation face aux 5 minutes de la file.
  const LEASE_MS = 600;
  const slow = (
    base: ReturnType<typeof createSimRunner>["runner"],
    ms: number,
    failWith?: Error,
  ): typeof base => ({
    ...base,
    async run(input) {
      await sleep(ms);
      if (failWith) throw failWith;
      return base.run(input);
    },
  });
  // Les serveurs simulés des tests précédents sont fermés : on les met hors ligne pour que le placement
  // ne les choisisse jamais.
  beforeEach(async () => {
    await t.db.update(proxmoxServers).set({ state: "offline" });
  });
  const lockedAt = async (id: string) =>
    (await t.db.select().from(jobs).where(eq(jobs.id, id)))[0]?.lockedAt;

  it("deux workers : l'installation de plus de 5 minutes (simulée) n'est ni reprise ni relancée en parallèle", async () => {
    const sim = new ProxmoxSimulator({ token: SIM_TOKEN });
    const s = await sim.start();
    const workers: Worker[] = [];
    try {
      const fx = await seedFixture(t.db, { simPort: s.port });
      const guest = createSimRunner(sim);
      const mk = () =>
        new Worker({
          db: t.db,
          registry: registerVpsHandlers(
            new HandlerRegistry(),
            engineDeps(t.db, slow(guest.runner, 2_400), {
              settings: { leaseMs: LEASE_MS },
            }),
          ),
          logger: silent,
          concurrency: 2,
          pollIntervalMs: 20,
          leaseMs: LEASE_MS,
        });
      workers.push(mk(), mk());
      for (const w of workers) w.start();
      const orderId = await paidOrder(t.db, fx);
      const queued = await enqueue(t.db, {
        type: "vps.provision",
        payload: { orderId },
        idempotencyKey: `vps-provision:${orderId}`,
        maxAttempts: 6,
      });
      await until(async () => {
        const [i] = await t.db
          .select()
          .from(vpsInstances)
          .where(eq(vpsInstances.orderId, orderId));
        return i?.status === "active";
      });
      for (const w of workers) await w.stop(5_000);
      expect(guest.installs).toHaveLength(1);
      expect(sim.cloneRequests).toBe(1);
      const [job] = await t.db
        .select()
        .from(jobs)
        .where(eq(jobs.id, queued.id));
      expect(job).toMatchObject({ status: "succeeded", attempts: 1 });
    } finally {
      for (const w of workers) await w.stop(5_000);
      await s.close();
    }
  });

  it("le bail de la tâche est rendu à la fin, réussite ou erreur : plus aucun battement ensuite", async () => {
    const sim = new ProxmoxSimulator({ token: SIM_TOKEN });
    const s = await sim.start();
    try {
      const fx = await seedFixture(t.db, { simPort: s.port });
      const guest = createSimRunner(sim);
      const run = async (runner: typeof guest.runner, attempt: number) => {
        const orderId = await paidOrder(t.db, fx);
        const job = await enqueue(t.db, {
          type: "vps.provision",
          payload: { orderId },
          idempotencyKey: `vps-provision:${orderId}`,
          maxAttempts: 3,
        });
        const handler = registerVpsHandlers(
          new HandlerRegistry(),
          engineDeps(t.db, runner, { settings: { leaseMs: 300 } }),
        ).get("vps.provision");
        const done = handler?.(
          {
            id: job.id,
            type: "vps.provision",
            payload: { orderId },
            attempt,
            maxAttempts: 3,
          },
          { log: silent, signal: new AbortController().signal },
        );
        await sleep(500);
        const mid = await lockedAt(job.id); // battement pendant l'exécution
        const outcome = await done?.then(
          () => "ok",
          () => "erreur",
        );
        await t.db
          .update(jobs)
          .set({ lockedAt: null })
          .where(eq(jobs.id, job.id));
        await sleep(450); // plus de deux battements : aucun ne doit repartir
        return { mid, outcome, after: await lockedAt(job.id) };
      };
      const ok = await run(slow(guest.runner, 900), 1);
      expect(ok.outcome).toBe("ok");
      expect(ok.mid).not.toBeNull();
      expect(ok.after).toBeNull();
      const ko = await run(
        slow(guest.runner, 900, new Error("ssh : coupure")),
        1,
      );
      expect(ko.outcome).toBe("erreur");
      expect(ko.mid).not.toBeNull();
      expect(ko.after).toBeNull();
    } finally {
      await s.close();
    }
  });
});

describe("branchement d'un serveur (vps.server_setup)", () => {
  it("le worker consomme la tâche créée par la demande de branchement : serveur prêt, gabarit fabriqué", async () => {
    const image = CLOUD_IMAGES[0];
    const sum = "d".repeat(128);
    const sim = new ProxmoxSimulator({
      token: SIM_TOKEN,
      templates: [],
      storages: [
        { storage: "local", type: "dir", content: "iso,vztmpl,backup,import" },
        { storage: "local-lvm", type: "lvmthin", content: "images,rootdir" },
      ],
      remoteFiles: {
        [image?.imageUrl as string]: { sha512: sum, size: 3 * 1024 ** 3 },
      },
    });
    const s = await sim.start();
    try {
      const guest = createSimRunner(sim);
      const deps = engineDeps(t.db, guest.runner);
      const connected = await connectServer(
        t.db,
        { getSecret: async () => SIM_TOKEN, checkHost: () => null },
        {
          code: "pve-worker",
          host: "http://127.0.0.1",
          port: s.port,
          tokenRef: "proxmox.pve-worker",
          tlsMode: "verify",
          tlsFingerprint: null,
        },
      );
      const started = await startSetup(
        t.db,
        connected.server.id,
        {
          name: "Serveur worker",
          node: "pve1",
          region: "quebec",
          vmStorage: "local-lvm",
          importStorage: "local",
          pool: null,
          capacity: { vcpu: 8, ramMb: 16_384, diskGb: 500 },
          network: {
            ranges: [{ from: "192.168.1.100", to: "192.168.1.120" }],
            prefix: 24,
            gateway: "192.168.1.1",
            dns: ["192.168.1.1"],
            bridge: "vmbr0",
          },
          templates: ["debian-12-ci"],
        },
        { client: deps.proxmox },
      );
      const worker = new Worker({
        db: t.db,
        registry: registerVpsHandlers(new HandlerRegistry(), deps, {
          fetchText: async () => `${sum}  ${image?.remoteName}\n`,
        }),
        logger: silent,
        concurrency: 1,
        pollIntervalMs: 20,
      });
      worker.start();
      await until(async () => {
        const [row] = await t.db
          .select()
          .from(proxmoxServers)
          .where(eq(proxmoxServers.id, connected.server.id));
        return (
          row?.setup?.status === "succeeded" || row?.setup?.status === "failed"
        );
      });
      await worker.stop(5_000);
      const [row] = await t.db
        .select()
        .from(proxmoxServers)
        .where(eq(proxmoxServers.id, connected.server.id));
      expect(row?.setup?.runId).toBe(started.setup.runId);
      expect(row?.setup?.status).toBe("succeeded");
      expect(row?.state).toBe("ready");
    } finally {
      await s.close();
    }
  });
});
