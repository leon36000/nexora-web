import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleHealth } from "./health";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

describe("GET /api/health", () => {
  it("indique que la base app répond et n'expose aucun secret", async () => {
    const res = await handleHealth(() => t.db);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok", checks: { database: "ok" } });
    expect(Object.keys(body).sort()).toEqual([
      "checks",
      "service",
      "status",
      "time",
    ]);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("signale la panne de la base par un 503, sans recopier le message d'erreur", async () => {
    const res = await handleHealth(() => {
      throw new Error(
        "password authentication failed for user nexora (mot-de-passe-secret)",
      );
    });
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({
      status: "degraded",
      checks: { database: "error" },
    });
    expect(text).not.toContain("mot-de-passe-secret");
  });

  it("signale aussi une base qui ne répond pas à temps", async () => {
    const hanging = {
      execute: () => new Promise(() => {}),
    } as never;
    const res = await handleHealth(() => hanging, { timeoutMs: 50 });
    expect(res.status).toBe(503);
  });
});
