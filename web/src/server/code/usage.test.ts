import { eq, storageUsage } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordStorageUsageIn, setExtraStorage } from "../billing/entitlements";
import { newOrganization } from "../gateway/test-support";
import { handleCodeUsage, type UsageDeps } from "./usage";

let t: TestDatabase;
const TOKEN = "t".repeat(40);
const MB = 1_000_000;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

const deps: UsageDeps = {
  db: () => t.db,
  adminToken: TOKEN,
  record: (org, delta) => recordStorageUsageIn(t.db, org, "code", delta),
  log: createLogger({ name: "test", sink: () => {} }),
};
const post = (body: unknown, token: string | null = TOKEN) =>
  new Request("http://localhost/api/admin/code/usage", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const used = async (org: string, product = "code") =>
  Number(
    (
      await t.db
        .select()
        .from(storageUsage)
        .where(eq(storageUsage.organizationId, org))
    ).find((r) => r.product === product)?.usedBytes ?? 0n,
  );

describe("POST /api/admin/code/usage (appelé par le worker)", () => {
  it("compte l'espace mesuré dans le quota, sans dépassement", async () => {
    const org = await newOrganization(t.db);
    await setExtraStorage(t.db, org, 100 * MB);
    const res = await handleCodeUsage(
      post({ organizationId: org, deltaBytes: 40 * MB }),
      deps,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, overQuota: false });
    expect(await used(org)).toBe(40 * MB);
  });

  it("au-delà du quota, l'espace déjà occupé est compté quand même et le dépassement est signalé", async () => {
    const org = await newOrganization(t.db);
    await setExtraStorage(t.db, org, 50 * MB);
    const res = await handleCodeUsage(
      post({ organizationId: org, deltaBytes: 80 * MB }),
      deps,
    );
    expect(await res.json()).toEqual({ ok: true, overQuota: true });
    expect(await used(org)).toBe(80 * MB);
  });

  it("libère l'espace (delta négatif) sans jamais descendre sous zéro", async () => {
    const org = await newOrganization(t.db);
    await setExtraStorage(t.db, org, 100 * MB);
    await handleCodeUsage(
      post({ organizationId: org, deltaBytes: 30 * MB }),
      deps,
    );
    await handleCodeUsage(
      post({ organizationId: org, deltaBytes: -10 * MB }),
      deps,
    );
    expect(await used(org)).toBe(20 * MB);
    await handleCodeUsage(
      post({ organizationId: org, deltaBytes: -999 * MB }),
      deps,
    );
    expect(await used(org)).toBe(0);
  });

  it("ne touche pas l'espace des autres produits", async () => {
    const org = await newOrganization(t.db);
    await setExtraStorage(t.db, org, 100 * MB);
    await recordStorageUsageIn(t.db, org, "rag", 10 * MB);
    await handleCodeUsage(
      post({ organizationId: org, deltaBytes: 5 * MB }),
      deps,
    );
    expect(await used(org, "rag")).toBe(10 * MB);
  });

  it("exige le jeton d'administration (401), refuse un corps invalide (422) et une organisation inconnue (422)", async () => {
    const org = await newOrganization(t.db);
    expect(
      (
        await handleCodeUsage(
          post({ organizationId: org, deltaBytes: 1 }, null),
          deps,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await handleCodeUsage(
          post({ organizationId: org, deltaBytes: 1 }, "x".repeat(40)),
          deps,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await handleCodeUsage(
          post({ organizationId: org, deltaBytes: 1.5 }),
          deps,
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await handleCodeUsage(
          post({ organizationId: org, deltaBytes: 1, extra: true }),
          deps,
        )
      ).status,
    ).toBe(422);
    expect((await handleCodeUsage(post("{pas du json"), deps)).status).toBe(
      422,
    );
    expect(
      (
        await handleCodeUsage(
          post({ organizationId: "org_inconnue", deltaBytes: 1 }),
          deps,
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await handleCodeUsage(post({ organizationId: org, deltaBytes: 1 }), {
          ...deps,
          adminToken: undefined,
        })
      ).status,
    ).toBe(503);
  });
});
