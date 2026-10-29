import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getPricingDictionary } from "@/i18n/pricing";
import type { SubscriptionPlan } from "@/server/billing/plans";
import { PricingPage } from "./pricing-page";

const plan = (over: Partial<SubscriptionPlan> = {}): SubscriptionPlan => ({
  id: "p1",
  code: "workstudio-demarrage",
  kind: "workstudio",
  family: "workstudio-demarrage",
  interval: "month",
  priceCents: 4900,
  includedCreditsCents: 440,
  stripeProductId: "prod_x",
  stripePriceId: "price_x",
  trialDays: 0,
  trialCard: "default",
  translations: {
    "fr-CA": { name: "Démarrage", description: null, features: [] },
    "en-CA": { name: "Starter", description: null, features: [] },
  },
  ...over,
});

describe("page Tarifs : aucun essai gratuit promis", () => {
  for (const lang of ["fr", "en"] as const) {
    const t = getPricingDictionary(lang);
    it(`${lang} : ni la méta, ni l'introduction ne parlent d'essai`, () => {
      expect(`${t.meta.description} ${t.hero.lead}`).not.toMatch(
        /essai|try|trial/i,
      );
    });
    it(`${lang} : une offre sans essai n'affiche ni essai ni note d'essai, mais annonce les 5 millions de jetons`, () => {
      const html = renderToStaticMarkup(
        <PricingPage
          lang={lang}
          t={t}
          data={{ status: "ready", plans: [plan()] }}
        />,
      );
      expect(html).not.toMatch(/essai gratuit|free trial/i);
      expect(html).toMatch(/5 (millions|million)/);
    });
  }
});
