import { describe, expect, test } from "bun:test";
import { DRAFT_PLANS } from "./plans-seed";

describe("offres WorkStudio préparées en brouillon (prix suggérés par l'étude)", () => {
  test("trois offres, chacune avec une ligne mensuelle et une ligne annuelle", () => {
    expect(DRAFT_PLANS).toHaveLength(6);
    const families = [...new Set(DRAFT_PLANS.map((p) => p.family))];
    expect(families).toEqual(["workstudio-demarrage", "workstudio-equipe", "workstudio-affaires"]);
    for (const f of families)
      expect(DRAFT_PLANS.filter((p) => p.family === f).map((p) => p.interval).sort()).toEqual(["month", "year"]);
  });

  test("toutes en brouillon, sans prix publié : seul le prix suggéré est renseigné", () => {
    for (const p of DRAFT_PLANS) {
      expect(p.status).toBe("draft");
      expect("price_cents" in p).toBe(false);
      expect(p.suggested_price_cents).toBeGreaterThan(0);
    }
  });

  test("prix suggérés de l'étude : 39/33, 129/109, 349/299 $ par mois (annuel = 12 mois)", () => {
    const price = (code: string) => DRAFT_PLANS.find((p) => p.code === code)?.suggested_price_cents;
    expect(price("workstudio-demarrage")).toBe(3900);
    expect(price("workstudio-demarrage-annuel")).toBe(33 * 12 * 100);
    expect(price("workstudio-equipe")).toBe(12900);
    expect(price("workstudio-equipe-annuel")).toBe(109 * 12 * 100);
    expect(price("workstudio-affaires")).toBe(34900);
    expect(price("workstudio-affaires-annuel")).toBe(299 * 12 * 100);
  });

  test("essai de 14 jours, carte exigée selon le réglage général, crédits inclus de l'étude (annuel : douze mois d'avance)", () => {
    for (const p of DRAFT_PLANS) {
      expect(p.trial_days).toBe(14);
      expect(p.trial_card).toBe("default");
    }
    const credits = (code: string) => DRAFT_PLANS.find((p) => p.code === code)?.included_credits_cents;
    expect(credits("workstudio-demarrage")).toBe(1000);
    expect(credits("workstudio-equipe")).toBe(4000);
    expect(credits("workstudio-affaires")).toBe(15000);
    expect(credits("workstudio-equipe-annuel")).toBe(4000 * 12);
  });

  test("codes uniques, textes en français et en anglais, aucune promesse d'état de service", () => {
    expect(new Set(DRAFT_PLANS.map((p) => p.code)).size).toBe(6);
    for (const p of DRAFT_PLANS) {
      const langs = p.translations.map((t) => t.languages_code).sort();
      expect(langs).toEqual(["en-CA", "fr-CA"]);
      for (const t of p.translations) {
        expect(t.name.length).toBeGreaterThan(2);
        expect(JSON.stringify(t)).not.toMatch(/garanti|certifi|100 ?%|conforme à la loi 25/i);
      }
    }
  });
});
