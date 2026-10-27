import type { PublicVpsApp, PublicVpsPlan } from "@nexora/vps";
import {
  decimalCents,
  externalUrl,
  isSellablePlan,
  type Term,
  termPriceCents,
} from "@/components/vps/logic";

/**
 * Données structurées des pages VPS, générées PAR CODE à partir des mêmes données que le visible.
 * - BreadcrumbList : toujours ;
 * - Product/Offer : uniquement pour un plan publié qui n'est PAS un plan de développement et dont le
 *   prix existe ; une offre par durée tarifée, au prix affiché (CAD, avant taxes) ;
 * - SoftwareApplication : uniquement pour une application installable.
 * Aucun prix, avis, note ni disponibilité n'est inventé.
 */

const CONTEXT = "https://schema.org";

export function buildBreadcrumbJsonLd(
  siteUrl: string,
  items: readonly { name: string; path: string }[],
): Record<string, unknown> {
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${siteUrl}${item.path}`,
    })),
  };
}

export interface PlanJsonLdLabels {
  /** Libellés des durées, tels qu'affichés (« Mensuel », « Annuel »). */
  term: Record<Term, string>;
  /** Libellés et valeurs des caractéristiques, tels qu'affichés dans le tableau. */
  specs: (plan: PublicVpsPlan) => { name: string; value: string }[];
  /** Description affichée du plan (langue de la page). */
  description: (plan: PublicVpsPlan) => string;
}

const UNIT_CODE: Record<Term, string> = { month: "MON", year: "ANN" };

/**
 * Un Product par plan vendable (jamais un plan de développement, jamais sans prix). `null` quand aucun
 * plan n'est éligible : la page n'émet alors aucun Product.
 */
export function buildPlanProductsJsonLd(input: {
  siteUrl: string;
  /** Chemin localisé de la page (`/vps` ou `/en/vps`). */
  pagePath: string;
  plans: readonly PublicVpsPlan[];
  labels: PlanJsonLdLabels;
}): Record<string, unknown> | null {
  const products = input.plans.filter(isSellablePlan).map((plan) => {
    const url = `${input.siteUrl}${input.pagePath}#plan-${plan.code}`;
    const description = input.labels.description(plan).trim();
    const offers = (["month", "year"] as const).flatMap((term) => {
      const cents = termPriceCents(plan, term);
      if (cents === null) return [];
      const price = decimalCents(cents);
      return [
        {
          "@type": "Offer",
          name: input.labels.term[term],
          url,
          price,
          priceCurrency: "CAD",
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price,
            priceCurrency: "CAD",
            valueAddedTaxIncluded: false,
            unitCode: UNIT_CODE[term],
          },
        },
      ];
    });
    return {
      "@type": "Product",
      name: plan.name,
      ...(description ? { description } : {}),
      url,
      brand: { "@type": "Brand", name: "Nexora AI" },
      additionalProperty: input.labels.specs(plan).map((s) => ({
        "@type": "PropertyValue",
        name: s.name,
        value: s.value,
      })),
      offers,
    };
  });
  if (products.length === 0) return null;
  return { "@context": CONTEXT, "@graph": products };
}

/** SoftwareApplication d'une application installable ; `null` pour un guide. */
export function buildSoftwareApplicationJsonLd(input: {
  siteUrl: string;
  /** Chemin localisé de la fiche. */
  pagePath: string;
  app: PublicVpsApp;
  /** Accroche affichée sur la fiche (langue de la page). */
  description: string;
}): Record<string, unknown> | null {
  const { app } = input;
  if (app.kind !== "installable") return null;
  const license = externalUrl(app.licenseUrl);
  return {
    "@context": CONTEXT,
    "@type": "SoftwareApplication",
    name: app.name,
    description: input.description,
    softwareVersion: app.version,
    url: `${input.siteUrl}${input.pagePath}`,
    ...(license ? { license } : {}),
  };
}
