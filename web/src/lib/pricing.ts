import type { Lang } from "@/i18n/config";
import type { SubscriptionPlan } from "@/server/billing/plans";

/**
 * Page Tarifs : regroupement des offres d'abonnement PUBLIÉES et données structurées. Rien n'est inventé : tout
 * vient des lignes `subscription_plans` publiées dans Directus (prix en cents CAD avant taxes).
 */
export type Period = "month" | "year";

export interface PriceOption {
  /** Code de la ligne d'offre (`?offre=<code>` à l'inscription, `plan` du Checkout). */
  code: string;
  interval: Period;
  /** Prix facturé par période, avant taxes. */
  priceCents: number;
  /** Équivalent mensuel (annuel : le total divisé par 12, arrondi au cent). */
  perMonthCents: number;
  /** Faux tant que le prix n'est pas poussé vers Stripe : l'offre ne se souscrit pas encore. */
  sellable: boolean;
}

export interface PricingOffer {
  family: string;
  name: string;
  description: string | null;
  features: string[];
  includedCreditsCents: number;
  trialDays: number;
  options: Partial<Record<Period, PriceOption>>;
}

const LOCALE: Record<Lang, string> = { fr: "fr-CA", en: "en-CA" };
const OTHER: Record<Lang, string> = { fr: "en-CA", en: "fr-CA" };

export function groupOffers(
  plans: readonly SubscriptionPlan[],
  lang: Lang,
): PricingOffer[] {
  const byFamily = new Map<string, PricingOffer>();
  for (const plan of plans) {
    const tr = plan.translations[LOCALE[lang]] ?? plan.translations[OTHER[lang]];
    const option: PriceOption = {
      code: plan.code,
      interval: plan.interval,
      priceCents: plan.priceCents,
      perMonthCents:
        plan.interval === "year" ? Math.round(plan.priceCents / 12) : plan.priceCents,
      sellable: Boolean(plan.stripePriceId),
    };
    const existing = byFamily.get(plan.family);
    if (!existing) {
      byFamily.set(plan.family, {
        family: plan.family,
        name: tr?.name || plan.code,
        description: tr?.description ?? null,
        features: tr?.features ?? [],
        includedCreditsCents: plan.includedCreditsCents,
        trialDays: plan.trialDays,
        options: { [plan.interval]: option },
      });
    } else {
      existing.options[plan.interval] ??= option;
      existing.includedCreditsCents = Math.max(existing.includedCreditsCents, plan.includedCreditsCents);
      existing.trialDays = Math.max(existing.trialDays, plan.trialDays);
    }
  }
  return [...byFamily.values()];
}

/** Économie annoncée de la facturation annuelle, en % entier ; `null` si elle n'existe pas réellement. */
export function annualSavingPercent(offer: PricingOffer): number | null {
  const { month, year } = offer.options;
  if (!month || !year) return null;
  const yearly = year.priceCents;
  const twelve = month.priceCents * 12;
  if (yearly >= twelve) return null;
  // Arrondi à l'inférieur : on ne surestime jamais l'économie annoncée.
  const pct = Math.floor((1 - yearly / twelve) * 100);
  return pct > 0 ? pct : null;
}

const decimal = (cents: number) => (cents / 100).toFixed(2);
const UNIT: Record<Period, string> = { month: "MON", year: "ANN" };

/**
 * Données structurées de la page : une liste de produits, un `Offer` par période tarifée, au prix affiché
 * (CAD, avant taxes). Ni note, ni avis, ni disponibilité inventés. `null` s'il n'y a rien à décrire.
 */
export function buildPricingJsonLd(input: {
  siteUrl: string;
  /** Chemin localisé de la page (`/tarifs` ou `/en/pricing`). */
  pagePath: string;
  offers: readonly PricingOffer[];
  labels: Record<Period, string>;
}): Record<string, unknown> | null {
  const products = input.offers
    .filter((o) => o.options.month || o.options.year)
    .map((offer) => {
      const url = `${input.siteUrl}${input.pagePath}#offre-${offer.family}`;
      const offers = (["month", "year"] as const).flatMap((period) => {
        const option = offer.options[period];
        if (!option) return [];
        return [
          {
            "@type": "Offer",
            name: `${offer.name} — ${input.labels[period]}`,
            url,
            priceCurrency: "CAD",
            price: decimal(option.priceCents),
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              price: decimal(option.priceCents),
              priceCurrency: "CAD",
              unitCode: UNIT[period],
              valueAddedTaxIncluded: false,
            },
          },
        ];
      });
      return {
        "@type": "Product",
        name: offer.name,
        ...(offer.description ? { description: offer.description } : {}),
        url,
        offers,
      };
    });
  if (products.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: products.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item,
    })),
  };
}
