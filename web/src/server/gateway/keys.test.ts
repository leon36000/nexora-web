import { and, apiKeys, eq, organizations } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ApiKeyLimitError,
  authenticateApiKey,
  createApiKey,
  generateApiKey,
  hashApiKey,
  listApiKeys,
  MAX_ACTIVE_KEYS_PER_ORGANIZATION,
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

  it("le schéma Bearer est insensible à la casse (RFC 7235), la clé, elle, reste sensible", async () => {
    const { key } = await createApiKey(t.db, {
      organizationId: ORG,
      name: "k-casse",
    });
    for (const scheme of ["bearer", "BEARER", "BeArEr"])
      expect((await authenticateApiKey(t.db, `${scheme} ${key}`)).ok).toBe(
        true,
      );
    expect(
      await authenticateApiKey(t.db, `Bearer ${key.toUpperCase()}`),
    ).toEqual({ ok: false, code: "invalid_api_key" });
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
    expect(await revokeApiKey(t.db, ORG, record.id)).toBeInstanceOf(Date);
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
    expect(await revokeApiKey(t.db, OTHER, record.id)).toBeNull();
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
    const first = await revokeApiKey(t.db, ORG, record.id);
    expect(first).toBeInstanceOf(Date);
    expect(await revokeApiKey(t.db, ORG, record.id)).toEqual(first);
    const [row] = await t.db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.id, record.id)));
    expect(row?.revokedAt).toBeInstanceOf(Date);
  });
});

describe("plafond de clés actives par organisation", () => {
  const mkOrg = async (id: string) =>
    t.db
      .insert(organizations)
      .values({ id, name: id, slug: id, createdAt: new Date() });

  it("le plafond par défaut est de 25", () => {
    expect(MAX_ACTIVE_KEYS_PER_ORGANIZATION).toBe(25);
  });

  it("refuse la création au-delà du plafond, ne compte ni les clés révoquées ni les expirées, ni celles d'une autre organisation", async () => {
    await mkOrg("org_cap_a");
    await mkOrg("org_cap_b");
    const cap = 3;
    const make = (org: string, extra: Record<string, unknown> = {}) =>
      createApiKey(t.db, {
        organizationId: org,
        name: "k",
        maxActiveKeys: cap,
        ...extra,
      });
    const first = await make("org_cap_a");
    await make("org_cap_a", { expiresAt: new Date(Date.now() - 1000) }); // expirée : ne compte pas
    await make("org_cap_a");
    await make("org_cap_a");
    await expect(make("org_cap_a")).rejects.toBeInstanceOf(ApiKeyLimitError);
    // Révoquer libère une place.
    await revokeApiKey(t.db, "org_cap_a", first.record.id);
    await expect(make("org_cap_a")).resolves.toBeDefined();
    await expect(make("org_cap_a")).rejects.toBeInstanceOf(ApiKeyLimitError);
    // Une autre organisation a son propre plafond.
    await expect(make("org_cap_b")).resolves.toBeDefined();
  });

  it("des créations simultanées ne dépassent jamais le plafond", async () => {
    await mkOrg("org_cap_race");
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        createApiKey(t.db, {
          organizationId: "org_cap_race",
          name: "k",
          maxActiveKeys: 5,
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(7);
    for (const r of rejected)
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(
        ApiKeyLimitError,
      );
  });
});
