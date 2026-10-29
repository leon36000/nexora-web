import { sql, usageEvents } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ACTIVITY_PERIODS,
  type ActivityFilter,
  activityBreakdown,
  activitySummary,
  decodeCursor,
  encodeCursor,
  iterateActivity,
  listActivity,
  listActivityModels,
  MAX_RANGE_DAYS,
  parseActivityParams,
} from "./activity";
import { createApiKey } from "./keys";
import { newOrganization } from "./test-support";

const NOW = new Date("2026-10-29T15:00:00.000Z");
const DAY = 86_400_000;
const parse = (query: string) =>
  parseActivityParams(new URLSearchParams(query), NOW);

describe("lecture des paramètres de l'activité", () => {
  it("sans paramètre : 30 jours, 25 lignes, aucun filtre ni curseur", () => {
    expect(parse("")).toEqual({
      ok: true,
      period: "30d",
      filter: { from: new Date(NOW.getTime() - 30 * DAY), to: NOW },
      limit: 25,
      cursor: null,
    });
  });

  it("les quatre périodes se calculent à partir de maintenant", () => {
    expect([...ACTIVITY_PERIODS]).toEqual(["24h", "7d", "30d", "90d"]);
    const spans = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 } as const;
    for (const period of ACTIVITY_PERIODS) {
      const r = parse(`period=${period}`);
      expect(r).toMatchObject({ ok: true, period });
      if (r.ok) {
        expect(r.filter.to).toEqual(NOW);
        expect(r.filter.from).toEqual(
          new Date(NOW.getTime() - spans[period] * DAY),
        );
      }
    }
  });

  it("une valeur vide équivaut à l'absence du paramètre (formulaire GET)", () => {
    expect(parse("period=&model=&key=&status=&cursor=&limit=")).toEqual(
      parse(""),
    );
  });

  it("refuse une période inconnue", () => {
    expect(parse("period=1y")).toEqual({ ok: false, error: "invalid_period" });
    expect(parse("period=30D")).toEqual({ ok: false, error: "invalid_period" });
  });

  it("période personnalisée : dates ISO avec fuseau, ou date seule (minuit UTC)", () => {
    const r = parse("from=2026-01-01&to=2026-06-01T12:00:00-04:00");
    expect(r).toMatchObject({ ok: true, period: "custom" });
    if (r.ok) {
      expect(r.filter.from).toEqual(new Date("2026-01-01T00:00:00Z"));
      expect(r.filter.to).toEqual(new Date("2026-06-01T16:00:00Z"));
    }
  });

  it("bornes : au plus 366 jours, to après from, les deux dates ensemble, jamais avec une période", () => {
    expect(MAX_RANGE_DAYS).toBe(366);
    expect(parse("from=2025-10-29&to=2026-10-30")).toMatchObject({
      ok: true,
      period: "custom",
    }); // exactement 366 jours
    expect(parse("from=2025-10-29&to=2026-10-31")).toEqual({
      ok: false,
      error: "range_too_long",
    });
    expect(parse("from=2026-10-01")).toEqual({
      ok: false,
      error: "invalid_range",
    });
    expect(parse("to=2026-10-01")).toEqual({
      ok: false,
      error: "invalid_range",
    });
    expect(parse("from=2026-10-02&to=2026-10-01")).toEqual({
      ok: false,
      error: "invalid_range",
    });
    expect(parse("from=2026-10-01&to=2026-10-01")).toEqual({
      ok: false,
      error: "invalid_range",
    });
    expect(parse("from=hier&to=2026-10-01")).toEqual({
      ok: false,
      error: "invalid_range",
    });
    expect(parse("from=2026-02-31&to=2026-03-05")).toEqual({
      ok: false,
      error: "invalid_range",
    });
    // Date-heure sans fuseau : ambiguë, refusée.
    expect(parse("from=2026-10-01T10:00:00&to=2026-10-02T10:00:00")).toEqual({
      ok: false,
      error: "invalid_range",
    });
    expect(parse("period=7d&from=2026-10-01&to=2026-10-05")).toEqual({
      ok: false,
      error: "invalid_range",
    });
  });

  it("filtres : modèle, clé, statut", () => {
    const key = "3f2b8c1e-5d4a-4b6c-9e7f-0a1b2c3d4e5f";
    const r = parse(`model=agent/facturation&key=${key}&status=error`);
    expect(r).toMatchObject({
      ok: true,
      filter: { model: "agent/facturation", apiKeyId: key, status: "error" },
    });
    for (const status of ["ok", "error", "aborted"])
      expect(parse(`status=${status}`)).toMatchObject({ ok: true });
    expect(parse("status=succes")).toEqual({
      ok: false,
      error: "invalid_status",
    });
    expect(parse("key=abc")).toEqual({ ok: false, error: "invalid_key" });
    expect(parse("key=3f2b8c1e-5d4a-4b6c-9e7f-0a1b2c3d4e5fXX")).toEqual({
      ok: false,
      error: "invalid_key",
    });
    expect(parse(`model=${encodeURIComponent("a\nb")}`)).toEqual({
      ok: false,
      error: "invalid_model",
    });
    expect(parse(`model=${"m".repeat(201)}`)).toEqual({
      ok: false,
      error: "invalid_model",
    });
  });

  it("limite : entier de 1 à 100", () => {
    expect(parse("limit=1")).toMatchObject({ ok: true, limit: 1 });
    expect(parse("limit=100")).toMatchObject({ ok: true, limit: 100 });
    for (const bad of ["0", "101", "-3", "2.5", "abc", "1e2"])
      expect(parse(`limit=${bad}`)).toEqual({
        ok: false,
        error: "invalid_limit",
      });
  });
});

describe("curseur de pagination", () => {
  const cursor = {
    createdAt: "2026-10-29T12:34:56.123456Z",
    id: "3f2b8c1e-5d4a-4b6c-9e7f-0a1b2c3d4e5f",
  };

  it("fait l'aller-retour sans perdre les microsecondes", () => {
    const text = encodeCursor(cursor);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/); // base64url : sûr dans une adresse
    expect(decodeCursor(text)).toEqual(cursor);
    expect(parse(`cursor=${text}`)).toMatchObject({ ok: true, cursor });
  });

  it("refuse tout ce qui n'est pas un curseur produit par le serveur", () => {
    const wrong = (s: string) => Buffer.from(s).toString("base64url");
    for (const bad of [
      "",
      "pas un curseur",
      "!!!",
      wrong("hello"),
      wrong("2026-10-29T12:34:56Z|pas-un-uuid"),
      wrong(`2026-13-45T99:99:99.123456Z|${cursor.id}`),
      wrong(`'; DROP TABLE usage_events; --|${cursor.id}`),
      wrong(`${cursor.createdAt}|${cursor.id}|extra`),
    ])
      expect(decodeCursor(bad)).toBeNull();
    expect(parse("cursor=n-importe-quoi")).toEqual({
      ok: false,
      error: "invalid_cursor",
    });
  });
});

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

let seq = 0;

interface Seed {
  org: string;
  keyId: string;
  /** Date, ou texte ISO avec microsecondes (inséré tel quel). */
  at: Date | string;
  model?: string;
  status?: "ok" | "error" | "aborted";
  httpStatus?: number;
  errorCode?: string | null;
  prompt?: number;
  completion?: number;
  cached?: number;
  cost?: bigint;
  value?: bigint;
  billed?: boolean;
  latency?: number;
}

async function addEvent(s: Seed): Promise<string> {
  seq += 1;
  const at = typeof s.at === "string" ? s.at : s.at.toISOString();
  const rows = await t.db.execute<{ id: string }>(sql`
    INSERT INTO usage_events (
      request_id, organization_id, api_key_id, model_public_id, endpoint, config_version,
      status, http_status, error_code, prompt_tokens, completion_tokens, cached_tokens,
      cost_micro, value_micro, billed, latency_ms, created_at
    ) VALUES (
      ${`req_act_${seq}`}, ${s.org}, ${s.keyId}, ${s.model ?? "nexora/test"}, 'chat.completions', 'cat_x',
      ${s.status ?? "ok"}, ${s.httpStatus ?? 200}, ${s.errorCode ?? null},
      ${s.prompt ?? 0}, ${s.completion ?? 0}, ${s.cached ?? 0},
      ${(s.cost ?? 0n).toString()}::bigint, ${(s.value ?? s.cost ?? 0n).toString()}::bigint,
      ${s.billed ?? true}, ${s.latency ?? 0}, ${at}::timestamptz
    ) RETURNING id
  `);
  return [...rows][0]?.id as string;
}

async function newOrgWithKey(name = "Production") {
  const org = await newOrganization(t.db);
  const { record } = await createApiKey(t.db, { organizationId: org, name });
  return { org, keyId: record.id };
}

const WINDOW = {
  from: new Date("2026-10-01T00:00:00Z"),
  to: new Date("2026-11-01T00:00:00Z"),
};
const filterOf = (
  org: string,
  extra: Partial<ActivityFilter> = {},
): ActivityFilter => ({ organizationId: org, ...WINDOW, ...extra });
const inOct = (day: number, hour = 12) =>
  new Date(Date.UTC(2026, 9, day, hour));

describe("synthèse de l'activité", () => {
  it("additionne requêtes, erreurs, jetons, coût et latence moyenne", async () => {
    const { org, keyId } = await newOrgWithKey();
    await addEvent({
      org,
      keyId,
      at: inOct(5),
      prompt: 100,
      completion: 50,
      cached: 20,
      cost: 250n,
      latency: 100,
    });
    await addEvent({
      org,
      keyId,
      at: inOct(6),
      prompt: 200,
      completion: 10,
      cost: 400n,
      latency: 200,
    });
    await addEvent({
      org,
      keyId,
      at: inOct(7),
      status: "error",
      httpStatus: 502,
      errorCode: "upstream_error",
      latency: 301,
    });
    expect(await activitySummary(t.db, filterOf(org))).toEqual({
      requests: 3,
      errors: 1,
      promptTokens: 300,
      completionTokens: 60,
      cachedTokens: 20,
      costMicro: 650n,
      valueMicro: 650n,
      avgLatencyMs: 200, // (100 + 200 + 301) / 3 = 200,33
    });
  });

  it("sans événement : tout à zéro et latence nulle", async () => {
    const { org } = await newOrgWithKey();
    expect(await activitySummary(t.db, filterOf(org))).toEqual({
      requests: 0,
      errors: 0,
      promptTokens: 0,
      completionTokens: 0,
      cachedTokens: 0,
      costMicro: 0n,
      valueMicro: 0n,
      avgLatencyMs: null,
    });
  });

  it("les montants restent exacts au-delà de 2^53", async () => {
    const { org, keyId } = await newOrgWithKey();
    const big = 9_007_199_254_740_993n; // 2^53 + 1
    await addEvent({ org, keyId, at: inOct(3), cost: big });
    await addEvent({ org, keyId, at: inOct(4), cost: big });
    const s = await activitySummary(t.db, filterOf(org));
    expect(s.costMicro).toBe(18_014_398_509_481_986n);
    expect(s.valueMicro).toBe(18_014_398_509_481_986n);
  });

  it("une organisation « maison » : rien de facturé, mais la valeur au prix public", async () => {
    const { org, keyId } = await newOrgWithKey();
    await addEvent({
      org,
      keyId,
      at: inOct(3),
      cost: 0n,
      value: 777n,
      billed: false,
    });
    expect(await activitySummary(t.db, filterOf(org))).toMatchObject({
      costMicro: 0n,
      valueMicro: 777n,
    });
  });

  it("bornes de période : from inclus, to exclu", async () => {
    const { org, keyId } = await newOrgWithKey();
    await addEvent({ org, keyId, at: "2026-09-30T23:59:59.999999Z" }); // avant
    await addEvent({ org, keyId, at: "2026-10-01T00:00:00.000000Z" }); // pile from
    await addEvent({ org, keyId, at: "2026-10-31T23:59:59.999999Z" }); // dernier instant
    await addEvent({ org, keyId, at: "2026-11-01T00:00:00.000000Z" }); // pile to
    expect((await activitySummary(t.db, filterOf(org))).requests).toBe(2);
  });

  it("filtres de modèle, de clé et de statut se cumulent", async () => {
    const a = await newOrgWithKey("A");
    const second = await createApiKey(t.db, {
      organizationId: a.org,
      name: "B",
    });
    await addEvent({ ...a, at: inOct(2), model: "nexora/x" });
    await addEvent({ ...a, at: inOct(2), model: "nexora/y" });
    await addEvent({
      ...a,
      at: inOct(2),
      model: "nexora/x",
      status: "error",
      httpStatus: 500,
    });
    await addEvent({
      org: a.org,
      keyId: second.record.id,
      at: inOct(2),
      model: "nexora/x",
    });
    const count = async (extra: Partial<ActivityFilter>) =>
      (await activitySummary(t.db, filterOf(a.org, extra))).requests;
    expect(await count({})).toBe(4);
    expect(await count({ model: "nexora/x" })).toBe(3);
    expect(await count({ apiKeyId: a.keyId })).toBe(3);
    expect(await count({ status: "error" })).toBe(1);
    expect(
      await count({
        model: "nexora/x",
        apiKeyId: a.keyId,
        status: "ok",
      }),
    ).toBe(1);
  });
});

describe("répartitions", () => {
  it("par modèle (sans les agents), par agent, par clé et par jour", async () => {
    const { org, keyId } = await newOrgWithKey("Production");
    const other = await createApiKey(t.db, {
      organizationId: org,
      name: "Essais",
    });
    await addEvent({
      org,
      keyId,
      at: inOct(5),
      model: "nexora/grand",
      prompt: 10,
      completion: 5,
      cost: 900n,
    });
    await addEvent({
      org,
      keyId,
      at: inOct(5),
      model: "nexora/petit",
      prompt: 1,
      completion: 1,
      cost: 100n,
    });
    await addEvent({
      org,
      keyId: other.record.id,
      at: inOct(6),
      model: "nexora/grand",
      prompt: 20,
      completion: 5,
      cost: 300n,
    });
    await addEvent({
      org,
      keyId,
      at: inOct(6),
      model: "agent/facturation",
      prompt: 7,
      completion: 3,
      cost: 5_000n,
    });
    const f = filterOf(org);

    const byModel = await activityBreakdown(t.db, f, "model");
    expect(byModel.map((r) => [r.key, r.requests, r.costMicro])).toEqual([
      ["nexora/grand", 2, 1_200n], // classé par dépense décroissante
      ["nexora/petit", 1, 100n],
    ]);
    expect(byModel[0]).toMatchObject({
      promptTokens: 30,
      completionTokens: 10,
    });

    const byAgent = await activityBreakdown(t.db, f, "agent");
    expect(byAgent.map((r) => [r.key, r.requests, r.costMicro])).toEqual([
      ["agent/facturation", 1, 5_000n],
    ]);

    const byKey = await activityBreakdown(t.db, f, "key");
    expect(byKey.map((r) => [r.label, r.requests, r.costMicro])).toEqual([
      ["Production", 3, 6_000n],
      ["Essais", 1, 300n],
    ]);
    expect(byKey[0]?.key).toBe(keyId);
    expect(byKey[0]?.keyPrefix).toMatch(/^nxk_/);

    const byDay = await activityBreakdown(t.db, f, "day");
    expect(byDay.map((r) => [r.key, r.requests, r.costMicro])).toEqual([
      ["2026-10-05", 2, 1_000n], // ordre chronologique
      ["2026-10-06", 2, 5_300n],
    ]);
  });

  it("les jours suivent le fuseau de Montréal (comme le tableau d'usage existant)", async () => {
    const { org, keyId } = await newOrgWithKey();
    // Heure d'été (UTC-4) jusqu'au 1er novembre 2026 : 03 h 30 UTC = 23 h 30 la veille.
    await addEvent({ org, keyId, at: "2026-10-29T03:30:00Z" });
    await addEvent({ org, keyId, at: "2026-10-29T04:30:00Z" });
    // Heure normale (UTC-5) après le changement : 04 h 30 UTC = 23 h 30 la veille aussi.
    await addEvent({ org, keyId, at: "2026-11-02T04:30:00Z" });
    const days = await activityBreakdown(
      t.db,
      {
        organizationId: org,
        from: new Date("2026-10-01T00:00:00Z"),
        to: new Date("2026-12-01T00:00:00Z"),
      },
      "day",
    );
    expect(days.map((d) => [d.key, d.requests])).toEqual([
      ["2026-10-28", 1],
      ["2026-10-29", 1],
      ["2026-11-01", 1],
    ]);
  });

  it("les répartitions respectent les filtres", async () => {
    const { org, keyId } = await newOrgWithKey();
    await addEvent({ org, keyId, at: inOct(5), model: "nexora/a", cost: 10n });
    await addEvent({
      org,
      keyId,
      at: inOct(5),
      model: "nexora/b",
      status: "error",
      httpStatus: 500,
    });
    const rows = await activityBreakdown(
      t.db,
      filterOf(org, { status: "error" }),
      "model",
    );
    expect(rows.map((r) => [r.key, r.errors])).toEqual([["nexora/b", 1]]);
  });

  it("liste les modèles et agents vus dans la période, pour le filtre", async () => {
    const { org, keyId } = await newOrgWithKey();
    await addEvent({ org, keyId, at: inOct(5), model: "nexora/b" });
    await addEvent({ org, keyId, at: inOct(5), model: "agent/zeta" });
    await addEvent({ org, keyId, at: inOct(6), model: "nexora/a" });
    await addEvent({ org, keyId, at: "2026-08-01T00:00:00Z", model: "vieux" });
    expect(await listActivityModels(t.db, filterOf(org))).toEqual([
      "agent/zeta",
      "nexora/a",
      "nexora/b",
    ]);
  });
});

describe("isolation stricte par organisation", () => {
  it("rien d'une autre organisation n'apparaît, même avec l'identifiant de sa clé", async () => {
    const a = await newOrgWithKey("Clé A");
    const b = await newOrgWithKey("Clé B");
    await addEvent({
      ...a,
      at: inOct(5),
      model: "nexora/a",
      cost: 100n,
      prompt: 1,
    });
    await addEvent({
      ...b,
      at: inOct(5),
      model: "nexora/b-secret",
      cost: 999_999n,
      prompt: 5000,
    });

    const fa = filterOf(a.org);
    expect(await activitySummary(t.db, fa)).toMatchObject({
      requests: 1,
      costMicro: 100n,
      promptTokens: 1,
    });
    expect((await listActivity(t.db, fa, { limit: 50 })).rows).toHaveLength(1);
    expect(
      (await activityBreakdown(t.db, fa, "model")).map((r) => r.key),
    ).toEqual(["nexora/a"]);
    expect(
      (await activityBreakdown(t.db, fa, "key")).map((r) => r.label),
    ).toEqual(["Clé A"]);
    expect(await listActivityModels(t.db, fa)).toEqual(["nexora/a"]);

    // L'identifiant de la clé de B, présenté dans le filtre de A : aucune ligne, aucun total.
    const spy = filterOf(a.org, { apiKeyId: b.keyId });
    expect(await activitySummary(t.db, spy)).toMatchObject({
      requests: 0,
      costMicro: 0n,
    });
    expect((await listActivity(t.db, spy, { limit: 50 })).rows).toEqual([]);
    expect(await activityBreakdown(t.db, spy, "key")).toEqual([]);
    // Et un modèle de B n'apparaît pas non plus dans le filtre de modèle de A.
    const spyModel = filterOf(a.org, { model: "nexora/b-secret" });
    expect((await activitySummary(t.db, spyModel)).requests).toBe(0);
  });
});

describe("journal des requêtes", () => {
  it("renvoie les métadonnées d'une requête, jamais de contenu", async () => {
    const { org, keyId } = await newOrgWithKey("Production");
    await addEvent({
      org,
      keyId,
      at: inOct(5),
      status: "error",
      httpStatus: 502,
      errorCode: "upstream_error",
      prompt: 12,
      completion: 3,
      cached: 4,
      cost: 0n,
      latency: 77,
    });
    const { rows, nextCursor } = await listActivity(t.db, filterOf(org), {
      limit: 10,
    });
    expect(nextCursor).toBeNull();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toMatchObject({
      model: "nexora/test",
      endpoint: "chat.completions",
      apiKeyId: keyId,
      apiKeyName: "Production",
      status: "error",
      httpStatus: 502,
      errorCode: "upstream_error",
      promptTokens: 12,
      completionTokens: 3,
      cachedTokens: 4,
      costMicro: 0n,
      billed: true,
      latencyMs: 77,
    });
    expect(row?.apiKeyPrefix).toMatch(/^nxk_/);
    expect(row?.createdAt).toEqual(inOct(5));
    // Aucune propriété ne peut porter un contenu de requête : la liste est fermée.
    expect(Object.keys(row ?? {}).sort()).toEqual(
      [
        "apiKeyId",
        "apiKeyName",
        "apiKeyPrefix",
        "billed",
        "cachedTokens",
        "completionTokens",
        "costMicro",
        "createdAt",
        "endpoint",
        "errorCode",
        "httpStatus",
        "id",
        "latencyMs",
        "model",
        "promptTokens",
        "reasoningTokens",
        "requestId",
        "status",
        "stream",
        "valueMicro",
      ].sort(),
    );
  });

  it("pagination par curseur : stable, sans doublon ni trou, même à la microseconde près", async () => {
    const { org, keyId } = await newOrgWithKey();
    const stamps = [
      "2026-10-29T12:00:00.000100Z",
      "2026-10-29T12:00:00.000200Z",
      "2026-10-29T12:00:00.000200Z", // même instant : l'identifiant départage
      "2026-10-29T12:00:00.000200Z",
      "2026-10-29T12:00:00.000300Z",
      "2026-10-29T11:00:00.000000Z",
      "2026-10-28T09:00:00.500000Z",
    ];
    for (const at of stamps) await addEvent({ org, keyId, at });

    const expected = [
      ...(await t.db.execute<{ id: string }>(sql`
        SELECT id FROM usage_events WHERE organization_id = ${org}
        ORDER BY created_at DESC, id DESC
      `)),
    ].map((r) => r.id);
    expect(expected).toHaveLength(7);

    for (const limit of [1, 2, 3, 7, 50]) {
      const seen: string[] = [];
      let cursor: string | null = null;
      for (let guard = 0; guard < 20; guard++) {
        const page = await listActivity(t.db, filterOf(org), {
          limit,
          cursor: cursor ? decodeCursor(cursor) : null,
        });
        expect(page.rows.length).toBeLessThanOrEqual(limit);
        seen.push(...page.rows.map((r) => r.id));
        cursor = page.nextCursor;
        if (!cursor) break;
      }
      expect(seen, `limite ${limit}`).toEqual(expected);
    }
  });

  it("des événements plus récents arrivés entre deux pages ne décalent pas la suite", async () => {
    const { org, keyId } = await newOrgWithKey();
    for (let i = 1; i <= 5; i++)
      await addEvent({ org, keyId, at: inOct(10, i) });
    const first = await listActivity(t.db, filterOf(org), { limit: 2 });
    expect(first.rows).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    await addEvent({ org, keyId, at: inOct(20) }); // nouvelle requête, plus récente
    const second = await listActivity(t.db, filterOf(org), {
      limit: 2,
      cursor: decodeCursor(first.nextCursor ?? ""),
    });
    const firstIds = new Set(first.rows.map((r) => r.id));
    expect(second.rows).toHaveLength(2);
    expect(second.rows.some((r) => firstIds.has(r.id))).toBe(false);
    expect(second.rows.map((r) => r.createdAt)).toEqual([
      inOct(10, 3),
      inOct(10, 2),
    ]);
  });

  it("un curseur d'une autre organisation ne révèle rien : la portée vient du filtre", async () => {
    const a = await newOrgWithKey();
    const b = await newOrgWithKey();
    const bId = await addEvent({ ...b, at: inOct(5) });
    await addEvent({ ...a, at: inOct(5, 6) });
    const page = await listActivity(t.db, filterOf(a.org), {
      limit: 10,
      cursor: { createdAt: "2026-10-31T00:00:00.000000Z", id: bId },
    });
    expect(page.rows.every((r) => r.id !== bId)).toBe(true);
    expect(page.rows).toHaveLength(1);
  });

  it("itère tout le journal par paquets, avec un plafond de lignes", async () => {
    const { org, keyId } = await newOrgWithKey();
    for (let i = 1; i <= 7; i++)
      await addEvent({ org, keyId, at: inOct(12, i) });
    const all: string[] = [];
    for await (const row of iterateActivity(t.db, filterOf(org), {
      pageSize: 3,
    }))
      all.push(row.id);
    expect(all).toHaveLength(7);
    expect(new Set(all).size).toBe(7);

    const capped: string[] = [];
    for await (const row of iterateActivity(t.db, filterOf(org), {
      pageSize: 3,
      maxRows: 5,
    }))
      capped.push(row.id);
    expect(capped).toEqual(all.slice(0, 5));
  });
});

describe("le journal ne lit que usage_events", () => {
  it("la table n'a pas de colonne de contenu (garde contre un ajout futur)", async () => {
    const rows = await t.db.execute<{ column_name: string }>(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'usage_events' AND table_schema = current_schema()
    `);
    const names = [...rows].map((r) => r.column_name);
    expect(names).toContain("prompt_tokens");
    for (const forbidden of [
      "prompt",
      "messages",
      "content",
      "input",
      "output",
      "response",
      "body",
    ])
      expect(names).not.toContain(forbidden);
    // Et la définition Drizzle expose les mêmes colonnes que celles que le journal choisit une à une.
    expect(Object.keys(usageEvents)).toContain("promptTokens");
  });
});
