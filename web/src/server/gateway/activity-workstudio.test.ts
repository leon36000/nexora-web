import { sql, workstudioEmbedSettings } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { publishTestAgent } from "../agents/test-support";
import { getWorkstudioOrigin, listUsedAgents } from "./activity-workstudio";
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
  o: { at: string; model: string; status?: string; cost?: number },
) {
  seq += 1;
  await t.db.execute(sql`
    INSERT INTO usage_events (
      request_id, organization_id, api_key_id, model_public_id, endpoint, config_version,
      status, http_status, prompt_tokens, completion_tokens, cost_micro, value_micro, latency_ms, created_at
    ) VALUES (
      ${`req_ws_${seq}`}, ${org}, ${keyId}, ${o.model}, 'chat.completions', 'cat_x',
      ${o.status ?? "ok"}, 200, 10, 5, ${o.cost ?? 100}, ${o.cost ?? 100}, 40, ${o.at}::timestamptz
    )
  `);
}

describe("agents utilisés par l'organisation", () => {
  it("liste les agents réellement appelés (90 jours), avec leur nom public et leur dépense, sans ceux des autres", async () => {
    const agent = await publishTestAgent(t.db, { slug: "facturation" });
    const unused = await publishTestAgent(t.db, { slug: "jamais-appele" });
    void unused;
    const a = await newOrganization(t.db);
    const b = await newOrganization(t.db);
    const ka = (await createApiKey(t.db, { organizationId: a, name: "k" }))
      .record.id;
    const kb = (await createApiKey(t.db, { organizationId: b, name: "k" }))
      .record.id;
    await event(a, ka, {
      at: "2026-10-20T10:00:00Z",
      model: "agent/facturation",
      cost: 3_000,
    });
    await event(a, ka, {
      at: "2026-10-28T10:00:00Z",
      model: "agent/facturation",
      cost: 2_000,
    });
    await event(a, ka, { at: "2026-10-28T11:00:00Z", model: "nexora/modele" });
    await event(a, ka, {
      at: "2026-05-01T10:00:00Z", // hors des 90 jours
      model: "agent/ancien",
    });
    await event(b, kb, { at: "2026-10-28T10:00:00Z", model: "agent/secret-b" });

    const rows = await listUsedAgents(t.db, a, NOW);
    expect(rows).toEqual([
      {
        id: "agent/facturation",
        slug: "facturation",
        nameFr: `Agent ${agent.slug}`,
        nameEn: `Agent ${agent.slug}`,
        requests: 2,
        lastUsedAt: new Date("2026-10-28T10:00:00Z"),
        costMicro: 5_000n,
      },
    ]);
  });

  it("un agent qui n'est plus au catalogue reste listé, sans nom", async () => {
    const org = await newOrganization(t.db);
    const k = (await createApiKey(t.db, { organizationId: org, name: "k" }))
      .record.id;
    await event(org, k, {
      at: "2026-10-27T10:00:00Z",
      model: "agent/disparu",
    });
    expect(await listUsedAgents(t.db, org, NOW)).toEqual([
      {
        id: "agent/disparu",
        slug: "disparu",
        nameFr: null,
        nameEn: null,
        requests: 1,
        lastUsedAt: new Date("2026-10-27T10:00:00Z"),
        costMicro: 100n,
      },
    ]);
  });

  it("aucun agent appelé : liste vide", async () => {
    expect(
      await listUsedAgents(t.db, await newOrganization(t.db), NOW),
    ).toEqual([]);
  });
});

describe("adresse de l'instance WorkStudio", () => {
  it("null tant que le réglage n'existe pas ou n'a pas d'adresse", async () => {
    expect(await getWorkstudioOrigin(t.db)).toBeNull();
    await t.db.insert(workstudioEmbedSettings).values({ id: "main" });
    expect(await getWorkstudioOrigin(t.db)).toBeNull();
  });

  it("renvoie l'origine publique enregistrée", async () => {
    await t.db
      .update(workstudioEmbedSettings)
      .set({ origin: "https://studio.nexora.example" });
    expect(await getWorkstudioOrigin(t.db)).toBe(
      "https://studio.nexora.example",
    );
  });
});
