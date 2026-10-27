import type { RichNode } from "@/lib/rich-text";
import type { LangCode } from "./lang";

/** Modèle de page prêt à rendre : une seule langue, textes nettoyés, liens filtrés. Sérialisable (cache Next). */

export type Cta = { label: string; href: string };

export type MediaRef = {
  id: string;
  width: number | null;
  height: number | null;
  /** Texte alternatif ; vide = image décorative. */
  alt: string;
};

export type HeroBlock = {
  type: "hero";
  key: string;
  variant: "sombre" | "clair";
  perimeterGrid: boolean;
  media: MediaRef | null;
  eyebrow: string | null;
  headline: string;
  subheadline: string | null;
  primary: Cta | null;
  secondary: Cta | null;
};

export type SectionBlock = {
  type: "section";
  key: string;
  title: string | null;
  body: RichNode[] | null;
  media: MediaRef | null;
  mediaPosition: "none" | "left" | "right" | "top";
  items: { title: string | null; text: string | null }[];
};

export type CardsBlock = {
  type: "cards";
  key: string;
  columns: 2 | 3 | 4;
  title: string | null;
  intro: string | null;
  cards: {
    title: string | null;
    text: string | null;
    href: string | null;
    linkLabel: string | null;
  }[];
};

export type PricingBlock = {
  type: "pricing";
  key: string;
  title: string | null;
  intro: string | null;
  plans: {
    name: string;
    priceLabel: string | null;
    billingNote: string | null;
    description: string | null;
    features: string[];
    cta: Cta | null;
  }[];
  note: string | null;
};

export type FaqBlock = {
  type: "faq";
  key: string;
  emitJsonLd: boolean;
  title: string | null;
  items: { question: string; answer: string }[];
};

export type CtaBlock = {
  type: "cta";
  key: string;
  tone: "sombre" | "clair" | "accent";
  title: string;
  text: string | null;
  primary: Cta | null;
  secondary: Cta | null;
};

export type Block =
  | HeroBlock
  | SectionBlock
  | CardsBlock
  | PricingBlock
  | FaqBlock
  | CtaBlock;

export type PageModel = {
  id: string;
  lang: LangCode;
  /** `""` pour l'accueil. */
  slug: string;
  title: string;
  seoTitle: string | null;
  seoDescription: string | null;
  canonical: string | null;
  noindex: boolean;
  seoImageId: string | null;
  blocks: Block[];
  /** Langues dans lesquelles la page existe, avec leur slug (pour hreflang). */
  translations: { code: LangCode; slug: string }[];
};

export type PreviewInfo = {
  /** Clé de la version affichée ; null si la page n'a aucune version en cours (on montre l'élément principal). */
  versionKey: string | null;
  versionName: string | null;
  updatedAt: string | null;
  /** État de la page dans la table principale. */
  pageStatus: string;
};

export type SiteSettings = {
  siteName: string;
  tagline: string | null;
  seoTitleTemplate: string | null;
  seoDescription: string | null;
  footerNote: string | null;
  ogDefaultImageId: string | null;
};

export type NavItem = {
  id: string;
  placement: "header" | "footer" | "legal";
  style: "link" | "button";
  parent: string | null;
  label: string;
  href: string;
  children: NavItem[];
};
