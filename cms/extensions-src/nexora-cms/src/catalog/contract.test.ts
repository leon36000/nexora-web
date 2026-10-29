import { describe, expect, test } from "bun:test";
import { createRelayHandler, relay } from "../admin-relay/relay";
import { CATALOG_RELAY, isAllowed, relayToCatalog } from "./contract";

const env = {
  NEXORA_APP_INTERNAL_URL: "http://app.interne:3500/",
  NEXORA_APP_ADMIN_TOKEN: "jeton-admin-app",
};
const ID = "123e4567-e89b-42d3-a456-426614174000";

describe("liste fermée des appels", () => {
  test("accepte les routes du catalogue", () => {
    for (const [m, p] of [
      ["GET", ""],
      ["POST", "providers"],
      ["PATCH", `models/${ID}`],
      ["POST", `providers/${ID}/test`],
      ["POST", `models/${ID}/prices`],
      ["GET", "usage-report"],
      ["GET", `models/${ID}/routes`],
      ["POST", `models/${ID}/routes`],
      ["PATCH", `routes/${ID}`],
      ["POST", `fx-rates/${ID}/approve`],
      ["POST", `versions/${ID}/publish`],
      ["POST", "sync-litellm"],
      ["GET", `models/${ID}/readiness`],
      ["POST", `models/${ID}/routes/reorder`],
    ] as const)
      expect(isAllowed(m, p)).toBe(true);
  });
  test("refuse tout le reste (coffre, traversée, méthodes inattendues)", () => {
    for (const [m, p] of [
      ["GET", "../vault"],
      ["GET", "../../vault"],
      ["DELETE", `models/${ID}`],
      ["GET", "vault"],
      ["POST", "sync-litellm/x"],
      ["PATCH", "models/pas-un-uuid"],
      ["GET", `models/${ID}/../x`],
      ["DELETE", `routes/${ID}`],
      ["GET", `routes/${ID}`],
      ["PATCH", `models/${ID}/routes`],
      ["POST", `models/${ID}/readiness`],
      ["GET", `models/${ID}/routes/reorder`],
      ["POST", `models/${ID}/routes/reorder/x`],
      ["POST", `routes/${ID}/reorder`],
    ] as const)
      expect(isAllowed(m, p)).toBe(false);
  });
});

describe("relais", () => {
  test("transmet méthode, chemin et corps avec le jeton, et rend la réponse telle quelle", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen.url = url;
      seen.init = init;
      return Response.json({ id: "x" }, { status: 201 });
    }) as unknown as typeof fetch;
    const r = await relayToCatalog(
      { method: "POST", path: "/providers/", body: { code: "a" } },
      { env, fetchFn },
    );
    expect(r).toEqual({ status: 201, body: { id: "x" } });
    expect(seen.url).toBe(
      "http://app.interne:3500/api/admin/catalog/providers",
    );
    expect(
      ((seen.init?.headers ?? {}) as Record<string, string>).authorization,
    ).toBe("Bearer jeton-admin-app");
    expect(seen.init?.body).toBe('{"code":"a"}');
  });
  test("conserve les refus métier de l'app (422 avec problèmes)", async () => {
    const fetchFn = (async () =>
      Response.json(
        { error: "publication_refused", issues: [{ code: "price_missing" }] },
        { status: 422 },
      )) as unknown as typeof fetch;
    const r = await relayToCatalog(
      { method: "POST", path: `versions/${ID}/approve` },
      { env, fetchFn },
    );
    expect(r.status).toBe(422);
    expect(JSON.stringify(r.body)).toContain("price_missing");
  });
  test("traduit les pannes sans jamais exposer le jeton", async () => {
    const down = (async () => {
      throw new Error("ECONNREFUSED jeton-admin-app");
    }) as unknown as typeof fetch;
    const r = await relayToCatalog(
      { method: "GET", path: "" },
      { env, fetchFn: down },
    );
    expect(r.status).toBe(502);
    expect(JSON.stringify(r)).not.toContain("jeton-admin-app");
    const unauthorized = (async () =>
      Response.json({}, { status: 401 })) as unknown as typeof fetch;
    expect(
      (
        await relayToCatalog(
          { method: "GET", path: "" },
          { env, fetchFn: unauthorized },
        )
      ).status,
    ).toBe(502);
    expect(
      (
        await relayToCatalog(
          { method: "GET", path: "" },
          { env: {}, fetchFn: down },
        )
      ).status,
    ).toBe(503);
    expect(
      (
        await relayToCatalog(
          { method: "GET", path: "vault" },
          { env, fetchFn: down },
        )
      ).status,
    ).toBe(404);
  });
});

describe("rapprochement : période transmise", () => {
  test("transmet la période (days) et ignore tout autre paramètre", async () => {
    let seen = "";
    const fetchFn = (async (url: string) => {
      seen = url;
      return Response.json({ days: 7, rows: [] });
    }) as unknown as typeof fetch;
    const r = await relayToCatalog(
      {
        method: "GET",
        path: "usage-report",
        query: { days: "7", secret: "x", organization: "o" },
      },
      { env, fetchFn },
    );
    expect(r.status).toBe(200);
    expect(seen).toBe(
      "http://app.interne:3500/api/admin/catalog/usage-report?days=7",
    );
    await relayToCatalog(
      { method: "GET", path: "usage-report", query: { days: "7&x=1" } },
      { env, fetchFn },
    );
    expect(seen).toBe("http://app.interne:3500/api/admin/catalog/usage-report");
  });
});

describe("délai", () => {
  test("laisse 60 s à la synchronisation LiteLLM, y compris par le gestionnaire d'endpoint", async () => {
    const original = AbortSignal.timeout;
    const delays: number[] = [];
    AbortSignal.timeout = ((ms: number) => {
      delays.push(ms);
      return original.call(AbortSignal, ms);
    }) as typeof AbortSignal.timeout;
    try {
      const fetchFn = (async () =>
        Response.json({ ok: true })) as unknown as typeof fetch;
      await relayToCatalog(
        { method: "POST", path: "sync-litellm" },
        { env, fetchFn },
      );
      await relay(
        CATALOG_RELAY,
        { method: "POST", path: "sync-litellm" },
        { env, fetchFn },
      );
    } finally {
      AbortSignal.timeout = original;
    }
    expect(delays).toEqual([60_000, 60_000]);
  });
});

describe("accès", () => {
  test("le relais du catalogue est réservé aux administrateurs Directus", async () => {
    const handler = createRelayHandler("nexora-catalog", CATALOG_RELAY, env, {
      info() {},
    });
    const res = () => {
      const out: { status: number; body?: unknown } = { status: 0 };
      return {
        out,
        set() {},
        status(code: number) {
          out.status = code;
          return { json: (b: unknown) => (out.body = b) };
        },
      };
    };
    const anon = res();
    await handler(
      { method: "GET", path: "/", accountability: null },
      anon as never,
    );
    expect(anon.out.status).toBe(401);
    const editor = res();
    await handler(
      { method: "GET", path: "/", accountability: { user: "u", admin: false } },
      editor as never,
    );
    expect(editor.out.status).toBe(403);
  });
});
