import { and, apiKeys, eq, organizations } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  authenticateApiKey,
  createApiKey,
  generateApiKey,
  hashApiKey,
  listApiKeys,
  revokeApiKey,
} from "./keys";

let t: TestDatabase;
const ORG = "org_keys_a";
const OTHER = "org_keys_b";

beforeAll(async () => {
  t = await createTestDatabase();
  for (const id of [ORG, OTHER])
    await t.db
      .insert(organizations)
      .values({ id, name: id, slug: id, createdAt: new Date() });
});
afterAll(async () => {
  await t.drop();
});

describe("génération et empreinte", () => {
  it("produit 256 bits aléatoires, un préfixe court et une empreinte SHA-256", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).toMatch(/^nxk_[A-Za-z0-9_-]{43}$/);
    expect(a.key).not.toBe(b.key);
    expect(a.prefix).toBe(a.key.slice(0, 11));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).toBe(hashApiKey(a.key));
    expect(a.hash).not.toContain(a.key.slice(4, 20));
  });
});

describe("création, authentification, révocation", () => {
  it("ne conserve que l'empreinte : la valeur n'est jamais en base", async () => {
    const created = await createApiKey(t.db, {
      organizationId: ORG,
      name: "Production",
    });
    const rows = await t.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, created.record.id));
    expect(
      JSON.stringify(rows, (_k, v) =>
        typeof v === "bigint" ? v.toString() : v,
      ),
    ).not.toContain(created.key.slice(4));
    expect(rows[0]?.keyHash).toBe(hashApiKey(created.key));
    expect(rows[0]?.prefix).toBe(created.key.slice(0, 11));
  });

  it("authentifie une clé valide et met à jour le dernier usage", async () => {
    const { key, record } = await createApiKey(t.db, {
      organizationId: ORG,
      name: "k1",
    });
    const r = await authenticateApiKey(t.db, `Bearer ${key}`);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.key.id).toBe(record.id);
      expect(r.key.organizationId).toBe(ORG);
    }
    const [row] = await t.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, record.id));
    expect(row?.lastUsedAt).toBeInstanceOf(Date);
  });

  it("refuse une clé inconnue, mal formée ou absente", async () => {
    for (const header of [
      null,
      "",
      "Bearer",
      "Basic abc",
      "Bearer nxk_inconnue",
      `Bearer ${generateApiKey().key}`,
    ]) {
      const r = await authenticateApiKey(t.db, header);
      expect(r).toEqual({ ok: false, code: "invalid_api_key" });
    }
  });

  it("refuse une clé révoquée, tout de suite", async () => {
    const { key, record } = await createApiKey(t.db, {
      organizationId: ORG,
      name: "k2",
    });
    expect((await authenticateApiKey(t.db, `Bearer ${key}`)).ok).toBe(true);
    expect(await revokeApiKey(t.db, ORG, record.id)).toBe(true);
    expect(await authenticateApiKey(t.db, `Bearer ${key}`)).toEqual({
      ok: false,
      code: "api_key_revoked",
    });
  });

  it("refuse une clé expirée", async () => {
    const { key } = await createApiKey(t.db, {
      organizationId: ORG,
      name: "k3",
      expiresAt: new Date("2026-01-01T00:00:00Z"),
    });
    expect(
      await authenticateApiKey(
        t.db,
        `Bearer ${key}`,
        new Date("2026-06-01T00:00:00Z"),
      ),
    ).toEqual({ ok: false, code: "api_key_expired" });
    expect(
      (
        await authenticateApiKey(
          t.db,
          `Bearer ${key}`,
          new Date("2025-12-31T00:00:00Z"),
        )
      ).ok,
    ).toBe(true);
  });

  it("une autre organisation ne peut ni révoquer ni lister la clé", async () => {
    const { key, record } = await createApiKey(t.db, {
      organizationId: ORG,
      name: "k4",
    });
    expect(await revokeApiKey(t.db, OTHER, record.id)).toBe(false);
    expect((await authenticateApiKey(t.db, `Bearer ${key}`)).ok).toBe(true);
    const others = await listApiKeys(t.db, OTHER);
    expect(others.find((k) => k.id === record.id)).toBeUndefined();
    const mine = await listApiKeys(t.db, ORG);
    expect(mine.find((k) => k.id === record.id)?.prefix).toBe(key.slice(0, 11));
    // la liste n'expose jamais l'empreinte
    expect(Object.keys(mine[0] ?? {})).not.toContain("keyHash");
  });

  it("valide le nom et les limites", async () => {
    await expect(
      createApiKey(t.db, { organizationId: ORG, name: "" }),
    ).rejects.toThrow();
    await expect(
      createApiKey(t.db, { organizationId: ORG, name: "x", rpmLimit: 0 }),
    ).rejects.toThrow();
    await expect(
      createApiKey(t.db, { organizationId: ORG, name: "x", spendCapMicro: 0n }),
    ).rejects.toThrow();
  });

  it("la révocation est idempotente", async () => {
    const { record } = await createApiKey(t.db, {
      organizationId: ORG,
      name: "k5",
    });
    expect(await revokeApiKey(t.db, ORG, record.id)).toBe(true);
    expect(await revokeApiKey(t.db, ORG, record.id)).toBe(true);
    const [row] = await t.db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.id, record.id)));
    expect(row?.revokedAt).toBeInstanceOf(Date);
  });
});
