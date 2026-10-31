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
    preview: false,
  },
  {
    id: "c/gros",
    name: "Gros modèle",
    inputTokens: 2_000_000,
    outputTokens: 700_000,
    preview: false,
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

describe("page Tarifs : modèles en aperçu dans l'équivalent des crédits", () => {
  const previewRows: CreditEquivalent[] = rows.map((r) => ({
    ...r,
    preview: true,
  }));
  for (const lang of ["fr", "en"] as const) {
    const t = getPricingDictionary(lang);
    it(`${lang} : des lignes en aperçu affichent la note sous le tableau et marquent les lignes concernées`, () => {
      const html = render(lang, { equivalents: previewRows });
      expect(html).toContain(t.credit.equivalents.preview.note);
      expect(html).toContain("<caption");
      expect(html).toContain(t.credit.equivalents.preview.tag);
      expect(html).not.toContain(t.credit.equivalents.unavailable);
    });
    it(`${lang} : seules les lignes en aperçu sont marquées`, () => {
      const html = render(lang, {
        equivalents: [
          { ...rows[0], preview: true } as CreditEquivalent,
          rows[1] as CreditEquivalent,
        ],
      });
      const tag = t.credit.equivalents.preview.tag;
      // une fois dans le tableau, une fois dans la liste mobile : une seule ligne marquée
      expect(html.split(tag).length - 1).toBe(2);
    });
    it(`${lang} : aucune ligne en aperçu, ni note ni marque`, () => {
      const html = render(lang);
      expect(html).not.toContain(t.credit.equivalents.preview.note);
      expect(html).not.toContain(t.credit.equivalents.preview.tag);
    });
    it(`${lang} : l'excuse « catalogue indisponible » ne sert que si rien n'est fourni`, () => {
      expect(render(lang, { equivalents: null })).toContain(
        t.credit.equivalents.unavailable,
      );
      expect(render(lang, { equivalents: previewRows })).not.toContain(
        t.credit.equivalents.unavailable,
      );
    });
  }
});

describe("page Tarifs : « Me prévenir à l'ouverture »", () => {
  const cases = [
    ["fr", "/contact?sujet=ouverture-plateforme"],
    ["en", "/en/contact?sujet=ouverture-plateforme"],
  ] as const;
  for (const [lang, href] of cases) {
    const t = getPricingDictionary(lang);
    it(`${lang} : l'état « prix à venir » propose le bouton vers ${href}, avec la phrase voisine`, () => {
      const html = render(lang, { data: { status: "empty", plans: [] } });
      expect(html).toContain(`href="${href}"`);
      expect(html).toContain(t.notify.cta);
      expect(html).toContain(t.notify.text);
      // le bouton « Nous écrire » existant reste
      expect(html).toContain(
        `href="${href.replace("ouverture-plateforme", "demonstration")}"`,
      );
    });
    it(`${lang} : le bouton figure aussi près du haut de la page, avant les explications du crédit`, () => {
      const html = render(lang, { data: { status: "empty", plans: [] } });
      expect(html.indexOf(t.notify.cta)).toBeGreaterThan(-1);
      expect(html.indexOf(t.notify.cta)).toBeLessThan(
        html.indexOf(t.credit.title),
      );
      expect(html.indexOf(`href="${href}"`)).toBeLessThan(
        html.indexOf(t.states.empty.title),
      );
    });
    it(`${lang} : quand les paliers sont publiés, la page ne dit pas que la plateforme n'est pas ouverte`, () => {
      const html = render(lang);
      expect(html).not.toContain(t.notify.text);
    });
  }
});

describe("page Tarifs : cartes « D'autres façons de commencer »", () => {
  for (const lang of ["fr", "en"] as const) {
    const t = getPricingDictionary(lang);
    const prefix = lang === "fr" ? "" : "/en";
    it(`${lang} : la carte VPS ne promet plus de prix affiché sur sa page`, () => {
      expect(t.more.vps.text).not.toMatch(/prix affiché|price shown/i);
      expect(t.more.vps.text).toMatch(lang === "fr" ? /publiés/ : /published/);
      expect(render(lang)).toContain(t.more.vps.text);
    });
    it(`${lang} : la carte Accompagnement mène au diagnostic`, () => {
      const html = render(lang);
      expect(html).toContain(t.more.support.title);
      expect(html).toContain(`href="${prefix}/contact?sujet=diagnostic"`);
      expect(html).toContain(t.more.support.cta);
    });
  }
});
