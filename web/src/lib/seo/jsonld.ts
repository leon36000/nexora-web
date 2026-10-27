import type {
  Article,
  BreadcrumbList,
  Offer,
  Organization,
  Product,
  Service,
  SoftwareApplication,
  WebSite,
  WithContext,
} from "schema-dts";
import { HTML_LANG, type Lang } from "@/i18n/config";

/**
 * Données structurées générées PAR CODE (jamais par un modèle, jamais écrites à la main) à partir de ce que la page
 * affiche. Chaque constructeur refuse (renvoie `null`) plutôt que d'émettre une donnée absente de la page : un nom ou
 * une description vide, un prix inconnu. Voir aussi `buildFaqJsonLd` (lib/jsonld.ts) pour FAQPage.
 */
const CONTEXT = "https://schema.org" as const;

const clean = (s: string | null | undefined) =>
  (s ?? "").replace(/\s+/g, " ").trim();

export function organizationJsonLd(input: {
  name: string;
  url: string;
}): WithContext<Organization> {
  return {
    "@context": CONTEXT,
    "@type": "Organization",
    "@id": `${input.url}/#organization`,
    name: input.name,
    url: input.url,
  };
}

/** Pas de `SearchAction` : le site n'a pas de recherche. */
export function websiteJsonLd(input: {
  name: string;
  url: string;
  lang: Lang;
}): WithContext<WebSite> {
  return {
    "@context": CONTEXT,
    "@type": "WebSite",
    "@id": `${input.url}/#website`,
    name: input.name,
    url: input.url,
    inLanguage: HTML_LANG[input.lang],
    publisher: { "@id": `${input.url}/#organization` },
  };
}

export type Crumb = { name: string; url: string };

export function breadcrumbJsonLd(
  crumbs: readonly Crumb[],
): WithContext<BreadcrumbList> | null {
  const items = crumbs.filter((c) => clean(c.name) && c.url);
  if (items.length < 2) return null;
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: clean(c.name),
      item: c.url,
    })),
  };
}

export function serviceJsonLd(input: {
  name: string;
  description: string | null;
  url: string;
  providerName: string;
  organizationUrl: string;
}): WithContext<Service> | null {
  const name = clean(input.name);
  if (!name) return null;
  const description = clean(input.description);
  return {
    "@context": CONTEXT,
    "@type": "Service",
    name,
    ...(description ? { description } : {}),
    url: input.url,
    provider: {
      "@type": "Organization",
      name: input.providerName,
      url: input.organizationUrl,
    },
  };
}

export type PriceOffer = {
  /** Nom de l'offre : EXACTEMENT le libellé affiché à côté du prix, ou null. */
  name: string | null;
  /** Décimal exact tel qu'affiché (« 0.42 »). */
  price: string;
  currency: "CAD";
  /** Unité affichée (« par million de jetons »), ou null. */
  unitText: string | null;
};

function offersOf(offers: readonly PriceOffer[]): Offer[] {
  return offers
    .filter((o) => /^\d+(\.\d+)?$/.test(o.price) && Number(o.price) > 0)
    .map((o) => ({
      "@type": "Offer",
      ...(o.name ? { name: o.name } : {}),
      price: o.price,
      priceCurrency: o.currency,
      ...(o.unitText
        ? {
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              price: o.price,
              priceCurrency: o.currency,
              unitText: o.unitText,
            },
          }
        : {}),
    }));
}

/**
 * Product (modèles du catalogue, VPS). Les offres ne sont émises que pour des prix affichés ; sans prix, pas
 * d'`offers`. Un prix nul ou illisible est écarté (jamais « 0 $ »).
 */
export function productJsonLd(input: {
  name: string;
  description: string | null;
  url: string;
  sku: string | null;
  /** Marque seulement si la page l'affiche ; null sinon. */
  brand: string | null;
  offers: readonly PriceOffer[];
}): WithContext<Product> | null {
  const name = clean(input.name);
  if (!name) return null;
  const description = clean(input.description);
  const offers = offersOf(input.offers);
  return {
    "@context": CONTEXT,
    "@type": "Product",
    name,
    ...(description ? { description } : {}),
    ...(input.sku ? { sku: input.sku } : {}),
    url: input.url,
    ...(input.brand ? { brand: { "@type": "Brand", name: input.brand } } : {}),
    ...(offers.length > 0 ? { offers } : {}),
  };
}

/** SoftwareApplication. `offers` seulement si un prix est affiché (jamais pour « sur demande »). */
export function softwareApplicationJsonLd(input: {
  name: string;
  description: string | null;
  url: string;
  category: "BusinessApplication" | "DeveloperApplication";
  offers: readonly PriceOffer[];
}): WithContext<SoftwareApplication> | null {
  const name = clean(input.name);
  if (!name) return null;
  const description = clean(input.description);
  const offers = offersOf(input.offers);
  return {
    "@context": CONTEXT,
    "@type": "SoftwareApplication",
    name,
    ...(description ? { description } : {}),
    url: input.url,
    applicationCategory: input.category,
    ...(offers.length > 0 ? { offers } : {}),
  };
}

/** Article. Les dates viennent de Directus (création et dernière modification réelles) ; absentes = omises. */
export function articleJsonLd(input: {
  headline: string;
  description: string | null;
  url: string;
  lang: Lang;
  publisherName: string;
  datePublished: string | null;
  dateModified: string | null;
  image: string | null;
}): WithContext<Article> | null {
  const headline = clean(input.headline);
  if (!headline) return null;
  const description = clean(input.description);
  return {
    "@context": CONTEXT,
    "@type": "Article",
    headline,
    ...(description ? { description } : {}),
    mainEntityOfPage: input.url,
    inLanguage: HTML_LANG[input.lang],
    ...(input.datePublished ? { datePublished: input.datePublished } : {}),
    ...(input.dateModified ? { dateModified: input.dateModified } : {}),
    ...(input.image ? { image: input.image } : {}),
    author: { "@type": "Organization", name: input.publisherName },
    publisher: { "@type": "Organization", name: input.publisherName },
  };
}
