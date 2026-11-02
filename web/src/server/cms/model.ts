import type { RichNode } from "@/lib/rich-text";
import type { LangCode } from "./lang";

/** Modèle de page prêt à rendre : une seule langue, textes nettoyés, liens filtrés. Sérialisable (cache Next). */

export type Cta = { label: string; href: string };

/** Ton d'une section : sombre (noir profond), clair (papier) ou sable (surface claire relevée). */
export type Tone = "sombre" | "clair" | "sable";
/** Ancre facultative d'un bloc (`^[a-z0-9-]{0,40}$`), commune à tous les blocs. */
type Anchored = { anchorId: string | null };
export type CardLayout =
  | "grille"
  | "liste"
  | "etapes"
  | "modules"
  | "bento"
  | "vitrine";
/** Matière « Signal » dessinée en code : décor d'un héros, ou emplacement d'image tant que le fichier manque. */
export const MATERIALS = [
  "champ",
  "onde",
  "detection",
  "infra",
  "grille",
] as const;
export type Material = (typeof MATERIALS)[number];
/** Signature d'un héros : la matière de fond (ou aucune). */
export type HeroSignature = Material | "aucun";
export type CardStatus =
  | "disponible"
  | "acces-anticipe"
  | "qualifie-localement"
  | "en-developpement"
  | "pilote"
  | "prevu";
/** Illustrations d'un bloc section : schémas de périmètre, maquettes d'interface produit, schémas de principe. */
export const SECTION_VISUALS = [
  "aucun",
  "perimetre-sur-place",
  "perimetre-heberge",
  "flux-donnees",
  "flux-workstudio",
  "catalogue-modeles",
  "console-vps",
  "tableau-de-bord",
  "vision-sur-place",
  "croissance-canaux",
  "engagements-donnees",
  "signal-accueil",
  "signal-surveillance",
  "signal-infrastructure",
] as const;
export type SectionVisual = (typeof SECTION_VISUALS)[number];

/** Image (raster) ou vidéo (MP4, WebM), d'après le type du fichier Directus. */
type MediaKind = "image" | "video";

export type MediaRef = {
  id: string;
  width: number | null;
  height: number | null;
  /** Texte alternatif ; vide = image décorative. */
  alt: string;
  kind: MediaKind;
  /** Type MIME du fichier (sans paramètres), si Directus le connaît. */
  mime: string | null;
  /** Durée d'une vidéo en millisecondes, si Directus l'a extraite. */
  durationMs: number | null;
};

/** Sous-titres d'une vidéo (fichier WebVTT) dans la langue de la traduction. */
export type Captions = { id: string; lang: LangCode };

export type HeroBlock = Anchored & {
  type: "hero";
  key: string;
  variant: Tone;
  /** « standard » : titre sur la matière de fond ; « plein-ecran » : vidéo en boucle silencieuse (ou matière) plein écran. */
  layout: "standard" | "plein-ecran";
  /** Matière de fond (champ de lumière, onde, détection, grille) ; « aucun » = fond uni. */
  signature: HeroSignature;
  perimeterGrid: boolean;
  /** Image (ou affiche de la vidéo). */
  media: MediaRef | null;
  /** Boucle vidéo silencieuse du héros plein écran. */
  video: MediaRef | null;
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
  /** Sous-titres de la vidéo `media` ; null si le média n'est pas une vidéo ou n'a pas de sous-titres. */
  captions: Captions | null;
  /** Affiche (image) d'une vidéo : la façade la montre avant le clic. */
  poster: MediaRef | null;
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
    /** Image de la carte (disposition « vitrine ») : identifiant d'un fichier Directus. */
    image: string | null;
    /** Matière dessinée tant que l'image manque (disposition « vitrine »). */
    visual: Material | null;
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
