import { describe, expect, test } from "bun:test";
import { createRelayHandler, isAllowed } from "../admin-relay/relay";
import { AGENTS_RELAY, relayToAgents } from "./contract";

const env = {
  NEXORA_APP_INTERNAL_URL: "http://app.interne:3500/",
  NEXORA_APP_ADMIN_TOKEN: "jeton-admin-app",
};
const ID = "123e4567-e89b-42d3-a456-426614174000";

describe("liste fermée des appels (agents)", () => {
  test("accepte les routes des agents", () => {
    for (const [m, p] of [
      ["GET", ""],
      ["GET", "runs"],
      ["GET", `runs/${ID}`],
      ["PATCH", "redacteur"],
      ["POST", "veille/run"],
      ["POST", "traducteur/stop"],
      ["POST", "seo/gateway-key"],
      ["POST", "credit"],
    ] as const)
      expect(isAllowed(AGENTS_RELAY, m, p)).toBe(true);
  });
  test("refuse tout le reste (Coffre, catalogue, traversée, méthodes inattendues)", () => {
    for (const [m, p] of [
      ["GET", "../vault"],
      ["GET", "../../catalog"],
      ["DELETE", "redacteur"],
      ["GET", "redacteur"],
      ["POST", "inconnu/run"],
      ["POST", "redacteur/run/x"],
      ["POST", "redacteur/publish"],
      ["GET", `runs/${ID}/../x`],
      ["PATCH", "credit"],
      ["GET", "credit"],
    ] as const)
      expect(isAllowed(AGENTS_RELAY, m, p)).toBe(false);
  });
});

describe("relais (agents)", () => {
  test("transmet méthode, chemin, paramètres permis et corps avec le jeton", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen.url = url;
      seen.init = init;
      return Response.json({ runs: [] });
    }) as unknown as typeof fetch;
    const r = await relayToAgents(
      {
        method: "GET",
        path: "/runs/",
        query: { agent: "redacteur", limit: "10", autre: "x", pirate: "a&b=c" },
      },
      { env, fetchFn },
    );
    expect(r).toEqual({ status: 200, body: { runs: [] } });
    expect(seen.url).toBe(
      "http://app.interne:3500/api/admin/site-agents/runs?agent=redacteur&limit=10",
    );
    expect(
      ((seen.init?.headers ?? {}) as Record<string, string>).authorization,
    ).toBe("Bearer jeton-admin-app");
  });
  test("conserve les refus métier (409) et masque les erreurs 500", async () => {
    const refus = (async () =>
      Response.json(
        { error: "gateway_key_missing" },
        { status: 409 },
      )) as unknown as typeof fetch;
    expect(
      (
        await relayToAgents(
          { method: "PATCH", path: "redacteur", body: { enabled: true } },
          { env, fetchFn: refus },
        )
      ).body,
    ).toEqual({ error: "gateway_key_missing" });
    const boom = (async () =>
      Response.json(
        { stack: "secret" },
        { status: 500 },
      )) as unknown as typeof fetch;
    const r = await relayToAgents(
      { method: "GET", path: "" },
      { env, fetchFn: boom },
    );
    expect(r.status).toBe(502);
    expect(JSON.stringify(r.body)).not.toContain("secret");
  });
  test("401 de l'app = jeton de service mal configuré ; app non configurée = 503 ; injoignable = 502", async () => {
    const non = (async () =>
      new Response("{}", { status: 401 })) as unknown as typeof fetch;
    expect(
      (await relayToAgents({ method: "GET", path: "" }, { env, fetchFn: non }))
        .status,
    ).toBe(502);
    expect(
      (await relayToAgents({ method: "GET", path: "" }, { env: {} })).status,
    ).toBe(503);
    const down = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    expect(
      (await relayToAgents({ method: "GET", path: "" }, { env, fetchFn: down }))
        .status,
    ).toBe(502);
  });
  test("refuse un corps trop volumineux et une route hors liste sans appeler l'app", async () => {
    let called = false;
    const fetchFn = (async () => {
      called = true;
      return Response.json({});
    }) as unknown as typeof fetch;
    expect(
      (
        await relayToAgents(
          { method: "POST", path: "credit", body: { x: "a".repeat(70_000) } },
          { env, fetchFn },
        )
      ).status,
    ).toBe(413);
    expect(
      (await relayToAgents({ method: "GET", path: "vault" }, { env, fetchFn }))
        .status,
    ).toBe(404);
    expect(called).toBe(false);
  });
});

describe("endpoint : administrateurs seulement", () => {
  const mk = () => {
    const out: { status?: number; body?: unknown } = {};
    const res = {
      set: () => undefined,
      status: (c: number) => {
        out.status = c;
        return { json: (b: unknown) => (out.body = b) };
      },
    };
    return { out, res };
  };
  const logs: string[] = [];
  const handler = createRelayHandler("nexora-agents", AGENTS_RELAY, env, {
    info: (m) => logs.push(m),
  });
  test("401 sans utilisateur, 403 si non administrateur, journal sans corps", async () => {
    let m = mk();
    await handler({ method: "GET", path: "" }, m.res);
    expect(m.out.status).toBe(401);
    m = mk();
    await handler(
      { method: "GET", path: "", accountability: { user: "u", admin: false } },
      m.res,
    );
    expect(m.out.status).toBe(403);
    expect(logs).toEqual([]);
  });
});
