import {
  credit,
  creditEntries,
  expireAllDue,
  organizationStorage,
  reserve,
  settleReservation,
  storageUsage,
  subscriptions,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setBillingMode } from "../gateway/house";
import { newOrganization } from "../gateway/test-support";
import {
  getOrgEntitlements,
  loadOrgEntitlements,
  recordStorageUsage,
  recordStorageUsageIn,
  setExtraStorage,
} from "./entitlements";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

const NOW = new Date("2026-10-30T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);
/** 1 crédit = 1 ¢ CA = 10 000 micro-CAD. */
const CREDIT = 10_000n;
const GO = 1_000_000_000;
let n = 0;

async function grant(
  org: string,
  source: "subscription" | "purchase",
  credits: number,
  expiresAt: Date | null,
) {
  n += 1;
  await credit(t.db, {
    organizationId: org,
    amountMicro: BigInt(credits) * CREDIT,
    idempotencyKey: `ent-${n}`,
    configVersion: "cfg_test",
    source,
    expiresAt,
  });
}

async function spend(org: string, credits: number) {
  n += 1;
  const r = await reserve(t.db, {
    organizationId: org,
    amountMicro: BigInt(credits) * CREDIT,
    idempotencyKey: `ent-spend-${n}`,
    configVersion: "cfg_test",
  });
  if (r.status !== "reserved") throw new Error(`réservation : ${r.status}`);
  await settleReservation(t.db, {
    organizationId: org,
    reservationId: r.reservation.id,
    actualMicro: BigInt(credits) * CREDIT,
  });
}

async function subscribe(
  org: string,
  over: Partial<typeof subscriptions.$inferInsert> = {},
) {
  n += 1;
  await t.db.insert(subscriptions).values({
    organizationId: org,
    stripeSubscriptionId: `sub_ent_${n}`,
    stripeCustomerId: `cus_ent_${n}`,
    planCode: "nexora-base",
    status: "active",
    billingInterval: "month",
    storageQuotaBytes: BigInt(GO),
    ...over,
  });
}

describe("crédits : abonnement et recharge restent distincts", () => {
  it("une organisation sans rien n'a ni crédit, ni offre, ni espace, ni accès aux modèles", async () => {
    const org = await newOrganization(t.db);
    expect(await loadOrgEntitlements(t.db, org, NOW)).toEqual({
      planCode: null,
      interval: null,
      credits: { subscription: 0, refill: 0, total: 0 },
      storage: {
        quotaBytes: 0,
        extraBytes: 0,
        usedBytes: 0,
        byProduct: { workstudio: 0, code: 0, rag: 0, creative: 0, bot: 0 },
      },
      canUseModels: false,
    });
  });

  it("compte les crédits en cents CA (1 crédit = 1 ¢) : abonnement d'un côté, recharge de l'autre", async () => {
    const org = await newOrganization(t.db);
    await grant(org, "subscription", 1000, day(20));
    await grant(org, "purchase", 2500, null);
    const e = await loadOrgEntitlements(t.db, org, NOW);
    expect(e.credits).toEqual({
      subscription: 1000,
      refill: 2500,
      total: 3500,
    });
    expect(e.canUseModels).toBe(true);
  });

  it("une recharge seule suffit pour appeler les modèles, sans abonnement", async () => {
    const org = await newOrganization(t.db);
    await grant(org, "purchase", 1000, null);
    const e = await loadOrgEntitlements(t.db, org, NOW);
    expect(e.planCode).toBeNull();
    expect(e.canUseModels).toBe(true);
  });

  it("on consomme d'abord les crédits d'abonnement (ils expirent), puis ceux de recharge", async () => {
    const org = await newOrganization(t.db);
    await grant(org, "subscription", 1000, day(20));
    await grant(org, "purchase", 2000, null);
    await spend(org, 300);
    expect((await loadOrgEntitlements(t.db, org, NOW)).credits).toEqual({
      subscription: 700,
      refill: 2000,
      total: 2700,
    });
    await spend(org, 900);
    expect((await loadOrgEntitlements(t.db, org, NOW)).credits).toEqual({
      subscription: 0,
      refill: 1800,
      total: 1800,
    });
  });

  it("les crédits d'abonnement échus ne comptent plus, même si l'expiration n'est pas encore écrite", async () => {
    const org = await newOrganization(t.db);
    await grant(org, "subscription", 1000, day(-1));
    await grant(org, "purchase", 50, null);
    const e = await loadOrgEntitlements(t.db, org, NOW);
    expect(e.credits).toEqual({ subscription: 0, refill: 50, total: 50 });
    await expireAllDue(t.db, { now: NOW, configVersion: "cfg_test" });
    expect(await loadOrgEntitlements(t.db, org, NOW)).toMatchObject({
      credits: { subscription: 0, refill: 50, total: 50 },
    });
  });

  it("les crédits réservés par une requête en cours ne sont plus disponibles", async () => {
    const org = await newOrganization(t.db);
    await grant(org, "subscription", 100, day(20));
    await grant(org, "purchase", 100, null);
    n += 1;
    await reserve(t.db, {
      organizationId: org,
      amountMicro: 150n * CREDIT,
      idempotencyKey: `ent-hold-${n}`,
      configVersion: "cfg_test",
    });
    expect((await loadOrgEntitlements(t.db, org, NOW)).credits).toEqual({
      subscription: 0,
      refill: 50,
      total: 50,
    });
  });

  it("zéro crédit : plus d'accès aux modèles (message « plus de crédits » côté appelant)", async () => {
    const org = await newOrganization(t.db);
    await grant(org, "purchase", 100, null);
    await spend(org, 100);
    const e = await loadOrgEntitlements(t.db, org, NOW);
    expect(e.credits.total).toBe(0);
    expect(e.canUseModels).toBe(false);
  });

  it("moins d'un crédit (une fraction de cent) ne donne pas accès", async () => {
    const org = await newOrganization(t.db);
    n += 1;
    await credit(t.db, {
      organizationId: org,
      amountMicro: 9_999n,
      idempotencyKey: `ent-frac-${n}`,
      configVersion: "cfg_test",
      source: "purchase",
    });
    const e = await loadOrgEntitlements(t.db, org, NOW);
    expect(e.credits.total).toBe(0);
    expect(e.canUseModels).toBe(false);
  });

  it("un solde négatif (remboursement, litige) ne donne ni crédits ni accès", async () => {
    const org = await newOrganization(t.db);
    await grant(org, "purchase", 100, null);
    // Un règlement qui dépasse la réservation (dépassement) rend le solde négatif.
    n += 1;
    const r = await reserve(t.db, {
      organizationId: org,
      amountMicro: 50n * CREDIT,
      idempotencyKey: `ent-neg-${n}`,
      configVersion: "cfg_test",
    });
    if (r.status !== "reserved") throw new Error("réservation attendue");
    await settleReservation(t.db, {
      organizationId: org,
      reservationId: r.reservation.id,
      actualMicro: 130n * CREDIT,
    });
    const e = await loadOrgEntitlements(t.db, org, NOW);
    expect(e.credits).toEqual({ subscription: 0, refill: 0, total: 0 });
    expect(e.canUseModels).toBe(false);
  });

  it("l'organisation maison appelle les modèles sans crédit", async () => {
    const org = await newOrganization(t.db);
    await setBillingMode(t.db, org, "house");
    const e = await loadOrgEntitlements(t.db, org, NOW);
    expect(e.credits.total).toBe(0);
    expect(e.canUseModels).toBe(true);
  });
});

describe("offre et quota d'espace", () => {
  it("rend le code d'offre, la période et le quota de l'offre active", async () => {
    const org = await newOrganization(t.db);
    await subscribe(org, { billingInterval: "year" });
    const e = await loadOrgEntitlements(t.db, org, NOW);
    expect(e.planCode).toBe("nexora-base");
    expect(e.interval).toBe("year");
    expect(e.storage.quotaBytes).toBe(GO);
  });

  it("un abonnement en délai de grâce garde son quota ; impayé, suspendu ou résilié, non", async () => {
    const grace = await newOrganization(t.db);
    await subscribe(grace, {
      status: "past_due",
      graceEndsAt: day(3),
    });
    expect(
      (await loadOrgEntitlements(t.db, grace, NOW)).storage.quotaBytes,
    ).toBe(GO);
    for (const status of ["unpaid", "canceled", "paused"] as const) {
      const org = await newOrganization(t.db);
      await subscribe(org, { status });
      const e = await loadOrgEntitlements(t.db, org, NOW);
      expect(e.storage.quotaBytes).toBe(0);
      expect(e.planCode).toBeNull();
    }
    const late = await newOrganization(t.db);
    await subscribe(late, { status: "past_due", graceEndsAt: day(-1) });
    expect((await loadOrgEntitlements(t.db, late, NOW)).planCode).toBeNull();
  });

  it("un abonnement sans offre (VPS) n'apporte ni offre ni espace", async () => {
    const org = await newOrganization(t.db);
    await subscribe(org, { planCode: null, storageQuotaBytes: 0n });
    const e = await loadOrgEntitlements(t.db, org, NOW);
    expect(e.planCode).toBeNull();
    expect(e.storage.quotaBytes).toBe(0);
  });

  it("les Go supplémentaires s'ajoutent à l'espace de l'offre", async () => {
    const org = await newOrganization(t.db);
    await subscribe(org);
    await setExtraStorage(t.db, org, 5 * GO);
    const e = await loadOrgEntitlements(t.db, org, NOW);
    expect(e.storage.extraBytes).toBe(5 * GO);
    expect(e.storage.quotaBytes).toBe(GO);
  });

  it("setExtraStorage remplace la valeur et refuse un nombre négatif ou non entier", async () => {
    const org = await newOrganization(t.db);
    await setExtraStorage(t.db, org, 3 * GO);
    await setExtraStorage(t.db, org, GO);
    expect((await loadOrgEntitlements(t.db, org, NOW)).storage.extraBytes).toBe(
      GO,
    );
    await expect(setExtraStorage(t.db, org, -1)).rejects.toThrow(RangeError);
    await expect(setExtraStorage(t.db, org, 1.5)).rejects.toThrow(RangeError);
  });
});

describe("recordStorageUsage", () => {
  it("compte l'espace par produit et le total de l'organisation", async () => {
    const org = await newOrganization(t.db);
    await subscribe(org);
    expect(await recordStorageUsageIn(t.db, org, "rag", 300_000_000)).toEqual({
      ok: true,
    });
    expect(await recordStorageUsageIn(t.db, org, "code", 200_000_000)).toEqual({
      ok: true,
    });
    const e = await loadOrgEntitlements(t.db, org, NOW);
    expect(e.storage.usedBytes).toBe(500_000_000);
    expect(e.storage.byProduct).toEqual({
      workstudio: 0,
      code: 200_000_000,
      rag: 300_000_000,
      creative: 0,
      bot: 0,
    });
  });

  it("refuse l'écriture qui dépasse le quota (offre + Go supplémentaires), sans rien changer", async () => {
    const org = await newOrganization(t.db);
    await subscribe(org);
    expect(await recordStorageUsageIn(t.db, org, "rag", 900_000_000)).toEqual({
      ok: true,
    });
    expect(await recordStorageUsageIn(t.db, org, "rag", 100_000_001)).toEqual({
      ok: false,
      reason: "quota_exceeded",
    });
    expect((await loadOrgEntitlements(t.db, org, NOW)).storage.usedBytes).toBe(
      900_000_000,
    );
    // Pile au quota : permis. Au-delà : acheter des Go.
    expect(await recordStorageUsageIn(t.db, org, "rag", 100_000_000)).toEqual({
      ok: true,
    });
    await setExtraStorage(t.db, org, GO);
    expect(await recordStorageUsageIn(t.db, org, "code", 500_000_000)).toEqual({
      ok: true,
    });
  });

  it("sans offre ni Go supplémentaires, tout ajout d'espace est refusé", async () => {
    const org = await newOrganization(t.db);
    expect(await recordStorageUsageIn(t.db, org, "workstudio", 1)).toEqual({
      ok: false,
      reason: "quota_exceeded",
    });
  });

  it("libérer de l'espace est toujours permis, même au-delà du quota, et ne descend jamais sous zéro", async () => {
    const org = await newOrganization(t.db);
    await subscribe(org);
    await recordStorageUsageIn(t.db, org, "rag", 800_000_000);
    // L'abonnement est résilié : le quota tombe à 0, mais on peut supprimer des données.
    await t.db
      .update(subscriptions)
      .set({ status: "canceled" })
      .where(eq(subscriptions.organizationId, org));
    expect(await recordStorageUsageIn(t.db, org, "rag", -300_000_000)).toEqual({
      ok: true,
    });
    expect((await loadOrgEntitlements(t.db, org, NOW)).storage.usedBytes).toBe(
      500_000_000,
    );
    expect(await recordStorageUsageIn(t.db, org, "rag", -900_000_000)).toEqual({
      ok: true,
    });
    expect((await loadOrgEntitlements(t.db, org, NOW)).storage.usedBytes).toBe(
      0,
    );
  });

  it("des écritures simultanées ne dépassent jamais le quota", async () => {
    const org = await newOrganization(t.db);
    await subscribe(org);
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        recordStorageUsageIn(
          t.db,
          org,
          i % 2 === 0 ? "rag" : "code",
          200_000_000,
        ),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect((await loadOrgEntitlements(t.db, org, NOW)).storage.usedBytes).toBe(
      GO,
    );
  });

  it("refuse un delta qui n'est pas un entier sûr", async () => {
    const org = await newOrganization(t.db);
    await expect(recordStorageUsageIn(t.db, org, "rag", 1.5)).rejects.toThrow(
      RangeError,
    );
    await expect(
      recordStorageUsageIn(t.db, org, "rag", Number.NaN),
    ).rejects.toThrow(RangeError);
    await expect(
      recordStorageUsageIn(t.db, org, "inconnu" as never, 1),
    ).rejects.toThrow(RangeError);
  });

  it("un delta nul est accepté sans rien écrire", async () => {
    const org = await newOrganization(t.db);
    expect(await recordStorageUsageIn(t.db, org, "rag", 0)).toEqual({
      ok: true,
    });
    expect(
      await t.db
        .select()
        .from(storageUsage)
        .where(eq(storageUsage.organizationId, org)),
    ).toEqual([]);
  });

  it("l'organisation maison n'est pas limitée en espace, mais son usage est compté", async () => {
    const org = await newOrganization(t.db);
    await setBillingMode(t.db, org, "house");
    expect(await recordStorageUsageIn(t.db, org, "rag", 10 * GO)).toEqual({
      ok: true,
    });
    expect((await loadOrgEntitlements(t.db, org, NOW)).storage.usedBytes).toBe(
      10 * GO,
    );
  });

  it("la base refuse un usage négatif (contrainte)", async () => {
    const org = await newOrganization(t.db);
    await expect(
      t.db
        .insert(storageUsage)
        .values({ organizationId: org, product: "rag", usedBytes: -1n }),
    ).rejects.toThrow();
    await expect(
      t.db
        .insert(organizationStorage)
        .values({ organizationId: org, extraBytes: -1n }),
    ).rejects.toThrow();
  });
});

describe("contrat public (organisation seule en paramètre)", () => {
  it("getOrgEntitlements et recordStorageUsage lisent la base du site", async () => {
    const g = globalThis as unknown as { __nexoraDb?: unknown };
    const before = g.__nexoraDb;
    g.__nexoraDb = t;
    try {
      const org = await newOrganization(t.db);
      await subscribe(org);
      await grant(org, "purchase", 10, null);
      expect(await recordStorageUsage(org, "bot", 1_000)).toEqual({ ok: true });
      const e = await getOrgEntitlements(org);
      expect(e.credits.refill).toBe(10);
      expect(e.storage.byProduct.bot).toBe(1_000);
    } finally {
      g.__nexoraDb = before;
    }
  });
});

describe("le grand livre n'est pas touché", () => {
  it("lire les droits n'écrit aucune écriture", async () => {
    const org = await newOrganization(t.db);
    await grant(org, "purchase", 10, null);
    const before = await t.db
      .select()
      .from(creditEntries)
      .where(eq(creditEntries.organizationId, org));
    await loadOrgEntitlements(t.db, org, NOW);
    const after = await t.db
      .select()
      .from(creditEntries)
      .where(eq(creditEntries.organizationId, org));
    expect(after).toHaveLength(before.length);
  });
});
