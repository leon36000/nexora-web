import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiKey, revokeApiKey } from "./keys";
import { WORKSTUDIO_KEY_NAME } from "./provision";
import { newOrganization } from "./test-support";
import { loadWorkstudioLink } from "./workstudio-link";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});
const NOW = new Date("2026-10-29T15:00:00Z");

describe("branchement de WorkStudio sur un modèle", () => {
  it("aucune clé automatique : non branché", async () => {
    const org = await newOrganization(t.db);
    await createApiKey(t.db, { organizationId: org, name: "Production" });
    expect(await loadWorkstudioLink(t.db, org, NOW)).toBeNull();
  });

  it("clé automatique active : préfixe, création et dernier usage", async () => {
    const org = await newOrganization(t.db);
    const { record } = await createApiKey(t.db, {
      organizationId: org,
      name: WORKSTUDIO_KEY_NAME,
    });
    const link = await loadWorkstudioLink(t.db, org, NOW);
    expect(link).toMatchObject({
      id: record.id,
      prefix: record.prefix,
      lastUsedAt: null,
    });
    expect(link).not.toHaveProperty("keyHash");
  });

  it("clé révoquée ou expirée : non branché ; clé d'une autre organisation : jamais vue", async () => {
    const a = await newOrganization(t.db);
    const b = await newOrganization(t.db);
    const k = await createApiKey(t.db, {
      organizationId: a,
      name: WORKSTUDIO_KEY_NAME,
    });
    await revokeApiKey(t.db, a, k.record.id, NOW);
    expect(await loadWorkstudioLink(t.db, a, NOW)).toBeNull();
    await createApiKey(t.db, {
      organizationId: b,
      name: WORKSTUDIO_KEY_NAME,
      expiresAt: new Date("2026-10-01T00:00:00Z"),
    });
    expect(await loadWorkstudioLink(t.db, b, NOW)).toBeNull();
    expect(await loadWorkstudioLink(t.db, a, NOW)).toBeNull();
  });

  it("la plus récente des clés actives est retenue", async () => {
    const org = await newOrganization(t.db);
    await createApiKey(t.db, {
      organizationId: org,
      name: WORKSTUDIO_KEY_NAME,
    });
    const second = await createApiKey(t.db, {
      organizationId: org,
      name: WORKSTUDIO_KEY_NAME,
    });
    expect((await loadWorkstudioLink(t.db, org, NOW))?.id).toBe(
      second.record.id,
    );
  });
});
