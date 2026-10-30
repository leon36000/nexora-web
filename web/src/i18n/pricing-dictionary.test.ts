import { readFileSync } from "node:fs";
import { join } from "node:path";
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

  it("l'accroche explique le modèle (crédits et espace) sans inviter à acheter un prix qui n'existe pas encore", () => {
    expect(getPricingDictionary("fr").hero.lead).toMatch(/crédits/);
    expect(getPricingDictionary("fr").hero.lead).toMatch(/espace disque/);
    expect(getPricingDictionary("en").hero.lead).toMatch(/credits/);
    expect(getPricingDictionary("en").hero.lead).toMatch(/storage/);
  });
});

/** Registre des affirmations du dépôt : la page y renvoie par identifiants, comme les fiches Apps. */
const registry = JSON.parse(
  readFileSync(
    join(__dirname, "..", "..", "..", "cms", "content", "claims.json"),
    "utf8",
  ),
) as { claims: { id: string; approval_status: string }[] };

function claimsOf(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) for (const v of value) claimsOf(v, out);
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value))
      if (k === "claims" && Array.isArray(v)) out.push(...(v as string[]));
      else claimsOf(v, out);
  return out;
}

describe("page Tarifs : chaque affirmation passe par le registre", () => {
  const known = new Map(registry.claims.map((c) => [c.id, c.approval_status]));

  it("tous les identifiants cités existent au registre, et aucun n'est marqué « approuvée » par le code", () => {
    for (const lang of LANGS)
      for (const id of claimsOf(getPricingDictionary(lang))) {
        expect(known.has(id), `${lang} ${id}`).toBe(true);
        expect(known.get(id)).not.toBe("approuvée");
      }
  });

  it("les deux langues citent les mêmes affirmations, aux mêmes endroits", () => {
    expect(claimsOf(getPricingDictionary("en"))).toEqual(
      claimsOf(getPricingDictionary("fr")),
    );
  });

  it("chaque section qui énonce un fait (crédit, recharge, espace, usage, FAQ, état « prix à venir ») cite au moins une affirmation", () => {
    const t = getPricingDictionary("fr");
    for (const section of [
      t.hero,
      t.credit,
      t.refill,
      t.storage,
      t.usage,
      t.states.empty,
      ...Object.values(t.faq.items),
    ])
      expect(claimsOf(section).length).toBeGreaterThan(0);
  });
});

describe("page Tarifs : aucun prix écrit en dur dans les textes", () => {
  it("aucun montant en dollars dans les dictionnaires (les prix viennent de Directus)", () => {
    for (const lang of LANGS) {
      const text = JSON.stringify(getPricingDictionary(lang));
      expect(text).not.toMatch(/\d\s?\$|\$\s?\d/);
    }
  });
});
