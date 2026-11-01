import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type CreativeConfig, defaultCreativeConfig } from "./config";
import { pgCreativeStore } from "./store";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

const config = (): CreativeConfig => ({
  version: 1,
  llm: { default: "glm-5.3", roles: { redaction: "glm-5.3" } },
  engines: [
    {
      id: "rtx5090",
      label: "RTX 5090",
      kind: "local",
      baseUrl: "http://10.0.0.5:8189",
      comfyUrl: "http://10.0.0.5:8188",
      recipes: ["h3-fast"],
    },
  ],
});

describe("stockage PostgreSQL de la configuration de Nexora Creative", () => {
  it("sans ligne : configuration par défaut et aucune date (rien n'est forcé)", async () => {
    const r = await pgCreativeStore(t.db).read();
    expect(r.config).toEqual(defaultCreativeConfig());
    expect(r.updatedAt).toBeNull();
  });

  it("écrit puis relit, remplace à l'écriture suivante (une seule ligne)", async () => {
    const store = pgCreativeStore(t.db);
    const first = await store.write(config(), "admin");
    expect((await store.read()).config).toEqual(config());
    const next = { ...config(), llm: { default: null, roles: {} } };
    const second = await store.write(next, "admin");
    expect(second.getTime()).toBeGreaterThanOrEqual(first.getTime());
    expect((await store.read()).config.llm.default).toBeNull();
    const rows = await t.sql`SELECT count(*)::int AS n FROM creative_settings`;
    expect(rows[0].n).toBe(1);
  });

  it("une ligne illisible redonne la configuration par défaut au lieu de casser", async () => {
    await t.sql`UPDATE creative_settings SET value = '{"version": 99}'::jsonb WHERE key = 'models'`;
    const r = await pgCreativeStore(t.db).read();
    expect(r.config).toEqual(defaultCreativeConfig());
    expect(r.updatedAt).toBeNull();
  });
});
