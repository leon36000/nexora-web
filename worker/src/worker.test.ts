import { enqueue, eq, jobs, sql } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger, type Logger } from "@nexora/log";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { backoffDelayMs } from "./backoff.ts";
import { claimJob, completeJob, failJob } from "./queue.ts";
import { HandlerRegistry } from "./registry.ts";
import { Worker } from "./worker.ts";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});
beforeEach(async () => {
  await t.db.delete(jobs);
});

const silent: Logger = createLogger({ name: "test", sink: () => {} });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond: () => Promise<boolean>, timeoutMs = 10_000) {
  const start = Date.now();
  while (!(await cond())) {
    if (Date.now() - start > timeoutMs)
      throw new Error("waitFor : délai dépassé");
    await sleep(20);
  }
}
const openJobs = async () =>
  (await t.db.select().from(jobs)).filter(
    (j) => j.status === "pending" || j.status === "running",
  );

const fast = { baseMs: 10, maxMs: 40 };

describe("backoffDelayMs", () => {
  it("double à chaque essai et plafonne", () => {
    const o = { baseMs: 1000, maxMs: 5000 };
    expect(backoffDelayMs(1, o)).toBe(1000);
    expect(backoffDelayMs(2, o)).toBe(2000);
    expect(backoffDelayMs(3, o)).toBe(4000);
    expect(backoffDelayMs(4, o)).toBe(5000);
    expect(backoffDelayMs(30, o)).toBe(5000);
  });
  it("applique une gigue bornée sans dépasser le plafond", () => {
    const o = { baseMs: 1000, maxMs: 5000, jitter: () => 0.5 };
    expect(backoffDelayMs(1, o)).toBe(500);
    expect(backoffDelayMs(10, { ...o, jitter: () => 1 })).toBe(5000);
  });
});

describe("claimJob (SELECT … FOR UPDATE SKIP LOCKED)", () => {
  it("deux consommateurs ne prennent jamais la même tâche", async () => {
    for (let i = 0; i < 12; i++)
      await enqueue(t.db, { type: "demo", payload: { i } });
    const claims = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        claimJob(t.db, {
          workerId: `w${i % 2}`,
          types: ["demo"],
          leaseMs: 60_000,
        }),
      ),
    );
    const got = claims.filter((c) => c !== null);
    expect(got).toHaveLength(12);
    expect(new Set(got.map((j) => j.id)).size).toBe(12);
    expect(got.every((j) => j.attempts === 1 && j.status === "running")).toBe(
      true,
    );
  });

  it("ne prend ni les types sans gestionnaire ni les tâches planifiées dans le futur", async () => {
    await enqueue(t.db, { type: "autre", payload: {} });
    await enqueue(t.db, {
      type: "demo",
      availableAt: new Date(Date.now() + 60_000),
    });
    expect(
      await claimJob(t.db, { workerId: "w", types: ["demo"], leaseMs: 60_000 }),
    ).toBeNull();
    expect(
      await claimJob(t.db, { workerId: "w", types: [], leaseMs: 60_000 }),
    ).toBeNull();
  });

  it("reprend une tâche dont le bail a expiré (travailleur mort), pas une tâche active", async () => {
    const job = await enqueue(t.db, { type: "demo" });
    const first = await claimJob(t.db, {
      workerId: "mort",
      types: ["demo"],
      leaseMs: 60_000,
    });
    expect(first?.id).toBe(job.id);
    // Bail encore valide : personne d'autre ne la prend.
    expect(
      await claimJob(t.db, {
        workerId: "vivant",
        types: ["demo"],
        leaseMs: 60_000,
      }),
    ).toBeNull();
    await t.db
      .update(jobs)
      .set({ lockedAt: sql`now() - interval '10 minutes'` })
      .where(eq(jobs.id, job.id));
    const again = await claimJob(t.db, {
      workerId: "vivant",
      types: ["demo"],
      leaseMs: 60_000,
    });
    expect(again).toMatchObject({
      id: job.id,
      lockedBy: "vivant",
      attempts: 2,
    });
  });

  it("abandonne une tâche au bail expiré qui a déjà épuisé ses essais", async () => {
    const job = await enqueue(t.db, { type: "demo", maxAttempts: 1 });
    await claimJob(t.db, {
      workerId: "mort",
      types: ["demo"],
      leaseMs: 60_000,
    });
    await t.db
      .update(jobs)
      .set({ lockedAt: sql`now() - interval '10 minutes'` })
      .where(eq(jobs.id, job.id));
    expect(
      await claimJob(t.db, { workerId: "w", types: ["demo"], leaseMs: 60_000 }),
    ).toBeNull();
    const [row] = await t.db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(row?.status).toBe("dead");
  });

  it("un ancien propriétaire ne peut ni terminer ni échouer une tâche reprise par un autre", async () => {
    const job = await enqueue(t.db, { type: "demo" });
    const mine = await claimJob(t.db, {
      workerId: "A",
      types: ["demo"],
      leaseMs: 60_000,
    });
    await t.db
      .update(jobs)
      .set({ lockedAt: sql`now() - interval '10 minutes'` })
      .where(eq(jobs.id, job.id));
    await claimJob(t.db, { workerId: "B", types: ["demo"], leaseMs: 60_000 });
    expect(mine).not.toBeNull();
    expect(await completeJob(t.db, mine as never, "A")).toBe(false);
    expect(await failJob(t.db, mine as never, "A", new Error("x"), fast)).toBe(
      false,
    );
    const [row] = await t.db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(row).toMatchObject({ status: "running", lockedBy: "B" });
  });
});

describe("Worker", () => {
  it("exécute chaque tâche exactement une fois avec plusieurs consommateurs concurrents", async () => {
    const registry = new HandlerRegistry();
    const runs = new Map<string, number>();
    registry.register("demo", async (job) => {
      runs.set(job.id, (runs.get(job.id) ?? 0) + 1);
      await sleep(Math.random() * 15);
    });
    const ids: string[] = [];
    for (let i = 0; i < 60; i++)
      ids.push((await enqueue(t.db, { type: "demo", payload: { i } })).id);

    const workers = Array.from(
      { length: 3 },
      (_, i) =>
        new Worker({
          db: t.db,
          registry,
          logger: silent,
          workerId: `w${i}`,
          concurrency: 3,
          pollIntervalMs: 10,
          backoff: fast,
        }),
    );
    for (const w of workers) w.start();
    await waitFor(async () => (await openJobs()).length === 0);
    await Promise.all(workers.map((w) => w.stop()));

    expect(runs.size).toBe(60);
    expect([...runs.values()].every((n) => n === 1)).toBe(true);
    const rows = await t.db.select().from(jobs);
    expect(
      rows.every((r) => r.status === "succeeded" && r.attempts === 1),
    ).toBe(true);
  });

  it("reprend une tâche échouée avec délai croissant puis l'abandonne après N essais", async () => {
    const registry = new HandlerRegistry();
    let calls = 0;
    registry.register("boom", async () => {
      calls++;
      throw new Error("échec simulé");
    });
    const job = await enqueue(t.db, { type: "boom", maxAttempts: 3 });
    const w = new Worker({
      db: t.db,
      registry,
      logger: silent,
      workerId: "w",
      pollIntervalMs: 10,
      backoff: fast,
    });
    w.start();
    await waitFor(async () => (await openJobs()).length === 0);
    await w.stop();

    const [row] = await t.db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(calls).toBe(3);
    expect(row).toMatchObject({ status: "dead", attempts: 3 });
    expect(row?.errors).toHaveLength(3);
    expect(row?.lastError).toContain("échec simulé");
    expect(row?.finishedAt).not.toBeNull();
  });

  it("planifie la reprise dans le futur selon le délai exponentiel", async () => {
    const registry = new HandlerRegistry();
    registry.register("boom", async () => {
      throw new Error("x");
    });
    const job = await enqueue(t.db, { type: "boom", maxAttempts: 5 });
    const w = new Worker({
      db: t.db,
      registry,
      logger: silent,
      workerId: "w",
      backoff: { baseMs: 60_000, maxMs: 600_000 },
    });
    expect(await w.runOnce()).toBe(true);
    const [row] = await t.db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(row?.status).toBe("pending");
    expect(row?.lockedBy).toBeNull();
    const delay = (row?.availableAt.getTime() ?? 0) - Date.now();
    expect(delay).toBeGreaterThan(50_000);
    expect(delay).toBeLessThanOrEqual(60_000);
    expect(await w.runOnce()).toBe(false); // pas encore disponible
  });

  it("réussit à la reprise après des échecs transitoires", async () => {
    const registry = new HandlerRegistry();
    let calls = 0;
    registry.register("flaky", async (job) => {
      calls++;
      if (job.attempt < 3) throw new Error("transitoire");
    });
    const job = await enqueue(t.db, { type: "flaky", maxAttempts: 5 });
    const w = new Worker({
      db: t.db,
      registry,
      logger: silent,
      workerId: "w",
      pollIntervalMs: 10,
      backoff: fast,
    });
    w.start();
    await waitFor(async () => (await openJobs()).length === 0);
    await w.stop();
    const [row] = await t.db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(row).toMatchObject({ status: "succeeded", attempts: 3 });
    expect(calls).toBe(3);
  });

  it("n'exécute qu'une fois une tâche mise en file deux fois avec la même clé", async () => {
    const registry = new HandlerRegistry();
    let calls = 0;
    registry.register("once", async () => {
      calls++;
    });
    await Promise.all([
      enqueue(t.db, { type: "once", idempotencyKey: "k1" }),
      enqueue(t.db, { type: "once", idempotencyKey: "k1" }),
    ]);
    const w = new Worker({
      db: t.db,
      registry,
      logger: silent,
      workerId: "w",
      pollIntervalMs: 10,
      backoff: fast,
    });
    w.start();
    await waitFor(async () => (await openJobs()).length === 0);
    await sleep(100);
    await w.stop();
    expect(calls).toBe(1);
  });

  it("n'exécute pas les types sans gestionnaire", async () => {
    const registry = new HandlerRegistry();
    registry.register("connu", async () => {});
    const unknown = await enqueue(t.db, { type: "inconnu" });
    const w = new Worker({
      db: t.db,
      registry,
      logger: silent,
      workerId: "w",
      backoff: fast,
    });
    expect(await w.runOnce()).toBe(false);
    const [row] = await t.db.select().from(jobs).where(eq(jobs.id, unknown.id));
    expect(row?.status).toBe("pending");
  });

  it("s'arrête proprement : attend la tâche en cours et ne réclame plus rien", async () => {
    const registry = new HandlerRegistry();
    let finished = false;
    let started!: () => void;
    const startedP = new Promise<void>((r) => {
      started = r;
    });
    registry.register("lent", async () => {
      started();
      await sleep(200);
      finished = true;
    });
    registry.register("suite", async () => {});
    const first = await enqueue(t.db, { type: "lent" });
    const w = new Worker({
      db: t.db,
      registry,
      logger: silent,
      workerId: "w",
      concurrency: 1,
      pollIntervalMs: 10,
      backoff: fast,
    });
    w.start();
    await startedP;
    const stopping = w.stop();
    const later = await enqueue(t.db, { type: "suite" });
    await stopping;
    expect(finished).toBe(true);
    const [a] = await t.db.select().from(jobs).where(eq(jobs.id, first.id));
    const [b] = await t.db.select().from(jobs).where(eq(jobs.id, later.id));
    expect(a?.status).toBe("succeeded");
    expect(b?.status).toBe("pending");
  });

  it("ne journalise ni la charge ni les secrets, et ne les stocke pas dans les erreurs", async () => {
    const lines: string[] = [];
    const log = createLogger({
      name: "w",
      level: "debug",
      sink: (l) => lines.push(l),
    });
    const registry = new HandlerRegistry();
    registry.register("secret", async () => {
      throw new Error(
        "refusé avec Authorization: Bearer ZZtopSecretToken12345",
      );
    });
    const job = await enqueue(t.db, {
      type: "secret",
      payload: {
        apiKey: "sk-live-PAYLOADSECRET99",
        note: "contenu-client-privé",
      },
      maxAttempts: 1,
    });
    const w = new Worker({
      db: t.db,
      registry,
      logger: log,
      workerId: "w",
      backoff: fast,
    });
    await w.runOnce();
    const out = lines.join("\n");
    expect(out).toContain(job.id);
    for (const leak of [
      "PAYLOADSECRET99",
      "contenu-client-privé",
      "ZZtopSecretToken12345",
    ]) {
      expect(out).not.toContain(leak);
    }
    const [row] = await t.db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(JSON.stringify(row?.errors) + row?.lastError).not.toContain(
      "ZZtopSecretToken12345",
    );
  });
});
