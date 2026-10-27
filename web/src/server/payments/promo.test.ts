import { eq, paymentAudit, promoCodes, promoRedemptions } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPromo,
  createPromoBatch,
  disablePromo,
  generateCodes,
  listPromos,
  normalizeCode,
  PromoError,
  promoInputSchema,
  setPromoStatus,
} from "./promo";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

const base = {
  kind: "percent",
  percentOff: 25,
  scopes: ["subscriptions"],
} as const;

describe("normalisation d'un code saisi", () => {
  it("met en majuscules, retire les espaces et accepte lettres, chiffres et tirets", () => {
    expect(normalizeCode("  bienvenue-25 ")).toBe("BIENVENUE-25");
    expect(normalizeCode("a b c")).toBe("ABC");
  });
  it("refuse un code vide, trop court, trop long ou avec des caractères que Stripe n'accepte pas", () => {
    expect(normalizeCode("")).toBeNull();
    expect(normalizeCode("ab")).toBeNull();
    expect(normalizeCode("A".repeat(41))).toBeNull();
    expect(normalizeCode("code_bas")).toBeNull();
    expect(normalizeCode("café25")).toBeNull();
  });
});

describe("règles de définition d'un code", () => {
  const ok = (v: unknown) => promoInputSchema.safeParse(v).success;
  it("exige la valeur propre à chaque type", () => {
    expect(ok({ code: "ABC", ...base })).toBe(true);
    expect(ok({ code: "ABC", kind: "percent", scopes: ["vps"] })).toBe(false);
    expect(ok({ code: "ABC", kind: "amount", amountOffCents: 500, scopes: ["vps"] })).toBe(true);
    expect(ok({ code: "ABC", kind: "amount", scopes: ["vps"] })).toBe(false);
    expect(ok({ code: "ABC", kind: "trial", trialDays: 14, scopes: ["subscriptions"] })).toBe(true);
    expect(ok({ code: "ABC", kind: "trial", scopes: ["subscriptions"] })).toBe(false);
    expect(ok({ code: "ABC", kind: "free", scopes: ["vps"] })).toBe(true);
    expect(ok({ code: "ABC", kind: "staff", scopes: ["subscriptions", "vps", "credits"] })).toBe(true);
  });
  it("refuse une valeur étrangère au type (pas de pourcentage sur un code de montant)", () => {
    expect(ok({ code: "ABC", kind: "amount", amountOffCents: 500, percentOff: 10, scopes: ["vps"] })).toBe(false);
  });
  it("un essai ne vise que les abonnements", () => {
    expect(ok({ code: "ABC", kind: "trial", trialDays: 7, scopes: ["vps"] })).toBe(false);
    expect(ok({ code: "ABC", kind: "trial", trialDays: 7, scopes: ["subscriptions", "credits"] })).toBe(false);
  });
  it("un code qui couvrirait 100 % d'un achat de crédits est refusé (il ne donnerait aucun crédit)", () => {
    expect(ok({ code: "ABC", kind: "free", scopes: ["credits"] })).toBe(false);
    expect(ok({ code: "ABC", kind: "percent", percentOff: 100, scopes: ["credits", "vps"] })).toBe(false);
    expect(ok({ code: "ABC", kind: "percent", percentOff: 99, scopes: ["credits"] })).toBe(true);
    // le code du personnel offre sans passer par Stripe : il peut viser les crédits
    expect(ok({ code: "ABC", kind: "staff", scopes: ["credits"] })).toBe(true);
  });
  it("la durée « répétée » exige un nombre de mois, les limites des valeurs positives", () => {
    expect(ok({ code: "ABC", ...base, duration: "repeating" })).toBe(false);
    expect(ok({ code: "ABC", ...base, duration: "repeating", durationMonths: 3 })).toBe(true);
    expect(ok({ code: "ABC", ...base, maxRedemptions: 0 })).toBe(false);
    expect(ok({ code: "ABC", ...base, minAmountCents: -5 })).toBe(false);
    expect(ok({ code: "ABC", ...base, expiresAt: "pas une date" })).toBe(false);
    expect(ok({ code: "ABC", ...base, expiresAt: "2027-01-31T23:59:59Z" })).toBe(true);
  });
  it("refuse un champ inconnu (aucun identifiant Stripe saisi à la main)", () => {
    expect(ok({ code: "ABC", ...base, stripeCouponId: "co_1" })).toBe(false);
  });
});

describe("génération en lot", () => {
  it("produit des codes uniques, préfixés, de la longueur demandée, sans caractères ambigus", () => {
    const codes = generateCodes({ prefix: "ete", count: 500, length: 8 });
    expect(new Set(codes).size).toBe(500);
    for (const c of codes) expect(c).toMatch(/^ETE-[A-HJ-NP-Z2-9]{8}$/);
  });
  it("sans préfixe : seulement la partie aléatoire", () => {
    for (const c of generateCodes({ count: 5, length: 10 }))
      expect(c).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
  });
  it("refuse un lot déraisonnable ou un préfixe invalide", () => {
    expect(() => generateCodes({ count: 0, length: 8 })).toThrow();
    expect(() => generateCodes({ count: 5001, length: 8 })).toThrow();
    expect(() => generateCodes({ count: 5, length: 3 })).toThrow();
    expect(() => generateCodes({ count: 5, length: 8, prefix: "a_b" })).toThrow();
    expect(() => generateCodes({ count: 5, length: 8, prefix: "A".repeat(13) })).toThrow();
  });
});

describe("création, lot, désactivation", () => {
  it("crée un code normalisé, journalise, refuse un doublon", async () => {
    const row = await createPromo(t.db, { code: "bienvenue-25", ...base }, "admin");
    expect(row).toMatchObject({ code: "BIENVENUE-25", status: "active", stripeCouponId: null });
    await expect(createPromo(t.db, { code: "Bienvenue-25", ...base }, "admin")).rejects.toMatchObject({
      code: "duplicate",
    });
    const log = await t.db.select().from(paymentAudit);
    expect(log.some((l) => l.action === "promo.create" && l.subject === "BIENVENUE-25")).toBe(true);
  });

  it("refuse une définition invalide par une PromoError claire", async () => {
    await expect(
      createPromo(t.db, { code: "xx", ...base } as never, "admin"),
    ).rejects.toBeInstanceOf(PromoError);
  });

  it("génère un lot : même définition, un code différent par ligne, même identifiant de lot", async () => {
    const out = await createPromoBatch(
      t.db,
      { prefix: "lancement", count: 12, length: 6, definition: { ...base, maxRedemptions: 1, label: "Lancement" } },
      "admin",
    );
    expect(out.codes).toHaveLength(12);
    const rows = await t.db.select().from(promoCodes).where(eq(promoCodes.batchId, out.batchId));
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => r.maxRedemptions === 1 && r.label === "Lancement")).toBe(true);
    expect(new Set(rows.map((r) => r.code)).size).toBe(12);
  });

  it("désactive un code (réversible) et le journalise", async () => {
    const row = await createPromo(t.db, { code: "A-DESACTIVER", ...base }, "admin");
    const off = await disablePromo(t.db, row.id, "admin");
    expect(off.status).toBe("disabled");
    const on = await setPromoStatus(t.db, row.id, "active", "admin");
    expect(on.status).toBe("active");
    await expect(disablePromo(t.db, "00000000-0000-4000-8000-000000000000", "admin")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("liste avec les statistiques d'utilisation", async () => {
    const row = await createPromo(t.db, { code: "STATS-1", ...base }, "admin");
    const { organizations } = await import("@nexora/db");
    await t.db.insert(organizations).values({ id: "o-stats", name: "O", slug: "o-stats" });
    await t.db.insert(promoRedemptions).values([
      { promoCodeId: row.id, organizationId: "o-stats", scope: "subscriptions", source: "stripe", stripeSessionId: "cs_1", discountCents: 1200 },
      { promoCodeId: row.id, organizationId: "o-stats", scope: "subscriptions", source: "stripe", stripeSessionId: "cs_2", discountCents: 800 },
    ]);
    const list = await listPromos(t.db, {});
    const mine = list.items.find((i) => i.id === row.id);
    expect(mine).toMatchObject({ redemptions: 2, discountCents: 2000 });
    const filtered = await listPromos(t.db, { q: "stats" });
    expect(filtered.items.map((i) => i.code)).toEqual(["STATS-1"]);
  });
});
