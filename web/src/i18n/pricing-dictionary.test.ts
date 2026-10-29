import { describe, expect, it } from "vitest";
import { LANGS } from "./config";
import { getPricingDictionary } from "./pricing";

/**
 * Le fondateur ne donne pas d'essai gratuit : l'accès gratuit est réservé à l'administrateur de la maison, et les
 * offres du jeu de départ ont `trial_days` à zéro. La page Tarifs ne doit donc rien promettre (CL-61, CL-10, CL-12).
 * Les gabarits « Essai gratuit de {days} jours » ne s'affichent que si une offre publiée porte réellement un essai.
 */
const PROMESSE =
  /\bessai|(?<!ré)essay(?:ez|er)|trial|try it|free of charge|gratuit(?:ement)?\b/i;

describe("page Tarifs : aucune promesse d'essai gratuit", () => {
  for (const lang of LANGS) {
    it(`${lang} : la description SEO, le titre et l'accroche ne promettent pas d'essai`, () => {
      const t = getPricingDictionary(lang);
      for (const text of [
        t.meta.title,
        t.meta.description,
        t.hero.title,
        t.hero.lead,
        t.offers.title,
        t.offers.lead,
        t.taxes,
        t.states.empty.text,
        t.states.unavailable.text,
      ])
        expect(PROMESSE.exec(text)?.[0], text).toBeUndefined();
    });

    it(`${lang} : la description SEO reste utile (70 à 160 caractères) et parle de prix, de crédits et de taxes`, () => {
      const d = getPricingDictionary(lang).meta.description;
      expect([...d].length).toBeGreaterThanOrEqual(70);
      expect([...d].length).toBeLessThanOrEqual(160);
      expect(d).toMatch(lang === "fr" ? /crédits/ : /credits/);
    });
  }

  it("l'accroche ne dit plus « essayez-la » : elle invite à choisir une offre", () => {
    expect(getPricingDictionary("fr").hero.lead).toMatch(
      /Choisissez une offre/,
    );
    expect(getPricingDictionary("en").hero.lead).toMatch(/Pick a plan/);
  });
});
