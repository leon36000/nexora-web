import { sql } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AccountContext } from "./account-handlers";
import {
  type ActivityDeps,
  handleActivity,
  handleActivityExport,
} from "./activity-handlers";
import { createApiKey, revokeApiKey } from "./keys";
import { newOrganization } from "./test-support";

const SITE = "http://localhost:3500";
const NOW = new Date("2026-10-29T15:00:00.000Z");

let t: TestDatabase;
let a: { org: string; keyId: string };
let b: { org: string; keyId: string };
let seq = 0;

async function event(
  org: string,
  keyId: string,
  o: {
    at: string;
    model?: string;
    status?: string;
    cost?: number;
    prompt?: number;
  },
) {
  seq += 1;
  await t.db.execute(sql`
    INSERT INTO usage_events (
      request_id, organization_id, api_key_id, model_public_id, endpoint, config_version,
      status, http_status, prompt_tokens, cost_micro, value_micro, latency_ms, created_at
    ) VALUES (
      ${`req_h_${seq}`}, ${org}, ${keyId}, ${o.model ?? "nexora/test"}, 'chat.completions', 'cat_x',
      ${o.status ?? "ok"}, ${o.status === "error" ? 502 : 200}, ${o.prompt ?? 10},
      ${o.cost ?? 100}, ${o.cost ?? 100}, 50, ${o.at}::timestamptz
    )
  `);
}

async function org(name: string) {
  const id = await newOrganization(t.db);
  const { record } = await createApiKey(t.db, {
    organizationId: id,
    name,
  });
  return { org: id, keyId: record.id };
}

beforeAll(async () => {
  t = await createTestDatabase();
  a = await org("Production");
  b = await org("Clé secrète de B");
  await event(a.org, a.keyId, {
    at: "2026-10-28T12:00:00Z",
    model: "nexora/grand",
    cost: 900,
    prompt: 40,
  });
  await event(a.org, a.keyId, {
    at: "2026-10-27T12:00:00Z",
    model: "agent/facturation",
    cost: 5_000,
  });
  await event(a.org, a.keyId, {
    at: "2026-10-26T12:00:00Z",
    model: "nexora/grand",
    status: "error",
    cost: 0,
  });
  await event(b.org, b.keyId, {
    at: "2026-10-28T12:00:00Z",
    model: "nexora/b-prive",
    cost: 123_456,
  });
});
afterAll(async () => {
  await t.drop();
});

const deps = (
  ctx: AccountContext | null,
  extra: Partial<ActivityDeps> = {},
): ActivityDeps => ({
  db: () => t.db,
  siteUrl: SITE,
  getContext: async () => ctx,
  log: createLogger({ name: "test", sink: () => {} }),
  now: () => NOW,
  ...extra,
});
const ctxOf = (
  o: { org: string },
  role: "owner" | "member" = "owner",
): AccountContext => ({
  userId: `u-${o.org}`,
  organizationId: o.org,
  role,
});
/** Lit un CSV en gardant la marque d'ordre des octets (`Response.text()` la retire). */
async function readCsv(res: Response) {
  const bytes = new Uint8Array(await res.arrayBuffer());
  const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
  return {
    hasBom: text.startsWith("\uFEFF"),
    text,
    lines: text
      .replace(/^\uFEFF/, "")
      .trimEnd()
      .split("\r\n"),
  };
}
const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(`${SITE}${path}`, {
    headers: { "sec-fetch-site": "same-origin", ...headers },
  });

describe("GET /api/account/activity", () => {
  it("refuse : origine étrangère, aucun indice d'origine, sans session", async () => {
    const foreign = await handleActivity(
      get("/api/account/activity", { origin: "https://evil.example" }),
      deps(ctxOf(a)),
    );
    expect(foreign.status).toBe(403);
    expect(await foreign.json()).toEqual({ error: "invalid_origin" });
    const bare = await handleActivity(
      new Request(`${SITE}/api/account/activity`),
      deps(ctxOf(a)),
    );
    expect(bare.status).toBe(403);
    const anonymous = await handleActivity(
      get("/api/account/activity"),
      deps(null),
    );
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toEqual({ error: "unauthenticated" });
  });

  it("accepte l'origine du site, ou à défaut un Referer du site", async () => {
    expect(
      (
        await handleActivity(
          get("/api/account/activity", { origin: SITE }),
          deps(ctxOf(a)),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await handleActivity(
          new Request(`${SITE}/api/account/activity`, {
            headers: { referer: `${SITE}/compte/activite` },
          }),
          deps(ctxOf(a)),
        )
      ).status,
    ).toBe(200);
  });

  it("un membre simple peut lire l'activité de son organisation", async () => {
    const res = await handleActivity(
      get("/api/account/activity"),
      deps(ctxOf(a, "member")),
    );
    expect(res.status).toBe(200);
  });

  it("renvoie la synthèse, les répartitions et le journal de l'organisation de la session seulement", async () => {
    const res = await handleActivity(
      get("/api/account/activity?period=30d"),
      deps(ctxOf(a)),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.period).toEqual({
      preset: "30d",
      from: "2026-09-29T15:00:00.000Z",
      to: NOW.toISOString(),
    });
    // Montants en chaînes : exacts, jamais de nombre à virgule flottante.
    expect(body.summary).toEqual({
      requests: 3,
      errors: 1,
      promptTokens: 60,
      completionTokens: 0,
      cachedTokens: 0,
      costMicro: "5900",
      valueMicro: "5900",
      avgLatencyMs: 50,
    });
    expect(body.breakdown.models.map((r: { key: string }) => r.key)).toEqual([
      "nexora/grand",
    ]);
    expect(body.breakdown.agents.map((r: { key: string }) => r.key)).toEqual([
      "agent/facturation",
    ]);
    expect(body.breakdown.keys[0]).toMatchObject({
      label: "Production",
      costMicro: "5900",
    });
    expect(body.breakdown.days).toHaveLength(3);
    expect(body.rows).toHaveLength(3);
    expect(body.rows[0]).toMatchObject({
      model: "nexora/grand",
      apiKeyName: "Production",
      costMicro: "900",
      createdAt: "2026-10-28T12:00:00.000Z",
    });
    expect(body.nextCursor).toBeNull();
    // Rien de l'organisation B.
    const text = JSON.stringify(body);
    expect(text).not.toContain("b-prive");
    expect(text).not.toContain("Clé secrète de B");
    expect(text).not.toContain("123456");
  });

  it("filtres de modèle, de clé et de statut ; la clé d'une autre organisation ne donne rien", async () => {
    const byStatus = await (
      await handleActivity(
        get("/api/account/activity?status=error"),
        deps(ctxOf(a)),
      )
    ).json();
    expect(byStatus.summary.requests).toBe(1);
    expect(byStatus.filters).toEqual({
      model: null,
      key: null,
      status: "error",
    });
    const byModel = await (
      await handleActivity(
        get("/api/account/activity?model=agent/facturation"),
        deps(ctxOf(a)),
      )
    ).json();
    expect(byModel.summary.requests).toBe(1);
    const spy = await (
      await handleActivity(
        get(`/api/account/activity?key=${b.keyId}`),
        deps(ctxOf(a)),
      )
    ).json();
    expect(spy.summary.requests).toBe(0);
    expect(spy.rows).toEqual([]);
  });

  it("pagination par curseur : la page suivante ne répète ni la synthèse ni les répartitions", async () => {
    const first = await (
      await handleActivity(get("/api/account/activity?limit=2"), deps(ctxOf(a)))
    ).json();
    expect(first.rows).toHaveLength(2);
    expect(typeof first.nextCursor).toBe("string");
    expect(first.summary).toBeDefined();
    const second = await (
      await handleActivity(
        get(
          `/api/account/activity?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`,
        ),
        deps(ctxOf(a)),
      )
    ).json();
    expect(second.rows).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(second.summary).toBeUndefined();
    expect(second.breakdown).toBeUndefined();
    const ids = [...first.rows, ...second.rows].map(
      (r: { id: string }) => r.id,
    );
    expect(new Set(ids).size).toBe(3);
  });

  it("valide les paramètres (période, bornes de 366 jours, statut, curseur, limite)", async () => {
    const bad = async (query: string) => {
      const res = await handleActivity(
        get(`/api/account/activity?${query}`),
        deps(ctxOf(a)),
      );
      return [res.status, (await res.json()).error];
    };
    expect(await bad("period=2y")).toEqual([422, "invalid_period"]);
    expect(await bad("from=2024-01-01&to=2026-01-01")).toEqual([
      422,
      "range_too_long",
    ]);
    expect(await bad("from=2026-01-01")).toEqual([422, "invalid_range"]);
    expect(await bad("status=zzz")).toEqual([422, "invalid_status"]);
    expect(await bad("cursor=xx")).toEqual([422, "invalid_cursor"]);
    expect(await bad("limit=1000")).toEqual([422, "invalid_limit"]);
  });

  it("limite le débit par utilisateur", async () => {
    const lonely = await org("Limite");
    const d = deps(ctxOf(lonely));
    let last = 200;
    for (let i = 0; i < 130; i++)
      last = (await handleActivity(get("/api/account/activity"), d)).status;
    expect(last).toBe(429);
  });
});

describe("Authorization: Bearer nxk_… (clé API)", () => {
  /** Clé active de l'organisation A, avec sa valeur en clair. */
  let keyA: string;
  beforeAll(async () => {
    const created = await createApiKey(t.db, {
      organizationId: a.org,
      name: "Robot",
    });
    keyA = created.key;
  });
  const bearer = (key: string) => ({ authorization: `Bearer ${key}` });

  it("403 sans Authorization sur une origine étrangère", async () => {
    for (const handler of [handleActivity, handleActivityExport]) {
      const res = await handler(
        new Request(`${SITE}/api/account/activity`, {
          headers: { origin: "https://evil.example" },
        }),
        deps(ctxOf(a)),
      );
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "invalid_origin" });
    }
  });

  it("200 avec une clé API, même sans Origin ni session (JSON)", async () => {
    const res = await handleActivity(
      new Request(`${SITE}/api/account/activity?period=30d`, {
        headers: bearer(keyA),
      }),
      deps(null),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.requests).toBe(3);
    const text = JSON.stringify(body);
    expect(text).not.toContain("b-prive");
    expect(text).not.toContain("123456");
  });

  it("200 avec une clé API pour l'export, isolé par organisation", async () => {
    const res = await handleActivityExport(
      new Request(`${SITE}/api/account/activity/export?period=30d`, {
        headers: bearer(keyA),
      }),
      deps(null),
    );
    expect(res.status).toBe(200);
    const { lines, text } = await readCsv(res);
    expect(lines).toHaveLength(4);
    expect(text).not.toContain("b-prive");
    expect(text).not.toContain("Clé secrète de B");
  });

  it("401 si la clé est inconnue, mal formée ou révoquée", async () => {
    const cases: Record<string, string>[] = [
      bearer("nxk_inconnue"),
      { authorization: "Basic abc" },
      { authorization: "Bearer" },
    ];
    for (const headers of cases) {
      const res = await handleActivity(
        new Request(`${SITE}/api/account/activity`, { headers }),
        deps(ctxOf(a)),
      );
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthenticated" });
    }
    const revoked = await createApiKey(t.db, {
      organizationId: a.org,
      name: "Révoquée",
    });
    await revokeApiKey(t.db, a.org, revoked.record.id, NOW);
    for (const handler of [handleActivity, handleActivityExport]) {
      const res = await handler(
        new Request(`${SITE}/api/account/activity`, {
          headers: bearer(revoked.key),
        }),
        deps(ctxOf(a)),
      );
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthenticated" });
    }
  });
});

describe("GET /api/account/activity/export", () => {
  it("renvoie un CSV en pièce jointe, avec marque UTF-8, en-tête et montants exacts", async () => {
    const res = await handleActivityExport(
      get("/api/account/activity/export?period=30d"),
      deps(ctxOf(a)),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="nexora-activite-2026-09-29_2026-10-29.csv"',
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-nexora-export-rows")).toBe("3");
    expect(res.headers.get("x-nexora-export-truncated")).toBe("false");
    const { hasBom, text, lines } = await readCsv(res);
    expect(hasBom).toBe(true);
    expect(lines[0]).toMatch(/^created_at,request_id,model,/);
    expect(lines).toHaveLength(4); // en-tête + 3 requêtes
    expect(lines[1]).toContain(",nexora/grand,chat.completions,Production,");
    expect(lines[1]).toContain(",0.000900,0.000900,true,50");
    expect(text).not.toContain("b-prive");
    expect(text).not.toContain("Clé secrète de B");
  });

  it("applique les mêmes filtres que la page", async () => {
    const { lines } = await readCsv(
      await handleActivityExport(
        get("/api/account/activity/export?status=error"),
        deps(ctxOf(a)),
      ),
    );
    expect(lines).toHaveLength(2);
  });

  it("neutralise une formule cachée dans le nom d'une clé", async () => {
    const evil = await org('=HYPERLINK("http://evil.example","clic")');
    await event(evil.org, evil.keyId, { at: "2026-10-28T12:00:00Z" });
    const { text } = await readCsv(
      await handleActivityExport(
        get("/api/account/activity/export"),
        deps(ctxOf(evil)),
      ),
    );
    expect(text).toContain(`"'=HYPERLINK(""http://evil.example"",""clic"")"`);
    expect(text).not.toMatch(/,=HYPERLINK/);
  });

  it("annonce la troncature quand le plafond de lignes est atteint", async () => {
    const res = await handleActivityExport(
      get("/api/account/activity/export"),
      deps(ctxOf(a), { exportMaxRows: 2 }),
    );
    expect(res.headers.get("x-nexora-export-rows")).toBe("2");
    expect(res.headers.get("x-nexora-export-truncated")).toBe("true");
    expect((await readCsv(res)).lines).toHaveLength(3);
  });

  it("mêmes contrôles que la lecture JSON : origine, session, paramètres, débit", async () => {
    expect(
      (
        await handleActivityExport(
          get("/api/account/activity/export", {
            origin: "https://evil.example",
          }),
          deps(ctxOf(a)),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handleActivityExport(
          get("/api/account/activity/export"),
          deps(null),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await handleActivityExport(
          get("/api/account/activity/export?period=zzz"),
          deps(ctxOf(a)),
        )
      ).status,
    ).toBe(422);
    const lonely = await org("Export");
    let last = 200;
    for (let i = 0; i < 12; i++)
      last = (
        await handleActivityExport(
          get("/api/account/activity/export"),
          deps(ctxOf(lonely)),
        )
      ).status;
    expect(last).toBe(429);
  });
});
