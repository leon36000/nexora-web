import { describe, expect, test } from "bun:test";
import { DRAFT_PLANS, INCLUDED_CREDITS_CENTS } from "./plans-seed";

describe("offres WorkStudio préparées en brouillon (prix suggérés par l'étude)", () => {
  test("trois offres, chacune avec une ligne mensuelle et une ligne annuelle", () => {
    expect(DRAFT_PLANS).toHaveLength(6);
    const families = [...new Set(DRAFT_PLANS.map((p) => p.family))];
    expect(families).toEqual([
      "workstudio-demarrage",
      "workstudio-equipe",
      "workstudio-affaires",
    ]);
    for (const f of families)
      expect(
        DRAFT_PLANS.filter((p) => p.family === f)
          .map((p) => p.interval)
          .sort(),
      ).toEqual(["month", "year"]);
  });

  test("toutes en brouillon, sans prix publié : seul le prix suggéré est renseigné", () => {
    for (const p of DRAFT_PLANS) {
      expect(p.status).toBe("draft");
      expect("price_cents" in p).toBe(false);
      expect(p.suggested_price_cents).toBeGreaterThan(0);
    }
  });

  test("prix suggérés de l'étude : 39/33, 129/109, 349/299 $ par mois (annuel = 12 mois)", () => {
    const price = (code: string) =>
      DRAFT_PLANS.find((p) => p.code === code)?.suggested_price_cents;
    expect(price("workstudio-demarrage")).toBe(3900);
    expect(price("workstudio-demarrage-annuel")).toBe(33 * 12 * 100);
    expect(price("workstudio-equipe")).toBe(12900);
    expect(price("workstudio-equipe-annuel")).toBe(109 * 12 * 100);
    expect(price("workstudio-affaires")).toBe(34900);
    expect(price("workstudio-affaires-annuel")).toBe(299 * 12 * 100);
  });

  test("aucun essai gratuit : l'accès gratuit est réservé à l'administrateur de la maison", () => {
    for (const p of DRAFT_PLANS) expect(p.trial_days).toBe(0);
  });

  test("crédits inclus = 5 millions de jetons du modèle par défaut (annuel : douze mois d'avance)", () => {
    // Recalcul indépendant : DeepSeek V4.1 Flash 1017, tarif de pointe amont 0,30 / 1,20 $ US par million,
    // taux de référence 1,4025, marge de 10 %, 70 % d'entrée et 30 % de sortie.
    const ceil = (a: bigint, b: bigint) => (a + b - 1n) / b;
    const sale = (usd: bigint) =>
      ceil(ceil(usd * 1_402_500n, 1_000_000n) * 11_000n, 10_000n);
    const micro = ceil(
      5_000_000n * (sale(300_000n) * 7_000n + sale(1_200_000n) * 3_000n),
      10_000_000_000n,
    );
    const cents = Number(ceil(micro, 10_000n));
    expect(cents).toBe(440);
    expect(INCLUDED_CREDITS_CENTS).toBe(cents);
    for (const p of DRAFT_PLANS)
      expect(p.included_credits_cents).toBe(
        p.interval === "month" ? cents : cents * 12,
      );
  });

  test("codes uniques, textes en français et en anglais, aucune promesse d'état de service", () => {
    expect(new Set(DRAFT_PLANS.map((p) => p.code)).size).toBe(6);
    for (const p of DRAFT_PLANS) {
      const langs = p.translations.map((t) => t.languages_code).sort();
      expect(langs).toEqual(["en-CA", "fr-CA"]);
      for (const t of p.translations) {
        expect(t.name.length).toBeGreaterThan(2);
        expect(JSON.stringify(t)).not.toMatch(
          /garanti|certifi|100 ?%|conforme à la loi 25/i,
        );
      }
    }
  });
});
