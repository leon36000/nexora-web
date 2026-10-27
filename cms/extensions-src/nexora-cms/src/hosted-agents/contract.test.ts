import { describe, expect, test } from "bun:test";
import { createRelayHandler, isAllowed } from "../admin-relay/relay";
import { HOSTED_AGENTS_RELAY, relayToHostedAgents } from "./contract";

const env = {
  NEXORA_APP_INTERNAL_URL: "http://app.interne:3500/",
  NEXORA_APP_ADMIN_TOKEN: "jeton-admin-app",
};
const ID = "123e4567-e89b-42d3-a456-426614174000";

describe("liste fermée des appels (agents hébergés)", () => {
  test("accepte les routes du module", () => {
    for (const [m, p] of [
      ["GET", ""],
      ["GET", "instances"],
      ["POST", "instances"],
      ["GET", `instances/${ID}`],
      ["PATCH", `instances/${ID}`],
      ["POST", `instances/${ID}/test`],
      ["POST", `instances/${ID}/discover`],
      ["GET", "agents"],
      ["GET", `agents/${ID}`],
      ["PATCH", `agents/${ID}`],
      ["GET", `agents/${ID}/prices`],
      ["POST", `agents/${ID}/prices`],
      ["GET", "embed"],
      ["PATCH", "embed"],
    ] as const)
      expect(isAllowed(HOSTED_AGENTS_RELAY, m, p)).toBe(true);
  });
  test("refuse tout le reste (Coffre, catalogue, traversée, suppression, méthodes inattendues)", () => {
    for (const [m, p] of [
      ["GET", "../vault"],
      ["GET", "../../catalog"],
      ["DELETE", `agents/${ID}`],
      ["DELETE", `instances/${ID}`],
      ["PUT", "embed"],
      ["POST", "embed"],
      ["POST", `agents/${ID}`],
      ["PATCH", `agents/${ID}/prices`],
      ["POST", `instances/${ID}/secret`],
      ["POST", `agents/${ID}/publish`],
      ["GET", "agents/pas-un-uuid"],
      ["GET", `agents/${ID}/../x`],
    ] as const)
      expect(isAllowed(HOSTED_AGENTS_RELAY, m, p)).toBe(false);
  });
});

describe("relais (agents hébergés)", () => {
  test("transmet méthode, chemin et corps avec le jeton, sans paramètre de requête", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen.url = url;
      seen.init = init;
      return Response.json({ ok: true });
    }) as unknown as typeof fetch;
    const r = await relayToHostedAgents(
      {
        method: "POST",
        path: `/instances/${ID}/discover/`,
        query: { limit: "5" },
        body: { x: 1 },
      },
      { env, fetchFn },
    );
    expect(r.status).toBe(200);
    expect(seen.url).toBe(
      `http://app.interne:3500/api/admin/hosted-agents/instances/${ID}/discover`,
    );
    expect(
      (seen.init?.headers as Record<string, string>).authorization,
    ).toBe("Bearer jeton-admin-app");
  });
  test("refuse hors liste sans appeler l'app, et signale un service non configuré", async () => {
    let called = 0;
    const fetchFn = (async () => {
      called += 1;
      return Response.json({});
    }) as unknown as typeof fetch;
    const out = await relayToHostedAgents(
      { method: "GET", path: "../vault" },
      { env, fetchFn },
    );
    expect(out.status).toBe(404);
    expect(called).toBe(0);
    const none = await relayToHostedAgents(
      { method: "GET", path: "" },
      { env: {}, fetchFn },
    );
    expect(none.status).toBe(503);
    expect(JSON.stringify(none.body)).toContain("HOSTED_AGENTS_NON_CONFIGURE");
  });
});

describe("endpoint réservé aux administrateurs", () => {
  const run = async (accountability: unknown) => {
    let status = 0;
    let body: unknown;
    const res = {
      set: () => undefined,
      status: (c: number) => {
        status = c;
        return {
          json: (b: unknown) => {
            body = b;
          },
        };
      },
    };
    const handler = createRelayHandler(
      "nexora-hosted-agents",
      HOSTED_AGENTS_RELAY,
      env,
      { info: () => undefined },
    );
    await handler(
      { accountability, method: "GET", path: "" } as never,
      res as never,
    );
    return { status, body };
  };
  test("refuse l'anonyme (401) et un non-administrateur (403)", async () => {
    expect((await run(null)).status).toBe(401);
    expect((await run({ user: "u1", admin: false })).status).toBe(403);
  });
});
