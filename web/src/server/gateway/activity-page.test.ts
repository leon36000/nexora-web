import { sql } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadActivityPage } from "./activity-page";
import { createApiKey } from "./keys";
import { newOrganization } from "./test-support";

const NOW = new Date("2026-10-29T15:00:00.000Z");

let t: TestDatabase;
let seq = 0;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

async function event(
  org: string,
  keyId: string,
  o: { at: string; model?: string; status?: string; cost?: number },
) {
  seq += 1;
  await t.db.execute(sql`
    INSERT INTO usage_events (
      request_id, organization_id, api_key_id, model_public_id, endpoint, config_version,
      status, http_status, prompt_tokens, completion_tokens, cost_micro, value_micro, latency_ms, created_at
    ) VALUES (
      ${`req_pg_${seq}`}, ${org}, ${keyId}, ${o.model ?? "nexora/test"}, 'chat.completions', 'cat_x',
      ${o.status ?? "ok"}, ${o.status === "error" ? 502 : 200}, 10, 5, ${o.cost ?? 100}, ${o.cost ?? 100}, 40, ${o.at}::timestamptz
    )
  `);
}

async function seed() {
  const org = await newOrganization(t.db);
  const key = (await createApiKey(t.db, { organizationId: org, name: "Prod" }))
    .record.id;
  await event(org, key, { at: "2026-10-28T12:00:00Z", model: "nexora/a" });
  await event(org, key, {
    at: "2026-10-27T12:00:00Z",
    model: "agent/x",
    cost: 900,
  });
  await event(org, key, {
    at: "2026-10-26T12:00:00Z",
    model: "nexora/b",
    status: "error",
  });
  return { org, key };
}

const params = (q: string) => new URLSearchParams(q);

describe("données de la page Activité", () => {
  it("rassemble synthèse, répartitions, modèles du filtre et première page du journal", async () => {
    const { org } = await seed();
    const d = await loadActivityPage(t.db, org, params(""), NOW);
    expect(d.invalid).toBe(false);
    expect(d.period).toBe("30d");
    expect(d.summary).toMatchObject({
      requests: 3,
      errors: 1,
      costMicro: 1100n,
    });
    expect(d.byModel.map((r) => r.key).sort()).toEqual([
      "nexora/a",
      "nexora/b",
    ]);
    expect(d.byAgent.map((r) => r.key)).toEqual(["agent/x"]);
    expect(d.byKey.map((r) => r.label)).toEqual(["Prod"]);
    expect(d.byDay).toHaveLength(3);
    expect(d.models).toEqual(["agent/x", "nexora/a", "nexora/b"]);
    expect(d.page.rows).toHaveLength(3);
    expect(d.hasCursor).toBe(false);
  });

  it("applique les filtres de l'adresse", async () => {
    const { org, key } = await seed();
    const d = await loadActivityPage(
      t.db,
      org,
      params(`status=error&key=${key}&period=7d`),
      NOW,
    );
    expect(d.period).toBe("7d");
    expect(d.criteria).toMatchObject({ status: "error", apiKeyId: key });
    expect(d.summary.requests).toBe(1);
    expect(d.page.rows.map((r) => r.model)).toEqual(["nexora/b"]);
  });

  it("des critères invalides sont écartés : valeurs par défaut et drapeau pour le dire", async () => {
    const { org } = await seed();
    for (const bad of [
      "period=1y",
      "status=zzz",
      "cursor=nimporte",
      "key=pas-un-uuid",
      "from=2020-01-01&to=2026-01-01",
    ]) {
      const d = await loadActivityPage(t.db, org, params(bad), NOW);
      expect(d.invalid, bad).toBe(true);
      expect(d.period, bad).toBe("30d");
      expect(d.summary.requests, bad).toBe(3);
    }
  });

  it("pagination : la page suivante repart du curseur et le dit", async () => {
    const { org } = await seed();
    const first = await loadActivityPage(t.db, org, params("limit=2"), NOW);
    expect(first.page.rows).toHaveLength(2);
    expect(first.page.nextCursor).not.toBeNull();
    const second = await loadActivityPage(
      t.db,
      org,
      params(`limit=2&cursor=${first.page.nextCursor}`),
      NOW,
    );
    expect(second.hasCursor).toBe(true);
    expect(second.page.rows).toHaveLength(1);
    expect(second.page.nextCursor).toBeNull();
    // La synthèse porte sur toute la période, pas sur la page.
    expect(second.summary.requests).toBe(3);
  });

  it("n'expose rien d'une autre organisation, même avec sa clé dans l'adresse", async () => {
    const a = await seed();
    const b = await seed();
    const d = await loadActivityPage(t.db, a.org, params(`key=${b.key}`), NOW);
    expect(d.summary.requests).toBe(0);
    expect(d.page.rows).toEqual([]);
    expect(d.byKey).toEqual([]);
  });
});
