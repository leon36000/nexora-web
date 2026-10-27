import type { RichNode } from "@/lib/rich-text";
import type { LangCode } from "./lang";

/** Modèle de page prêt à rendre : une seule langue, textes nettoyés, liens filtrés. Sérialisable (cache Next). */

export type Cta = { label: string; href: string };

/** Ton d'une section : sombre (encre forêt), clair (papier) ou sable (surface claire relevée). */
export type Tone = "sombre" | "clair" | "sable";
export const TONES = ["sombre", "clair", "sable"] as const;
/** Ancre facultative d'un bloc (`^[a-z0-9-]{0,40}$`), commune à tous les blocs. */
export type Anchored = { anchorId: string | null };
export type CardLayout = "grille" | "liste" | "etapes" | "modules";
export type CardStatus = "disponible" | "pilote" | "prevu";
export type SectionVisual =
  | "aucun"
  | "perimetre-sur-place"
  | "perimetre-heberge"
  | "flux-donnees";

export type MediaRef = {
  id: string;
  width: number | null;
  height: number | null;
  /** Texte alternatif ; vide = image décorative. */
  alt: string;
};

export type HeroBlock = Anchored & {
  type: "hero";
  key: string;
  variant: Tone;
  perimeterGrid: boolean;
  media: MediaRef | null;
  eyebrow: string | null;
  headline: string;
  subheadline: string | null;
  primary: Cta | null;
  secondary: Cta | null;
};

export type SectionBlock = Anchored & {
  type: "section";
  key: string;
  tone: Tone;
  visual: SectionVisual;
  title: string | null;
  body: RichNode[] | null;
  media: MediaRef | null;
  mediaPosition: "none" | "left" | "right" | "top";
  items: { title: string | null; text: string | null }[];
};

export type CardsBlock = Anchored & {
  type: "cards";
  key: string;
  tone: Tone;
  layout: CardLayout;
  columns: 2 | 3 | 4;
  title: string | null;
  intro: string | null;
  cards: {
    title: string | null;
    text: string | null;
    href: string | null;
    linkLabel: string | null;
    /** Libellé court (disposition « liste » : colonne de gauche). */
    label: string | null;
    /** Statut (disposition « modules »). */
    status: CardStatus | null;
  }[];
};

export type PricingBlock = Anchored & {
  type: "pricing";
  key: string;
  tone: Tone;
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

export type FaqBlock = Anchored & {
  type: "faq";
  key: string;
  tone: Tone;
  emitJsonLd: boolean;
  title: string | null;
  items: { question: string; answer: string }[];
};

export type CtaBlock = Anchored & {
  type: "cta";
  key: string;
  tone: Tone;
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
  style: "link" | "button" | "utility";
  parent: string | null;
  label: string;
  /** Vide pour un parent qui n'ouvre qu'un menu ou une colonne. */
  href: string;
  description: string | null;
  children: NavItem[];
};

/** Slugs d'une même page dans chaque langue (table de correspondance des pages publiées). */
export type SlugPair = { "fr-CA"?: string; "en-CA"?: string };
