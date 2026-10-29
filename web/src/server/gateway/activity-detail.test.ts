import { sql } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getActivityDetail } from "./activity-detail";
import { createApiKey } from "./keys";
import { newOrganization } from "./test-support";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

async function event(org: string, keyId: string, requestId: string) {
  const rows = await t.db.execute<{ id: string }>(sql`
    INSERT INTO usage_events (
      request_id, organization_id, api_key_id, model_public_id, endpoint, config_version,
      status, http_status, error_code, stream, prompt_tokens, completion_tokens, cached_tokens,
      cache_write_tokens, reasoning_tokens, cost_micro, value_micro, billed, upstream_cost_usd_micro,
      price_input_micro, price_output_micro, price_cache_micro, price_window, route_position,
      latency_ms, privacy_decision, policy_version, created_at
    ) VALUES (
      ${requestId}, ${org}, ${keyId}, 'nexora/deepseek-v4.1-flash-1017', 'chat.completions', 'cat_x',
      'ok', 200, NULL, true, 1200, 300, 200, 0, 40, 9100, 9100, true, 4321,
      462825, 1851300, 9000, 'creux', 1,
      850, 'mask', 'pol_3', '2026-10-28T12:00:00Z'::timestamptz
    ) RETURNING id::text AS id
  `);
  return [...rows][0]?.id as string;
}

describe("détail d'une requête (métadonnées seulement)", () => {
  it("rend les champs prévus : jetons, prix appliqués, coût, délai, décision de confidentialité", async () => {
    const org = await newOrganization(t.db);
    const { record } = await createApiKey(t.db, {
      organizationId: org,
      name: "Production",
    });
    const id = await event(org, record.id, "req_detail_1");
    const d = await getActivityDetail(t.db, org, id);
    expect(d).toMatchObject({
      id,
      requestId: "req_detail_1",
      model: "nexora/deepseek-v4.1-flash-1017",
      endpoint: "chat.completions",
      apiKeyName: "Production",
      apiKeyPrefix: record.prefix,
      status: "ok",
      httpStatus: 200,
      stream: true,
      promptTokens: 1200,
      completionTokens: 300,
      cachedTokens: 200,
      reasoningTokens: 40,
      costMicro: 9100n,
      billed: true,
      priceInputMicro: 462825n,
      priceOutputMicro: 1851300n,
      priceCacheMicro: 9000n,
      priceWindow: "creux",
      latencyMs: 850,
      privacyDecision: "mask",
    });
  });

  it("n'expose jamais le coût amont, la route de secours ni la version interne de catalogue", async () => {
    const org = await newOrganization(t.db);
    const { record } = await createApiKey(t.db, {
      organizationId: org,
      name: "k",
    });
    const id = await event(org, record.id, "req_detail_2");
    const d = await getActivityDetail(t.db, org, id);
    const text = JSON.stringify(d, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    for (const secret of [
      "upstream",
      "4321",
      "routePosition",
      "configVersion",
      "cat_x",
      "policyVersion",
    ])
      expect(text).not.toContain(secret);
  });

  it("introuvable : autre organisation, identifiant inconnu ou mal formé", async () => {
    const a = await newOrganization(t.db);
    const b = await newOrganization(t.db);
    const { record } = await createApiKey(t.db, {
      organizationId: a,
      name: "k",
    });
    const id = await event(a, record.id, "req_detail_3");
    expect(await getActivityDetail(t.db, b, id)).toBeNull();
    expect(
      await getActivityDetail(t.db, a, "00000000-0000-4000-8000-000000000000"),
    ).toBeNull();
    expect(
      await getActivityDetail(t.db, a, "pas-un-uuid' OR 1=1 --"),
    ).toBeNull();
  });
});
