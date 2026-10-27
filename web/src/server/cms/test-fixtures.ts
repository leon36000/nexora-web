/** Fabrique de réponses Directus pour les tests (forme réelle de `/items/pages` avec blocs M2A). */

export const FR = "fr-CA";
export const EN = "en-CA";

type Json = Record<string, unknown>;

export function heroBlock(id: number, sort: number, over: Json = {}): Json {
  return {
    id,
    collection: "block_hero",
    sort,
    item: {
      id: `hero-${id}`,
      variant: "sombre",
      perimeter_grid: true,
      media: null,
      translations: [
        {
          languages_code: FR,
          eyebrow: "Nexora",
          headline: "L'IA qui travaille pour vous.",
          subheadline: "Sous-titre fr",
          primary_label: "Planifier un diagnostic",
          primary_href: "/contact/",
          secondary_label: "Comprendre",
          secondary_href: "/souverainete/",
        },
        {
          languages_code: EN,
          eyebrow: null,
          headline: "AI that works for you.",
          subheadline: "Subtitle en",
          primary_label: "Book a diagnostic",
          primary_href: "/en/contact/",
          secondary_label: null,
          secondary_href: null,
        },
      ],
      ...over,
    },
  };
}

export function sectionBlock(id: number, sort: number, over: Json = {}): Json {
  return {
    id,
    collection: "block_section",
    sort,
    item: {
      id: `sec-${id}`,
      media_position: "none",
      media: null,
      translations: [
        {
          languages_code: FR,
          title: "Section fr",
          body: "<p>Texte <strong>riche</strong></p>",
          media_alt: null,
          items: [
            { title: "Un", text: "Deux" },
            { title: "", text: "" },
          ],
        },
      ],
      ...over,
    },
  };
}

export function faqBlock(id: number, sort: number, over: Json = {}): Json {
  return {
    id,
    collection: "block_faq",
    sort,
    item: {
      id: `faq-${id}`,
      emit_jsonld: true,
      translations: [
        {
          languages_code: FR,
          title: "Questions",
          items: [
            { question: "Où sont mes données ?", answer: "Chez vous." },
            { question: "Et les modèles ?", answer: "Au choix." },
          ],
        },
      ],
      ...over,
    },
  };
}

export function pageJson(
  id: string,
  slugs: { fr?: string | null; en?: string | null },
  blocks: Json[],
  over: Json = {},
): Json {
  const translations: Json[] = [];
  if (slugs.fr !== undefined)
    translations.push({
      languages_code: FR,
      slug: slugs.fr,
      title: `Titre ${slugs.fr ?? ""} fr`,
      seo_title: "Titre SEO fr",
      seo_description: "Description fr",
      canonical: null,
    });
  if (slugs.en !== undefined)
    translations.push({
      languages_code: EN,
      slug: slugs.en,
      title: `Title ${slugs.en ?? ""} en`,
      seo_title: null,
      seo_description: null,
      canonical: null,
    });
  return {
    id,
    status: "published",
    noindex: false,
    seo_image: null,
    translations,
    blocks,
    ...over,
  };
}

export function cardsBlock(id: number, sort: number, over: Json = {}): Json {
  return {
    id,
    collection: "block_cards",
    sort,
    item: {
      id: `cards-${id}`,
      columns: "3",
      translations: [
        {
          languages_code: FR,
          title: "Cartes",
          intro: null,
          cards: [
            { title: "M1 — Réception.", text: "Texte", status: "pilote" },
            { title: "M2 — Ventes.", text: "Texte", status: "n'importe quoi" },
            { title: "Sans statut", text: "Texte" },
          ],
        },
      ],
      ...over,
    },
  };
}

export function ctaBlock(id: number, sort: number, over: Json = {}): Json {
  return {
    id,
    collection: "block_cta",
    sort,
    item: {
      id: `cta-${id}`,
      tone: "sombre",
      translations: [
        {
          languages_code: FR,
          title: "Parlons-en.",
          text: null,
          primary_label: null,
          primary_href: null,
          secondary_label: null,
          secondary_href: null,
        },
      ],
      ...over,
    },
  };
}
