import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  hostedAgentInstances,
  hostedAgentPrices,
  hostedAgents,
  workstudioEmbedSettings,
} from "./schema.ts";
import { createTestDatabase, type TestDatabase } from "./testing.ts";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

async function newAgent(slug: string) {
  const [instance] = await t.db
    .insert(hostedAgentInstances)
    .values({
      code: `inst-${slug}`,
      name: "Instance d'essai",
      baseUrl: "http://127.0.0.1:3200",
    })
    .returning();
  if (!instance) throw new Error("instance");
  const [agent] = await t.db
    .insert(hostedAgents)
    .values({ slug, instanceId: instance.id, upstreamId: `agent:${slug}` })
    .returning();
  if (!agent) throw new Error("agent");
  return agent;
}

describe("agents hébergés (migration 0008)", () => {
  it("applique les valeurs par défaut sûres : brouillon, public, plafond d'exécution", async () => {
    const agent = await newAgent("defauts");
    expect(agent).toMatchObject({
      status: "draft",
      visibility: "public",
      category: "general",
      runTokenCap: 32000,
    });
  });

  it("refuse un slug invalide, un identifiant amont sans préfixe et un statut inconnu", async () => {
    const agent = await newAgent("valide-1");
    const bad = (values: Record<string, unknown>) =>
      t.db
        .insert(hostedAgents)
        .values({
          slug: "ok-slug",
          instanceId: agent.instanceId,
          upstreamId: "agent:x",
          ...values,
        })
        .execute();
    await expect(bad({ slug: "Majuscule" })).rejects.toThrow();
    await expect(bad({ slug: "-tiret" })).rejects.toThrow();
    await expect(bad({ upstreamId: "sans-prefixe" })).rejects.toThrow();
    await expect(bad({ status: "approved" })).rejects.toThrow();
    await expect(bad({ runTokenCap: 0 })).rejects.toThrow();
  });

  it("garde un slug unique et un agent amont unique par instance", async () => {
    const agent = await newAgent("unique-1");
    await expect(
      t.db
        .insert(hostedAgents)
        .values({
          slug: "unique-1",
          instanceId: agent.instanceId,
          upstreamId: "agent:autre",
        })
        .execute(),
    ).rejects.toThrow();
    await expect(
      t.db
        .insert(hostedAgents)
        .values({
          slug: "unique-2",
          instanceId: agent.instanceId,
          upstreamId: agent.upstreamId,
        })
        .execute(),
    ).rejects.toThrow();
  });

  it("refuse un prix à 0 $ et un prix négatif", async () => {
    const agent = await newAgent("prix-zero");
    const insert = (v: {
      inputCadMicro?: bigint;
      outputCadMicro?: bigint;
      perRunCadMicro?: bigint;
    }) =>
      t.db
        .insert(hostedAgentPrices)
        .values({ agentId: agent.id, ...v })
        .execute();
    await expect(insert({})).rejects.toThrow();
    await expect(insert({ perRunCadMicro: -1n })).rejects.toThrow();
    await expect(insert({ perRunCadMicro: 1n })).resolves.toBeDefined();
  });

  it("marque un prix comme valeur d'essai par défaut", async () => {
    const agent = await newAgent("prix-essai");
    const [row] = await t.db
      .insert(hostedAgentPrices)
      .values({ agentId: agent.id, perRunCadMicro: 50_000n })
      .returning();
    expect(row?.isTrial).toBe(true);
  });

  it("rend les prix immuables : ni modification, ni suppression, ni troncature", async () => {
    const agent = await newAgent("prix-immuable");
    const [row] = await t.db
      .insert(hostedAgentPrices)
      .values({ agentId: agent.id, perRunCadMicro: 1_000n })
      .returning();
    if (!row) throw new Error("prix");
    await expect(
      t.sql`UPDATE hosted_agent_prices SET per_run_cad_micro = 2 WHERE id = ${row.id}`,
    ).rejects.toThrow(/ajout seulement/);
    await expect(
      t.sql`DELETE FROM hosted_agent_prices WHERE id = ${row.id}`,
    ).rejects.toThrow(/ajout seulement/);
    await expect(t.sql`TRUNCATE hosted_agent_prices`).rejects.toThrow(
      /ajout seulement/,
    );
  });

  it("n'admet qu'une ligne de réglage de la bulle, désactivée par défaut", async () => {
    const [row] = await t.db
      .insert(workstudioEmbedSettings)
      .values({})
      .returning();
    expect(row).toMatchObject({
      id: "main",
      enabled: false,
      pages: [],
      position: "right",
    });
    await expect(
      t.sql`INSERT INTO workstudio_embed_settings (id) VALUES ('autre')`,
    ).rejects.toThrow();
  });
});
