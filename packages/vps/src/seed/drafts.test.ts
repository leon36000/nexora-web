import { eq, vpsPlans } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { updatePlan } from "../catalog.ts";
import { SUGGESTED_PLANS, seedDraftPlans } from "./seed.ts";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

describe("plans VPS préparés en brouillon (prix suggérés par l'étude)", () => {
  it("crée quatre plans en brouillon, hors développement, avec les prix suggérés et le drapeau « suggéré »", async () => {
    const out = await seedDraftPlans(t.db);
    expect(out.created).toEqual(["essentiel", "croissance", "pro", "scale"]);
    const rows = await t.db.select().from(vpsPlans);
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      expect(r).toMatchObject({
        status: "draft",
        isDevSample: false,
        priceSuggested: true,
        region: "quebec",
      });
    }
    const by = Object.fromEntries(rows.map((r) => [r.code, r]));
    expect([
      by.essentiel?.priceMonthlyCents,
      by.croissance?.priceMonthlyCents,
      by.pro?.priceMonthlyCents,
      by.scale?.priceMonthlyCents,
    ]).toEqual([1900, 3500, 5500, 9900]);
    // annuel : 16 $, 29 $, 45 $ et 89 $ par mois, facturés pour l'année
    expect([
      by.essentiel?.priceYearlyCents,
      by.croissance?.priceYearlyCents,
      by.pro?.priceYearlyCents,
      by.scale?.priceYearlyCents,
    ]).toEqual([19200, 34800, 54000, 106800]);
    expect([
      by.essentiel?.vcpu,
      by.croissance?.vcpu,
      by.pro?.vcpu,
      by.scale?.vcpu,
    ]).toEqual([2, 4, 6, 8]);
  });

  it("est idempotent et ne touche jamais un plan existant (ni un plan de développement)", async () => {
    await t.db
      .update(vpsPlans)
      .set({ priceMonthlyCents: 2100, priceSuggested: false })
      .where(eq(vpsPlans.code, "essentiel"));
    const again = await seedDraftPlans(t.db);
    expect(again.created).toEqual([]);
    const [row] = await t.db
      .select()
      .from(vpsPlans)
      .where(eq(vpsPlans.code, "essentiel"));
    expect(row).toMatchObject({
      priceMonthlyCents: 2100,
      priceSuggested: false,
    });
    expect(SUGGESTED_PLANS.every((p) => !p.code.startsWith("dev-"))).toBe(true);
  });

  it("aucun n'est approuvable tant que le prix n'est pas confirmé", async () => {
    const [p] = await t.db
      .select()
      .from(vpsPlans)
      .where(eq(vpsPlans.code, "croissance"));
    await expect(
      updatePlan(t.db, p!.id, { status: "approved" }),
    ).rejects.toMatchObject({
      details: [expect.objectContaining({ issue: "price_suggested" })],
    });
  });

  it("ne promet rien avant la livraison : aucun texte n'affirme un centre de données ni une disponibilité", async () => {
    for (const p of SUGGESTED_PLANS) {
      expect(`${p.descriptionFr} ${p.descriptionEn}`).not.toMatch(
        /Beauharnois|garanti|disponible dès/i,
      );
    }
  });
});
