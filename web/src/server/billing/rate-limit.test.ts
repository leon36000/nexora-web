import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { consumeRateLimit } from "./rate-limit";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

const T0 = new Date("2026-01-01T00:00:00Z");
const at = (s: number) => new Date(T0.getTime() + s * 1000);

describe("limitation de débit (fenêtre fixe, en base)", () => {
  it("laisse passer jusqu'à la limite puis refuse avec un délai d'attente", async () => {
    const opts = { limit: 3, windowSeconds: 60 };
    const results = [];
    for (let i = 0; i < 5; i++)
      results.push(
        await consumeRateLimit(t.db, "k:a", { ...opts, now: at(i) }),
      );
    expect(results.map((r) => r.allowed)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(results[3]?.retryAfterSeconds).toBeGreaterThan(0);
    expect(results[3]?.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("repart à zéro après la fenêtre", async () => {
    const opts = { limit: 1, windowSeconds: 60 };
    expect(
      (await consumeRateLimit(t.db, "k:b", { ...opts, now: at(0) })).allowed,
    ).toBe(true);
    expect(
      (await consumeRateLimit(t.db, "k:b", { ...opts, now: at(10) })).allowed,
    ).toBe(false);
    expect(
      (await consumeRateLimit(t.db, "k:b", { ...opts, now: at(61) })).allowed,
    ).toBe(true);
  });

  it("les clés sont indépendantes", async () => {
    const opts = { limit: 1, windowSeconds: 60, now: T0 };
    expect((await consumeRateLimit(t.db, "k:c1", opts)).allowed).toBe(true);
    expect((await consumeRateLimit(t.db, "k:c2", opts)).allowed).toBe(true);
  });

  it("est exact en concurrence : 20 appels simultanés, limite 5, 5 acceptés", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        consumeRateLimit(t.db, "k:d", { limit: 5, windowSeconds: 60, now: T0 }),
      ),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });
});
