import { models } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { probeHealth } from "./sante.ts";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

describe("Santé des modèles : sondes gratuites, aucun appel de modèle", () => {
  it("compare le catalogue publié à /v1/models et sonde LiteLLM", async () => {
    const urls: string[] = [];
    const rows = await probeHealth({
      db: t.db,
      gatewayBaseUrl: "http://gw",
      litellmBaseUrl: "http://llm",
      fetchImpl: (async (url: string | URL | Request) => {
        const u = String(url);
        urls.push(u);
        if (u.endsWith("/v1/models"))
          return new Response(
            JSON.stringify({ data: [{ id: "nexora/glm-5-3" }] }),
          );
        return new Response("{}", { status: 503 });
      }) as typeof fetch,
    });
    expect(urls).toEqual([
      "http://gw/v1/models",
      "http://llm/health/liveliness",
    ]);
    expect(rows[0]).toMatchObject({
      target: "passerelle /v1/models",
      status: "ok",
    });
    expect(rows.at(-1)).toMatchObject({
      target: "LiteLLM (réseau interne)",
      status: "error",
    });
    expect(urls.some((u) => u.includes("chat/completions"))).toBe(false);
    void models;
  });
});
