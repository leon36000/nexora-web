import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordEventOnce } from "./events.ts";
import { enqueue } from "./queue.ts";
import { configVersions, jobs } from "./schema.ts";
import { createTestDatabase, type TestDatabase } from "./testing.ts";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

describe("migrations", () => {
  it("créent les quatre tables de S1 et sont rejouables sans effet", async () => {
    const { runMigrations } = await import("./migrate.ts");
    await runMigrations(t.db);
    const rows = await t.sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
    const names = rows.map((r) => r.table_name);
    expect(names).toEqual(
      expect.arrayContaining([
        "jobs",
        "vault_secrets",
        "config_versions",
        "processed_events",
      ]),
    );
  });
});

describe("enqueue", () => {
  it("crée une tâche en attente avec ses valeurs par défaut", async () => {
    const job = await enqueue(t.db, { type: "demo.a", payload: { n: 1 } });
    expect(job).toMatchObject({
      type: "demo.a",
      status: "pending",
      attempts: 0,
      maxAttempts: 5,
    });
    expect(job.payload).toEqual({ n: 1 });
  });

  it("ne crée qu'une tâche par clé d'idempotence, même en concurrence", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        enqueue(t.db, {
          type: "demo.b",
          payload: {},
          idempotencyKey: "commande:42",
        }),
      ),
    );
    expect(new Set(results.map((j) => j.id)).size).toBe(1);
    const rows = await t.db.select().from(jobs);
    expect(rows.filter((j) => j.idempotencyKey === "commande:42")).toHaveLength(
      1,
    );
  });

  it("autorise plusieurs tâches sans clé d'idempotence", async () => {
    const a = await enqueue(t.db, { type: "demo.c", payload: {} });
    const b = await enqueue(t.db, { type: "demo.c", payload: {} });
    expect(a.id).not.toBe(b.id);
  });
});

describe("recordEventOnce (idempotence des webhooks, D7)", () => {
  it("n'accepte un événement qu'une fois par fournisseur, même en concurrence", async () => {
    const outcomes = await Promise.all(
      Array.from({ length: 10 }, () =>
        recordEventOnce(t.db, "stripe", "evt_123"),
      ),
    );
    expect(outcomes.filter(Boolean)).toHaveLength(1);
  });

  it("distingue les fournisseurs", async () => {
    expect(await recordEventOnce(t.db, "stripe", "evt_x")).toBe(true);
    expect(await recordEventOnce(t.db, "proxmox", "evt_x")).toBe(true);
    expect(await recordEventOnce(t.db, "stripe", "evt_x")).toBe(false);
  });
});

describe("config_versions", () => {
  it("refuse deux fois la même version figée d'un élément", async () => {
    const row = {
      collection: "models",
      itemId: "m1",
      hash: "h1",
      content: { prix: 1 },
    };
    await t.db.insert(configVersions).values(row);
    await expect(t.db.insert(configVersions).values(row)).rejects.toThrow();
    await t.db.insert(configVersions).values({ ...row, hash: "h2" });
  });
});
