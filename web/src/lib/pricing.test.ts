import { describe, expect, it } from "vitest";
import type { SubscriptionPlan } from "@/server/billing/plans";
import { annualSavingPercent, buildPricingJsonLd, groupOffers } from "./pricing";

const plan = (over: Partial<SubscriptionPlan> = {}): SubscriptionPlan => ({
  id: "p",
  code: "equipe",
  kind: "workstudio",
  family: "equipe",
  interval: "month",
  priceCents: 12900,
  includedCreditsCents: 4000,
  trialDays: 14,
  trialCard: "default",
  stripeProductId: "prod",
  stripePriceId: "price",
  translations: {
    "fr-CA": { name: "Équipe", description: "Pour l'équipe", features: ["15 utilisateurs"] },
    "en-CA": { name: "Team", description: "For the team", features: ["15 users"] },
  },
  ...over,
});

describe("regroupement des lignes d'offre", () => {
  it("regroupe les lignes mensuelle et annuelle d'une même offre, dans l'ordre reçu", () => {
    const offers = groupOffers(
      [
        plan({ code: "demarrage", family: "demarrage", priceCents: 3900, translations: { "fr-CA": { name: "Démarrage", description: null, features: [] } } }),
        plan(),
        plan({ code: "equipe-annuel", interval: "year", priceCents: 130800, stripePriceId: "price_y" }),
      ],
      "fr",
    );
    expect(offers.map((o) => o.family)).toEqual(["demarrage", "equipe"]);
    const equipe = offers[1]!;
    expect(equipe.name).toBe("Équipe");
    expect(equipe.options.month).toMatchObject({ code: "equipe", priceCents: 12900, perMonthCents: 12900, sellable: true });
    expect(equipe.options.year).toMatchObject({ code: "equipe-annuel", priceCents: 130800, perMonthCents: 10900 });
    expect(equipe.trialDays).toBe(14);
    expect(equipe.includedCreditsCents).toBe(4000);
  });

  it("choisit le texte de la langue de la page, avec repli sur l'autre puis sur le code", () => {
    expect(groupOffers([plan()], "en")[0]).toMatchObject({ name: "Team", description: "For the team", features: ["15 users"] });
    const onlyFr = plan({ translations: { "fr-CA": { name: "Équipe", description: null, features: [] } } });
    expect(groupOffers([onlyFr], "en")[0]?.name).toBe("Équipe");
    expect(groupOffers([plan({ translations: {} })], "fr")[0]?.name).toBe("equipe");
  });

  it("une option sans prix Stripe n'est pas vendable (la page propose de nous écrire)", () => {
    const o = groupOffers([plan({ stripePriceId: null })], "fr")[0]!;
    expect(o.options.month?.sellable).toBe(false);
  });

  it("le prix mensuel équivalent d'une facturation annuelle est arrondi au cent", () => {
    const o = groupOffers([plan({ interval: "year", priceCents: 39600, code: "d-a", family: "d" })], "fr")[0]!;
    expect(o.options.year?.perMonthCents).toBe(3300);
    const odd = groupOffers([plan({ interval: "year", priceCents: 10000, code: "x", family: "x" })], "fr")[0]!;
    expect(odd.options.year?.perMonthCents).toBe(833);
  });
});

describe("économie de la facturation annuelle", () => {
  it("n'est annoncée que si les deux prix existent et que l'annuel est réellement moins cher", () => {
    const both = groupOffers([plan(), plan({ code: "a", interval: "year", priceCents: 130800 })], "fr")[0]!;
    expect(annualSavingPercent(both)).toBe(15);
    const monthlyOnly = groupOffers([plan()], "fr")[0]!;
    expect(annualSavingPercent(monthlyOnly)).toBeNull();
    const same = groupOffers([plan(), plan({ code: "a", interval: "year", priceCents: 12900 * 12 })], "fr")[0]!;
    expect(annualSavingPercent(same)).toBeNull();
  });
});

describe("données structurées", () => {
  const labels = { month: "Mensuel", year: "Annuel" };
  it("décrit seulement les offres publiées, au prix affiché (CAD, avant taxes), une offre par période", () => {
    const offers = groupOffers([plan(), plan({ code: "a", interval: "year", priceCents: 130800 })], "fr");
    const ld = buildPricingJsonLd({ siteUrl: "https://nexora.example", pagePath: "/tarifs", offers, labels }) as any;
    expect(ld["@type"]).toBe("ItemList");
    const product = ld.itemListElement[0].item;
    expect(product).toMatchObject({ "@type": "Product", name: "Équipe", url: "https://nexora.example/tarifs#offre-equipe" });
    expect(product.offers).toHaveLength(2);
    expect(product.offers[0]).toMatchObject({
      "@type": "Offer",
      priceCurrency: "CAD",
      price: "129.00",
      priceSpecification: { "@type": "UnitPriceSpecification", price: "129.00", priceCurrency: "CAD", unitCode: "MON", valueAddedTaxIncluded: false },
    });
    expect(product.offers[1].price).toBe("1308.00");
    expect(JSON.stringify(ld)).not.toMatch(/aggregateRating|review|availability/i);
  });
  it("aucune offre : aucune donnée structurée d'offre", () => {
    expect(buildPricingJsonLd({ siteUrl: "https://x", pagePath: "/tarifs", offers: [], labels })).toBeNull();
  });
  it("une offre sans option (prix) n'est pas décrite", () => {
    expect(buildPricingJsonLd({ siteUrl: "https://x", pagePath: "/tarifs", offers: [{ family: "f", name: "F", description: null, features: [], includedCreditsCents: 0, trialDays: 0, options: {} }], labels })).toBeNull();
  });
});
