import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  giftGrants,
  organizations,
  paymentAudit,
  paymentSettings,
  promoCodes,
  promoRedemptions,
  staffAccounts,
  subscriptions,
  users,
} from "./schema.ts";
import { accessLevel } from "./subscription-access.ts";
import { createTestDatabase, type TestDatabase } from "./testing.ts";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

const promo = (over: Partial<typeof promoCodes.$inferInsert> = {}) => ({
  code: `TEST${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
  kind: "percent" as const,
  percentOff: 20,
  scopes: ["subscriptions"],
  ...over,
});

describe("accès d'un abonnement offert", () => {
  it("un abonnement « offert » donne l'accès complet", () => {
    expect(
      accessLevel({ status: "gifted", graceEndsAt: null }, new Date()),
    ).toBe("full");
  });
});

describe("codes promo (contraintes)", () => {
  it("accepte un code valide et applique les valeurs par défaut", async () => {
    const [row] = await t.db.insert(promoCodes).values(promo()).returning();
    expect(row).toMatchObject({
      status: "active",
      duration: "once",
      firstOrderOnly: false,
      onePerCustomer: false,
      maxRedemptions: null,
    });
  });

  it("refuse deux codes identiques", async () => {
    const code = promo();
    await t.db.insert(promoCodes).values(code);
    await expect(t.db.insert(promoCodes).values(code)).rejects.toThrow();
  });

  it("refuse un pourcentage hors de 1 à 100", async () => {
    await expect(
      t.db.insert(promoCodes).values(promo({ percentOff: 0 })),
    ).rejects.toThrow();
    await expect(
      t.db.insert(promoCodes).values(promo({ percentOff: 101 })),
    ).rejects.toThrow();
  });

  it("refuse un type « montant » sans montant et un type « essai » sans durée", async () => {
    await expect(
      t.db
        .insert(promoCodes)
        .values(promo({ kind: "amount", percentOff: null })),
    ).rejects.toThrow();
    await expect(
      t.db
        .insert(promoCodes)
        .values(promo({ kind: "trial", percentOff: null })),
    ).rejects.toThrow();
  });

  it("refuse une portée vide ou inconnue", async () => {
    await expect(
      t.db.insert(promoCodes).values(promo({ scopes: [] })),
    ).rejects.toThrow();
    await expect(
      t.db.insert(promoCodes).values(promo({ scopes: ["autre"] })),
    ).rejects.toThrow();
  });

  it("refuse une durée « répétée » sans nombre de mois", async () => {
    await expect(
      t.db
        .insert(promoCodes)
        .values(promo({ duration: "repeating", durationMonths: null })),
    ).rejects.toThrow();
  });
});

describe("journal des paiements (ajout seulement)", () => {
  it("refuse la modification et la suppression d'une écriture", async () => {
    const [row] = await t.db
      .insert(paymentAudit)
      .values({ actor: "admin", action: "test", subject: "x" })
      .returning();
    await expect(
      t.db.execute(
        sql`UPDATE payment_audit SET action = 'autre' WHERE id = ${row?.id}`,
      ),
    ).rejects.toThrow();
    await expect(
      t.db.execute(sql`DELETE FROM payment_audit WHERE id = ${row?.id}`),
    ).rejects.toThrow();
  });
});

describe("réglages, personnel et dons", () => {
  it("les réglages ont des valeurs par défaut sûres (production interdite, plafond 100 $)", async () => {
    await t.db.insert(paymentSettings).values({ id: "default" });
    const [row] = await t.db.select().from(paymentSettings);
    expect(row).toMatchObject({
      liveModeAllowed: false,
      trialRequiresCard: true,
      staffMonthlyCreditCapCents: 10_000,
      webhookStatus: "missing",
    });
  });

  it("un compte personnel et un don sont rattachés à un compte réel", async () => {
    await t.db.insert(users).values({
      id: "u1",
      name: "Équipe",
      email: "equipe@example.com",
    });
    await t.db
      .insert(organizations)
      .values({ id: "o1", name: "Org", slug: "org" });
    await t.db
      .insert(staffAccounts)
      .values({ userId: "u1", grantedBy: "admin" });
    const [grant] = await t.db
      .insert(giftGrants)
      .values({
        organizationId: "o1",
        userId: "u1",
        kind: "subscription",
        planCode: "workstudio-pro",
        idempotencyKey: "gift:1",
      })
      .returning();
    expect(grant?.status).toBe("active");
    await expect(
      t.db.insert(giftGrants).values({
        organizationId: "o1",
        userId: "u1",
        kind: "subscription",
        idempotencyKey: "gift:1",
      }),
    ).rejects.toThrow();
    await expect(
      t.db.insert(giftGrants).values({
        organizationId: "o1",
        userId: "u1",
        kind: "inconnu" as "credits",
        idempotencyKey: "gift:2",
      }),
    ).rejects.toThrow();
  });

  it("un abonnement au statut « offert » est accepté et une utilisation de code est unique par session", async () => {
    await t.db.insert(subscriptions).values({
      organizationId: "o1",
      stripeSubscriptionId: "gift_1",
      stripeCustomerId: "gift",
      status: "gifted",
    });
    const [code] = await t.db
      .insert(promoCodes)
      .values(promo({ kind: "staff", percentOff: null }))
      .returning();
    const redemption = {
      promoCodeId: code?.id as string,
      organizationId: "o1",
      scope: "subscriptions" as const,
      source: "stripe" as const,
      stripeSessionId: "cs_1",
    };
    await t.db.insert(promoRedemptions).values(redemption);
    await expect(
      t.db.insert(promoRedemptions).values(redemption),
    ).rejects.toThrow();
  });
});
