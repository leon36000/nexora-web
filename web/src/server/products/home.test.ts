import { credit, subscriptions } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  loadOrgEntitlements,
  recordStorageUsageIn,
} from "../billing/entitlements";
import { newOrganization } from "../gateway/test-support";
import { loadToolsHome } from "./home";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

const NOW = new Date("2026-10-30T12:00:00Z");
const GO = 1_000_000_000;
let n = 0;
const base = {
  env: { NEXORA_PRODUCT_CODE: "1", NEXORA_PRODUCT_RAG: "1" },
  workstudioOrigin: "https://ws.example",
  house: false,
  blocked: false,
  now: NOW,
};

async function grant(
  org: string,
  source: "subscription" | "purchase",
  credits: number,
  expiresAt: Date | null,
) {
  n += 1;
  await credit(t.db, {
    organizationId: org,
    amountMicro: BigInt(credits) * 10_000n,
    idempotencyKey: `home-${n}`,
    configVersion: "cfg_test",
    source,
    expiresAt,
  });
}

describe("Mes outils : composition sur de vraies données", () => {
  it("organisation vide : aucun crédit, aucune offre, aucun espace, et chaque produit qui en a besoin le réclame", async () => {
    const org = await newOrganization(t.db);
    const home = await loadToolsHome(t.db, org, { ...base, subscriptions: [] });
    expect(home.summary?.credits.level).toBe("empty");
    expect(home.summary?.plan).toEqual({ kind: "none" });
    expect(home.summary?.storage.level).toBe("none");
    expect(home.hints.workstudio?.needsCredits).toBe(true);
    expect(home.hints.code?.needsStorage).toBe(true);
    expect(home.hints.vps?.needsCredits).toBe(false);
    expect(home.workstudioUrl).toBe("https://ws.example");
  });

  it("offre, crédits des deux sortes, espace presque plein : tout vient du contrat OrgEntitlements", async () => {
    const org = await newOrganization(t.db);
    n += 1;
    const periodEnd = new Date("2026-11-30T05:00:00Z");
    await t.db.insert(subscriptions).values({
      organizationId: org,
      stripeSubscriptionId: `sub_home_${n}`,
      stripeCustomerId: `cus_home_${n}`,
      planCode: "nexora-base",
      status: "active",
      billingInterval: "month",
      storageQuotaBytes: BigInt(GO),
      currentPeriodEnd: periodEnd,
    });
    await grant(org, "subscription", 1000, periodEnd);
    await grant(org, "purchase", 500, null);
    expect(
      await recordStorageUsageIn(t.db, org, "rag", 600_000_000, NOW),
    ).toEqual({ ok: true });
    expect(
      await recordStorageUsageIn(t.db, org, "code", 250_000_000, NOW),
    ).toEqual({ ok: true });
    const ent = await loadOrgEntitlements(t.db, org, NOW);
    const home = await loadToolsHome(t.db, org, {
      ...base,
      subscriptions: [
        {
          planCode: "nexora-base",
          access: "full",
          cancelAtPeriodEnd: false,
          currentPeriodEnd: periodEnd,
          graceEndsAt: null,
        },
      ],
    });
    expect(home.summary?.credits).toMatchObject({
      level: "ok",
      subscription: ent.credits.subscription,
      refill: 500,
      total: ent.credits.total,
    });
    expect(home.summary?.credits.subscriptionExpiresAt?.toISOString()).toBe(
      periodEnd.toISOString(),
    );
    expect(home.summary?.storage).toMatchObject({
      level: "warning",
      percent: 85,
      totalBytes: GO,
    });
    expect(home.summary?.storage.products.map((p) => p.product)).toEqual([
      "rag",
      "code",
    ]);
    expect(home.summary?.plan).toMatchObject({
      kind: "active",
      code: "nexora-base",
      interval: "month",
    });
    expect(home.hints.rag?.needsCredits).toBe(false);
  });

  it("la lecture des droits échoue : pas de faux chiffres, mais les produits restent affichés", async () => {
    const org = await newOrganization(t.db);
    const home = await loadToolsHome(
      t.db,
      org,
      { ...base, subscriptions: [] },
      {
        loadEntitlements: async () => {
          throw new Error("base muette");
        },
      },
    );
    expect(home.summary).toBeNull();
    expect(home.hints).toEqual({});
    expect(home.products.length).toBeGreaterThan(0);
  });

  it("organisation « maison » : accès gratuit, espace sans limite, rien ne lui manque", async () => {
    const org = await newOrganization(t.db);
    const home = await loadToolsHome(t.db, org, {
      ...base,
      house: true,
      subscriptions: [],
    });
    expect(home.summary?.credits.level).toBe("free");
    expect(home.summary?.storage.level).toBe("house");
    for (const h of Object.values(home.hints)) {
      expect(h?.needsCredits).toBe(false);
      expect(h?.needsStorage).toBe(false);
    }
  });

  it("l'interrupteur éteint garde Nexora Code et RAG « Bientôt » dans la composition", async () => {
    const org = await newOrganization(t.db);
    const home = await loadToolsHome(t.db, org, {
      ...base,
      env: {},
      subscriptions: [],
    });
    expect(home.products.find((p) => p.id === "code")?.state).toBe("bientot");
    expect(home.products.find((p) => p.id === "rag")?.state).toBe("bientot");
  });
});
