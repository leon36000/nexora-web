import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getPricingDictionary } from "@/i18n/pricing";
import type { CreditEquivalent } from "@/lib/credit-equivalence";
import type { SubscriptionPlan } from "@/server/billing/plans";
import { PricingPage } from "./pricing-page";

const plan = (over: Partial<SubscriptionPlan> = {}): SubscriptionPlan => ({
  id: "p1",
  code: "nexora-base",
  kind: "nexora",
  family: "nexora-base",
  interval: "month",
  priceCents: 2999,
  includedCreditsCents: 1000,
  includedStorageBytes: 1_000_000_000,
  stripeProductId: "prod_x",
  stripePriceId: "price_x",
  trialDays: 0,
  trialCard: "default",
  translations: {
    "fr-CA": { name: "Nexora Base", description: null, features: [] },
    "en-CA": { name: "Nexora Base", description: null, features: [] },
  },
  ...over,
});

const rows: CreditEquivalent[] = [
  {
    id: "a/petit",
    name: "Petit modèle",
    inputTokens: 50_000_000,
    outputTokens: 16_000_000,
  },
  {
    id: "c/gros",
    name: "Gros modèle",
    inputTokens: 2_000_000,
    outputTokens: 700_000,
  },
];

const render = (
  lang: "fr" | "en",
  props: Partial<Parameters<typeof PricingPage>[0]> = {},
) =>
  renderToStaticMarkup(
    <PricingPage
      lang={lang}
      t={getPricingDictionary(lang)}
      data={{ status: "ready", plans: [plan()] }}
      equivalents={rows}
      {...props}
    />,
  );

describe("page Tarifs : aucun essai gratuit promis", () => {
  for (const lang of ["fr", "en"] as const) {
    const t = getPricingDictionary(lang);
    it(`${lang} : ni la méta, ni l'introduction ne parlent d'essai`, () => {
      expect(`${t.meta.description} ${t.hero.lead}`).not.toMatch(
        /essai|try|trial/i,
      );
    });
    it(`${lang} : une offre sans essai n'affiche ni durée d'essai ni note d'essai, et plus aucune promesse de 5 millions de jetons`, () => {
      const html = render(lang);
      expect(html).not.toMatch(
        /Essai gratuit de \d|\d+-day free trial|aucun montant n’est prélevé avant la fin/i,
      );
      expect(html).not.toMatch(/5 (millions|million)/);
    });
  }
});

describe("page Tarifs : modèle à crédits, prix publiés", () => {
  it("fr : un palier publié montre ses crédits par mois et son espace, lus des offres (jamais écrits en dur)", () => {
    const html = render("fr");
    expect(html).toContain("Nexora Base");
    expect(html).toMatch(/1\s000 crédits par mois/);
    expect(html).toContain("1 Go d’espace disque");
    expect(html).not.toContain("Prix à venir");
  });

  it("en : same tier in English", () => {
    const html = render("en");
    expect(html).toMatch(/1,000 credits per month/);
    expect(html).toContain("1 GB of storage");
  });

  it("une offre annuelle dit que ses crédits sont versés un douzième par mois, et affiche les crédits par mois", () => {
    const html = render("fr", {
      data: {
        status: "ready",
        plans: [
          plan(),
          plan({
            code: "nexora-base-annuel",
            interval: "year",
            priceCents: 32389,
            includedCreditsCents: 12000,
          }),
        ],
      },
    });
    expect(html).toMatch(/1\s000 crédits par mois/);
    expect(html).toContain("crédits versés un douzième par mois");
    expect(html).not.toMatch(/12\s000 crédits par mois/);
  });

  it("le Go supplémentaire publié s'affiche avec son prix ; sinon la page dit qu'il arrive", () => {
    const addon = plan({
      code: "nexora-go-supplementaire",
      family: "nexora-go-supplementaire",
      kind: "storage",
      priceCents: 100,
      includedCreditsCents: 0,
      translations: {
        "fr-CA": { name: "Go supplémentaire", description: null, features: [] },
        "en-CA": { name: "Extra gigabyte", description: null, features: [] },
      },
    });
    const withAddon = render("fr", {
      data: { status: "ready", plans: [plan(), addon] },
    });
    expect(withAddon).toMatch(/1,00\s\$ par Go et par mois/);
    // Le Go supplémentaire n'est pas un palier : il n'a pas sa carte parmi les paliers.
    expect(withAddon).not.toContain('id="offre-nexora-go-supplementaire"');
    expect(render("fr")).toContain("s’affichera ici dès la publication");
  });

  it("les forfaits de recharge publiés s'affichent avec leurs crédits et leur prix ; sinon la page dit qu'ils arrivent", () => {
    const html = render("fr", {
      packs: {
        status: "ready",
        packs: [{ code: "recharge-25", priceCents: 2500, credits: 2500 }],
      },
    });
    expect(html).toMatch(/2\s500 crédits/);
    expect(html).toMatch(/25,00\s\$/);
    expect(render("fr")).toContain("Les forfaits de recharge s’afficheront");
  });
});

describe("page Tarifs : état « prix à venir » (rien n'est publié)", () => {
  for (const lang of ["fr", "en"] as const) {
    it(`${lang} : le dit franchement, sans aucun prix ni palier inventé, mais explique tout le reste`, () => {
      const html = render(lang, { data: { status: "empty", plans: [] } });
      const t = getPricingDictionary(lang);
      expect(html).toContain(t.states.empty.label);
      expect(html).toContain(t.states.empty.title);
      expect(html).not.toMatch(/\d\s?\$|\$\s?\d/);
      expect(html).not.toContain(t.offers.title);
      // Le reste de la page explique le modèle.
      expect(html).toContain(t.credit.title);
      expect(html).toContain(t.refill.title);
      expect(html).toContain(t.storage.title);
      expect(html).toContain(t.usage.title);
      expect(html).toContain(t.faq.title);
      // La question « quand les prix ? » n'existe que tant qu'ils manquent.
      expect(html).toContain(t.faq.items.prices.q);
    });
  }

  it("quand les prix sont publiés, la question « quand les prix ? » disparaît", () => {
    const t = getPricingDictionary("fr");
    expect(render("fr")).not.toContain(t.faq.items.prices.q);
  });

  it("service des offres illisible : message distinct, la page garde ses explications", () => {
    const t = getPricingDictionary("fr");
    const html = render("fr", { data: { status: "unavailable", plans: [] } });
    expect(html).toContain(t.states.unavailable.title);
    expect(html).toContain(t.credit.title);
  });
});

describe("page Tarifs : équivalent des crédits en jetons", () => {
  it("affiche un tableau accessible (légende, en-têtes de colonnes et de lignes) calculé à partir des lignes fournies", () => {
    const html = render("fr");
    expect(html).toContain("<caption");
    expect(html).toMatch(/<th scope="col"[^>]*>Modèle</);
    expect(html).toMatch(/<th scope="row"[^>]*>Petit modèle</);
    expect(html).toMatch(/50\s?M/);
  });

  it("catalogue indisponible : le dit, sans rien estimer", () => {
    const html = render("fr", { equivalents: null });
    const t = getPricingDictionary("fr");
    expect(html).toContain(t.credit.equivalents.unavailable);
    expect(html).not.toContain("<caption");
  });
});
