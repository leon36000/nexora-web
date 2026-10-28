import { z } from "zod";

/**
 * Schéma de l'outil UNIQUE d'écriture des agents : `create_draft` (D9). Tout ce que produit un modèle passe par
 * ces schémas FERMÉS (`strictObject` : un champ inconnu est une erreur, jamais ignoré en silence) avant d'atteindre
 * Directus. Ce que le schéma ne peut pas exprimer, un agent ne peut pas l'écrire :
 *
 * - collections : `pages`, ses traductions et ses blocs (héros, section, cartes, FAQ, appel à l'action). Pas de
 *   tarifs (`block_pricing`) : aucun agent sur les prix. Pas de média, pas de `claims`, pas d'utilisateur.
 * - aucun statut ni date de publication : le code fixe `draft` pour la coquille, la version porte l'intention
 *   de publication et c'est l'approbation humaine + la garde de publication qui décident.
 * - aucun lien externe : seuls des chemins internes (`/…`) sont admis ; un relecteur ajoute un lien externe à la main.
 * - aucune suppression : le schéma n'a pas d'opération de suppression.
 */

const DRAFT_LANGS = ["fr-CA", "en-CA"] as const;

// biome-ignore lint/suspicious/noControlCharactersInRegex: on refuse précisément les caractères de contrôle
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine((s) => !CONTROL.test(s), "caractères de contrôle interdits")
    .refine((s) => !/<\s*\/?\s*[a-z!]/i.test(s), "balisage HTML interdit")
    .transform((s) => s.replace(/\s+/g, " ").trim());

const required = (max: number) => text(max).refine((s) => s.length > 0);

/** Chemin interne seulement : commence par `/`, jamais `//`, jamais de schéma, jamais de contrôle. */
const internalHref = z
  .string()
  .max(200)
  .regex(/^\/(?!\/)[A-Za-z0-9\-._~/?=&%#]*$/, "chemin interne seulement");

/** Segments en minuscules et tirets ; un segment réservé par l'application est interdit. */
const RESERVED_SLUGS = new Set([
  "api",
  "v1",
  "og",
  "en",
  "fr",
  "admin",
  "compte",
  "contact",
  "modeles",
  "docs",
  "vps",
  "llms",
  "sitemap",
  "robots",
  "_next",
]);
export const slug = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/)
  .refine(
    (s) => !RESERVED_SLUGS.has(s.split("/")[0] ?? ""),
    "slug réservé par l'application",
  );

const Tone = z.enum(["sombre", "clair", "sable"]);
const Anchor = z.string().regex(/^[a-z0-9-]{0,40}$/);
const optText = (max: number) => text(max).optional();

const HeroBlock = z.strictObject({
  collection: z.literal("block_hero"),
  fields: z
    .strictObject({
      variant: Tone.optional(),
      perimeter_grid: z.boolean().optional(),
      anchor_id: Anchor.optional(),
    })
    .optional(),
  translation: z.strictObject({
    eyebrow: optText(120),
    headline: required(160),
    subheadline: optText(400),
    primary_label: optText(60),
    primary_href: internalHref.optional(),
    secondary_label: optText(60),
    secondary_href: internalHref.optional(),
  }),
});

const SectionBlock = z.strictObject({
  collection: z.literal("block_section"),
  fields: z
    .strictObject({ tone: Tone.optional(), anchor_id: Anchor.optional() })
    .optional(),
  translation: z.strictObject({
    title: optText(160),
    /** Paragraphes en texte brut : le code les met en `<p>` après échappement. */
    body: z.array(required(1200)).max(8).optional(),
    items: z
      .array(z.strictObject({ title: optText(120), text: optText(500) }))
      .max(8)
      .optional(),
  }),
});

const CardsBlock = z.strictObject({
  collection: z.literal("block_cards"),
  fields: z
    .strictObject({
      tone: Tone.optional(),
      layout: z.enum(["grille", "liste", "etapes"]).optional(),
      columns: z.enum(["2", "3", "4"]).optional(),
      anchor_id: Anchor.optional(),
    })
    .optional(),
  translation: z.strictObject({
    title: optText(160),
    intro: optText(500),
    cards: z
      .array(
        z.strictObject({
          title: optText(120),
          text: optText(500),
          href: internalHref.optional(),
          link_label: optText(60),
          label: optText(40),
        }),
      )
      .min(1)
      .max(12),
  }),
});

const FaqBlock = z.strictObject({
  collection: z.literal("block_faq"),
  fields: z
    .strictObject({
      tone: Tone.optional(),
      emit_jsonld: z.boolean().optional(),
      anchor_id: Anchor.optional(),
    })
    .optional(),
  translation: z.strictObject({
    title: optText(160),
    items: z
      .array(
        z.strictObject({ question: required(200), answer: required(1000) }),
      )
      .min(1)
      .max(12),
  }),
});

const CtaBlock = z.strictObject({
  collection: z.literal("block_cta"),
  fields: z
    .strictObject({ tone: Tone.optional(), anchor_id: Anchor.optional() })
    .optional(),
  translation: z.strictObject({
    title: required(160),
    text: optText(400),
    primary_label: optText(60),
    primary_href: internalHref.optional(),
    secondary_label: optText(60),
    secondary_href: internalHref.optional(),
  }),
});

const BlockInput = z.discriminatedUnion("collection", [
  HeroBlock,
  SectionBlock,
  CardsBlock,
  FaqBlock,
  CtaBlock,
]);

const PageMeta = z.strictObject({
  slug,
  title: required(120),
  seo_title: required(70),
  seo_description: required(170),
});

/** Nouvelle page (Rédacteur) : fr-CA seulement ; l'en-CA vient du Traducteur après approbation du français. */
export const NewPageInput = z.strictObject({
  mode: z.literal("new_page"),
  approvalKind: z.literal("contenu"),
  summary: required(1000),
  page: PageMeta,
  blocks: z.array(BlockInput).min(2).max(16),
});

/** Traduction d'une page existante (Traducteur) : chaînes par clé stable, la structure vient du code. */
const TranslationInput = z.strictObject({
  mode: z.literal("update_translation"),
  approvalKind: z.literal("traduction"),
  summary: required(1000),
  pageId: z.uuid(),
  language: z.literal("en-CA"),
  page: PageMeta,
  /** Clé `b<index>.<champ>[.<n>.<sous-champ>]` -> texte traduit (voir translator-keys.ts). */
  strings: z.record(z.string().max(60), z.string().max(1500)),
});

/** Propositions SEO on-page (titre, description, slug) sur une page existante. */
const SeoInput = z.strictObject({
  mode: z.literal("update_seo"),
  approvalKind: z.literal("seo"),
  summary: required(1000),
  pageId: z.uuid(),
  language: z.enum(DRAFT_LANGS),
  seo_title: required(70),
  seo_description: required(170),
  /** Appliqué seulement si la page n'est pas publiée ; sinon reporté dans le résumé. */
  slug: slug.optional(),
});

export const CreateDraftInput = z.discriminatedUnion("mode", [
  NewPageInput,
  TranslationInput,
  SeoInput,
]);
export type CreateDraftInputT = z.infer<typeof CreateDraftInput>;
export type DraftMode = CreateDraftInputT["mode"];
