import { enqueue, eq, jobs, vpsInstances, vpsOrders } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { ProxmoxSimulator } from "@nexora/vps/simulator";
import {
  createSimRunner,
  engineDeps,
  paidOrder,
  SIM_TOKEN,
  seedFixture,
} from "@nexora/vps/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
