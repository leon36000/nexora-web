import { describe, expect, test } from "bun:test";
import {
  DRAFT_CREDIT_PACKS,
  DRAFT_PLANS,
  RETIRED_PLAN_CODES,
} from "./plans-seed";

const plan = (code: string) => DRAFT_PLANS.find((p) => p.code === code);

describe("offres Nexora préparées en brouillon (conception du 30/10/2026)", () => {
  test("une seule famille « nexora » : trois paliers (mensuel + annuel) et le Go supplémentaire", () => {
    expect(DRAFT_PLANS.map((p) => p.code)).toEqual([
      "nexora-base",
      "nexora-base-annuel",
      "nexora-pro",
      "nexora-pro-annuel",
      "nexora-equipe",
      "nexora-equipe-annuel",
      "nexora-go-supplementaire",
    ]);
    for (const p of DRAFT_PLANS)
      expect(p.code.startsWith("nexora-")).toBe(true);
    expect(DRAFT_PLANS.some((p) => p.code.startsWith("workstudio-"))).toBe(
      false,
    );
  });

  test("les anciennes offres workstudio-* sont déclarées retirées (le chargement les archive si elles sont encore en brouillon)", () => {
    expect(RETIRED_PLAN_CODES).toEqual(
      expect.arrayContaining([
        "workstudio-demarrage",
        "workstudio-demarrage-annuel",
        "workstudio-equipe",
        "workstudio-equipe-annuel",
        "workstudio-affaires",
        "workstudio-affaires-annuel",
      ]),
    );
    for (const code of RETIRED_PLAN_CODES)
      expect(DRAFT_PLANS.some((p) => p.code === code)).toBe(false);
  });

  test("tout est en brouillon, sans prix publié : seul le prix suggéré est renseigné", () => {
    for (const p of DRAFT_PLANS) {
      expect(p.status).toBe("draft");
      expect("price_cents" in p).toBe(false);
      expect(p.suggested_price_cents).toBeGreaterThan(0);
    }
  });

  test("paliers du fondateur : 29,99 $ / 1 Go / 1 000 crédits ; Pro 79,99 $ / 10 Go / 4 000 ; Équipe 199,99 $ / 50 Go / 12 000", () => {
    expect(plan("nexora-base")).toMatchObject({
      interval: "month",
      suggested_price_cents: 2999,
      included_storage_gb: 1,
      included_credits_cents: 1000,
    });
    expect(plan("nexora-pro")).toMatchObject({
      suggested_price_cents: 7999,
      included_storage_gb: 10,
      included_credits_cents: 4000,
    });
    expect(plan("nexora-equipe")).toMatchObject({
      suggested_price_cents: 19999,
      included_storage_gb: 50,
      included_credits_cents: 12000,
    });
  });

  test("annuel = 12 mois à 10 % de moins ; crédits d'une année (versés un douzième par mois) ; même espace", () => {
    for (const family of ["nexora-base", "nexora-pro", "nexora-equipe"]) {
      const m = plan(family);
      const y = plan(`${family}-annuel`);
      expect(y?.interval).toBe("year");
      expect(y?.suggested_price_cents).toBe(
        Math.round(((m?.suggested_price_cents ?? 0) * 12 * 9) / 10),
      );
      expect(y?.included_credits_cents).toBe(
        (m?.included_credits_cents ?? 0) * 12,
      );
      expect(y?.included_storage_gb).toBe(m?.included_storage_gb);
      expect(y?.family).toBe(m?.family);
    }
    expect(plan("nexora-base-annuel")?.suggested_price_cents).toBe(32389);
  });

  test("aucun essai gratuit : l'accès gratuit est réservé à l'organisation maison", () => {
    for (const p of DRAFT_PLANS) expect(p.trial_days).toBe(0);
  });

  test("le Go supplémentaire est une offre complémentaire à 1 $ par Go et par mois, sans crédit", () => {
    expect(plan("nexora-go-supplementaire")).toMatchObject({
      kind: "storage",
      interval: "month",
      suggested_price_cents: 100,
      included_storage_gb: 1,
      included_credits_cents: 0,
    });
  });

  test("codes uniques, textes en français et en anglais, aucune promesse ni état de service inventé", () => {
    expect(new Set(DRAFT_PLANS.map((p) => p.code)).size).toBe(
      DRAFT_PLANS.length,
    );
    for (const p of DRAFT_PLANS) {
      const langs = p.translations.map((t) => t.languages_code).sort();
      expect(langs).toEqual(["en-CA", "fr-CA"]);
      for (const t of p.translations) {
        expect(t.name.length).toBeGreaterThan(2);
        expect(JSON.stringify(t)).not.toMatch(
          /garanti|certifi|100 ?%|conforme à la loi 25|\d\s?\$|essai gratuit|free trial/i,
        );
      }
    }
  });
});

describe("forfaits de recharge (1 $ = 100 crédits)", () => {
  test("10, 25, 50 et 100 $ donnent 1 000, 2 500, 5 000 et 10 000 crédits", () => {
    expect(
      DRAFT_CREDIT_PACKS.map((p) => [p.suggested_price_cents, p.credits]),
    ).toEqual([
      [1000, 1000],
      [2500, 2500],
      [5000, 5000],
      [10000, 10000],
    ]);
  });

  test("en brouillon, sans prix publié, codes uniques", () => {
    for (const p of DRAFT_CREDIT_PACKS) {
      expect(p.status).toBe("draft");
      expect("price_cents" in p).toBe(false);
    }
    expect(new Set(DRAFT_CREDIT_PACKS.map((p) => p.code)).size).toBe(4);
  });
});
