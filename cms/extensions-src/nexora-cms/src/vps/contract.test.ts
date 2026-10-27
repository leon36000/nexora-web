import { describe, expect, test } from "bun:test";
import {
  fetchGuide,
  isAllowed,
  normalizePath,
  relayToVps,
  sanitizeQuery,
} from "./contract";

const env = {
  NEXORA_APP_INTERNAL_URL: "http://app.interne:3500/",
  NEXORA_APP_ADMIN_TOKEN: "jeton-admin-app",
};
const ID = "123e4567-e89b-42d3-a456-426614174000";
const never = (async () => {
  throw new Error("ne devrait pas être appelé");
}) as unknown as typeof fetch;

describe("liste fermée des appels", () => {
  test("accepte exactement les routes prévues", () => {
    for (const [m, p] of [
      ["GET", ""],
      ["GET", "servers"],
      ["POST", "servers"],
      ["GET", `servers/${ID}`],
      ["PATCH", `servers/${ID}`],
      ["POST", `servers/${ID}/test`],
      ["GET", `servers/${ID}/templates`],
      ["POST", `servers/${ID}/templates`],
      ["PATCH", `templates/${ID}`],
      ["POST", "connect/probe"],
      ["POST", "connect"],
      ["POST", `servers/${ID}/discover`],
      ["GET", `servers/${ID}/setup`],
      ["POST", `servers/${ID}/setup`],
      ["GET", "plans"],
      ["POST", "plans"],
      ["GET", `plans/${ID}`],
      ["PATCH", `plans/${ID}`],
      ["GET", "apps"],
      ["POST", "apps"],
      ["GET", `apps/${ID}`],
      ["PATCH", `apps/${ID}`],
      ["GET", "versions"],
      ["POST", "versions"],
      ["GET", `versions/${ID}`],
      ["POST", `versions/${ID}/approve`],
      ["POST", `versions/${ID}/publish`],
      ["POST", "stripe/publish"],
      ["GET", "orders"],
      ["GET", "instances"],
      ["GET", "events"],
      ["patch", `plans/${ID}`],
    ] as const)
      expect([m, p, isAllowed(m, p)]).toEqual([m, p, true]);
  });

  test("refuse les méthodes interdites, même sur un chemin connu", () => {
    for (const [m, p] of [
      ["DELETE", `servers/${ID}`],
      ["DELETE", `plans/${ID}`],
      ["PUT", `apps/${ID}`],
      ["PATCH", "servers"],
      ["POST", `servers/${ID}`],
      ["PATCH", `versions/${ID}`],
      ["POST", "orders"],
      ["PATCH", "instances"],
      ["POST", "events"],
      ["GET", `servers/${ID}/test`],
      ["GET", `versions/${ID}/publish`],
      ["GET", "stripe/publish"],
      ["GET", "connect"],
      ["GET", "connect/probe"],
      ["PUT", "connect"],
      ["POST", "connect/x"],
      ["DELETE", `servers/${ID}/setup`],
      ["PATCH", `servers/${ID}/setup`],
      ["GET", `servers/${ID}/discover`],
      ["POST", "guide"],
      ["PATCH", `templates/${ID}/x`],
      ["GET", `templates/${ID}`],
      ["OPTIONS", ""],
      ["", "servers"],
    ] as const)
      expect([m, p, isAllowed(m, p)]).toEqual([m, p, false]);
  });

  test("refuse les chemins inconnus (coffre, autres administrations, ressources voisines)", () => {
    for (const p of [
      "vault",
      "catalog",
      "catalog/providers",
      "users",
      "secrets",
      "sync-litellm",
      "stripe",
      "stripe/publish/x",
      "orders/x",
      `orders/${ID}`,
      `instances/${ID}`,
      "events/x",
      `servers/${ID}/secrets`,
      `servers/${ID}/test/x`,
      `servers/${ID}/templates/${ID}`,
      `plans/${ID}/approve`,
      `versions/${ID}/rollback`,
      "servers/pas-un-uuid",
      "plans/1",
      `Servers`,
      "serversx",
      "xservers",
    ])
      expect([p, isAllowed("GET", p) || isAllowed("POST", p)]).toEqual([
        p,
        false,
      ]);
  });

  test("refuse la traversée, les doubles barres et les caractères encodés ou de contrôle", () => {
    for (const p of [
      "../vault",
      "../../vault",
      "..",
      "../",
      "servers/..",
      `servers/${ID}/..`,
      `servers/${ID}/../x`,
      `servers/${ID}/../../vault`,
      "servers/../vault",
      "./servers",
      "servers/.",
      "/servers",
      "//servers",
      "servers//",
      `servers//${ID}`,
      `servers/${ID}//test`,
      "%2e%2e/vault",
      "%2E%2E%2Fvault",
      `servers/${ID}%2f..%2fvault`,
      "servers%2Fx",
      `servers/${ID}%00`,
      "servers%00",
      "servers\u0000",
      "servers\n",
      `servers/${ID}\n`,
      " servers",
      "servers ",
      "servers?x=1",
      `events?instanceId=${ID}`,
      "servers#x",
      "servers\\..\\vault",
      `servers/${ID.toUpperCase().replace("-", "%2D")}`,
      "servers;x",
      "servers/∕..",
    ])
      expect([p, isAllowed("GET", p) || isAllowed("POST", p)]).toEqual([
        p,
        false,
      ]);
  });

  test("normalizePath retire UNE barre de chaque côté et rien d'autre", () => {
    expect(normalizePath("/")).toBe("");
    expect(normalizePath("/servers/")).toBe("servers");
    expect(normalizePath("servers")).toBe("servers");
    expect(normalizePath("//servers")).toBe("/servers");
    expect(normalizePath("/servers//")).toBe("servers/");
    expect(isAllowed("GET", normalizePath("//servers"))).toBe(false);
    expect(isAllowed("GET", normalizePath("/../vault/"))).toBe(false);
  });
});

describe("paramètres de requête", () => {
  test("seul events accepte instanceId, et seulement un UUID", () => {
    expect(sanitizeQuery("events", { instanceId: ID })?.toString()).toBe(
      `instanceId=${ID}`,
    );
    expect(sanitizeQuery("events", { instanceId: "" })?.toString()).toBe("");
    expect(sanitizeQuery("events", undefined)?.toString()).toBe("");
    expect(sanitizeQuery("events", {})?.toString()).toBe("");
    for (const bad of [
      { instanceId: "pas-un-uuid" },
      { instanceId: `${ID}&x=1` },
      { instanceId: [ID, ID] },
      { instanceId: { $ne: ID } },
      { instanceId: 12 },
      { limit: "5" },
      { instanceId: ID, autre: "x" },
      "instanceId=1",
      [ID],
    ])
      expect(sanitizeQuery("events", bad)).toBeNull();
    expect(sanitizeQuery("orders", { instanceId: ID })).toBeNull();
    expect(sanitizeQuery("servers", { x: "1" })).toBeNull();
    expect(sanitizeQuery("servers", {})?.toString()).toBe("");
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
    const r = await relayToVps(
      { method: "POST", path: "/servers/", body: { code: "pve-1" } },
      { env, fetchFn },
    );
    expect(r).toEqual({ status: 201, body: { id: "x" } });
    expect(seen.url).toBe("http://app.interne:3500/api/admin/vps/servers");
    expect(seen.init?.method).toBe("POST");
    expect(seen.init?.redirect).toBe("manual");
    expect(
      ((seen.init?.headers ?? {}) as Record<string, string>).authorization,
    ).toBe("Bearer jeton-admin-app");
    expect(seen.init?.body).toBe('{"code":"pve-1"}');
  });

  test("la vue d'ensemble va à la racine, la méthode est mise en majuscules", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen.url = url;
      seen.init = init;
      return Response.json({ servers: [] });
    }) as unknown as typeof fetch;
    await relayToVps({ method: "get", path: "/" }, { env, fetchFn });
    expect(seen.url).toBe("http://app.interne:3500/api/admin/vps");
    expect(seen.init?.method).toBe("GET");
    expect(seen.init?.body).toBeUndefined();
    await relayToVps(
      { method: "patch", path: `plans/${ID}`, body: { status: "approved" } },
      { env, fetchFn },
    );
    expect(seen.url).toBe(`http://app.interne:3500/api/admin/vps/plans/${ID}`);
    expect(seen.init?.method).toBe("PATCH");
  });

  test("un GET n'envoie jamais de corps", async () => {
    let body: unknown = "absent";
    const fetchFn = (async (_u: string, init: RequestInit) => {
      body = init.body;
      return Response.json({});
    }) as unknown as typeof fetch;
    await relayToVps(
      { method: "GET", path: "orders", body: { x: 1 } },
      { env, fetchFn },
    );
    expect(body).toBeUndefined();
  });

  test("transmet instanceId (UUID) au journal, et refuse tout autre paramètre sans appeler l'app", async () => {
    const seen: { url?: string } = {};
    const fetchFn = (async (url: string) => {
      seen.url = url;
      return Response.json({ events: [] });
    }) as unknown as typeof fetch;
    await relayToVps(
      { method: "GET", path: "/events", query: { instanceId: ID } },
      { env, fetchFn },
    );
    expect(seen.url).toBe(
      `http://app.interne:3500/api/admin/vps/events?instanceId=${ID}`,
    );
    for (const query of [
      { instanceId: "x&y=1" },
      { instanceId: ID, limit: "1" },
    ]) {
      const r = await relayToVps(
        { method: "GET", path: "events", query },
        { env, fetchFn: never },
      );
      expect(r.status).toBe(400);
    }
    const r = await relayToVps(
      { method: "GET", path: "orders", query: { instanceId: ID } },
      { env, fetchFn: never },
    );
    expect(r.status).toBe(400);
  });

  test("refuse sans appeler l'app : chemin inconnu, méthode interdite, traversée", async () => {
    for (const [method, path] of [
      ["GET", "../vault"],
      ["GET", "vault"],
      ["DELETE", `servers/${ID}`],
      ["GET", `servers/${ID}/..`],
      ["GET", "//servers"],
      ["POST", `versions/${ID}/rollback`],
    ] as const) {
      const r = await relayToVps({ method, path }, { env, fetchFn: never });
      expect([method, path, r.status]).toEqual([method, path, 404]);
    }
  });

  test("conserve les refus métier de l'app (422 avec problèmes, 409, 404)", async () => {
    const fetchFn = (async () =>
      Response.json(
        {
          error: "publication_refused",
          message: "publication refusée",
          issues: [
            {
              entity: "plan",
              code: "starter",
              issue: "price_missing",
              message: "x",
            },
          ],
        },
        { status: 422 },
      )) as unknown as typeof fetch;
    const r = await relayToVps(
      { method: "POST", path: `versions/${ID}/approve` },
      { env, fetchFn },
    );
    expect(r.status).toBe(422);
    expect(JSON.stringify(r.body)).toContain("price_missing");
    for (const status of [404, 405, 409]) {
      const f = (async () =>
        Response.json({ error: "x" }, { status })) as unknown as typeof fetch;
      expect(
        (
          await relayToVps(
            { method: "GET", path: "plans" },
            { env, fetchFn: f },
          )
        ).status,
      ).toBe(status);
    }
    const unavailable = (async () =>
      Response.json(
        { error: "admin_not_configured" },
        {
          status: 503,
        },
      )) as unknown as typeof fetch;
    expect(
      (
        await relayToVps(
          { method: "GET", path: "" },
          { env, fetchFn: unavailable },
        )
      ).status,
    ).toBe(503);
  });

  test("traduit les pannes sans jamais exposer le jeton", async () => {
    const down = (async () => {
      throw new Error("ECONNREFUSED jeton-admin-app");
    }) as unknown as typeof fetch;
    const r = await relayToVps(
      { method: "GET", path: "" },
      { env, fetchFn: down },
    );
    expect(r.status).toBe(502);
    expect(JSON.stringify(r)).not.toContain("jeton-admin-app");
    const unauthorized = (async () =>
      Response.json({}, { status: 401 })) as unknown as typeof fetch;
    const u = await relayToVps(
      { method: "GET", path: "" },
      { env, fetchFn: unauthorized },
    );
    expect(u.status).toBe(502);
    expect(JSON.stringify(u)).not.toContain("jeton-admin-app");
    expect(
      (
        await relayToVps(
          { method: "GET", path: "" },
          { env: {}, fetchFn: down },
        )
      ).status,
    ).toBe(503);
    const boom = (async () =>
      Response.json(
        { error: "internal_error" },
        {
          status: 500,
        },
      )) as unknown as typeof fetch;
    expect(
      (await relayToVps({ method: "GET", path: "" }, { env, fetchFn: boom }))
        .status,
    ).toBe(502);
    const html = (async () =>
      new Response("<html>", { status: 200 })) as unknown as typeof fetch;
    expect(
      (await relayToVps({ method: "GET", path: "" }, { env, fetchFn: html }))
        .status,
    ).toBe(502);
  });

  test("refuse un corps démesuré", async () => {
    const r = await relayToVps(
      {
        method: "PATCH",
        path: `apps/${ID}`,
        body: { installScript: "x".repeat(400_001) },
      },
      { env, fetchFn: never },
    );
    expect(r.status).toBe(413);
  });
});

describe("guide de branchement (PDF)", () => {
  const bytes = Buffer.from("%PDF-1.7\nguide\n%%EOF\n");
  const pdfFetch = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(
      new Response(bytes, {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
    );
  }) as unknown as typeof fetch;
  const calls: { url: string; init: RequestInit }[] = [];

  test("relaie le PDF tel quel, avec le jeton d'administration envoyé à l'app seulement", async () => {
    calls.length = 0;
    const r = await fetchGuide({ env, fetchFn: pdfFetch });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Buffer.from(r.body).equals(bytes)).toBe(true);
    expect(r.contentType).toBe("application/pdf");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://app.interne:3500/api/admin/vps/guide");
    const sent = calls[0]?.init.headers as Record<string, string>;
    expect(sent.authorization).toBe("Bearer jeton-admin-app");
    expect(calls[0]?.init.redirect).toBe("manual");
  });

  test("n'envoie jamais le jeton si l'app n'est pas configurée", async () => {
    const r = await fetchGuide({ env: {}, fetchFn: never });
    expect(r.status).toBe(503);
  });

  test("refuse un contenu qui n'est pas un PDF (réponse d'erreur, page HTML…)", async () => {
    const html = (async () =>
      new Response("<html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })) as unknown as typeof fetch;
    expect((await fetchGuide({ env, fetchFn: html })).status).toBe(502);
    const fake = (async () =>
      new Response("pas un pdf", {
        status: 200,
        headers: { "content-type": "application/pdf" },
      })) as unknown as typeof fetch;
    expect((await fetchGuide({ env, fetchFn: fake })).status).toBe(502);
  });

  test("transmet le 404 lisible quand le PDF n'est pas généré, et 502 si l'app refuse le jeton", async () => {
    const missing = (async () =>
      new Response(JSON.stringify({ error: "guide_unavailable" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    expect((await fetchGuide({ env, fetchFn: missing })).status).toBe(404);
    const refused = (async () =>
      new Response("{}", { status: 401 })) as unknown as typeof fetch;
    expect((await fetchGuide({ env, fetchFn: refused })).status).toBe(502);
  });

  test("une panne réseau donne 502 sans détail", async () => {
    const down = (async () => {
      throw new Error("ECONNREFUSED 10.0.0.1:3500 jeton-admin-app");
    }) as unknown as typeof fetch;
    const r = await fetchGuide({ env, fetchFn: down });
    expect(r.status).toBe(502);
    expect(JSON.stringify(r)).not.toContain("jeton-admin-app");
  });
});
