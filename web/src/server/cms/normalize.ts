import { z } from "zod";
import { parseRichText } from "@/lib/rich-text";
import { safeHref } from "@/lib/safe-href";
import { CmsContentError } from "./errors";
import type { LangCode } from "./lang";
import type {
  Block,
  CardLayout,
  CardStatus,
  Cta,
  MediaRef,
  PageModel,
  SectionVisual,
  Tone,
} from "./model";

/* -------------------------------------------------------------------------- */
/* Schémas de la réponse Directus (forme réelle, champs nuls tolérés)           */
/* -------------------------------------------------------------------------- */

const str = z.string().nullish();
const idLike = z.union([z.string(), z.number()]).nullish();

const FileRef = z
  .union([
    z.string(),
    z.object({
      id: z.string(),
      width: z.number().nullish(),
      height: z.number().nullish(),
      type: z.string().nullish(),
    }),
  ])
  .nullish();

const Tr = { id: idLike, languages_code: z.string() };

const HeroItem = z.object({
  id: idLike,
  anchor_id: str,
  variant: str,
  perimeter_grid: z.boolean().nullish(),
  media: FileRef,
  translations: z
    .array(
      z.object({
        ...Tr,
        eyebrow: str,
        headline: str,
        subheadline: str,
        primary_label: str,
        primary_href: str,
        secondary_label: str,
        secondary_href: str,
      }),
    )
    .nullish(),
});

const SectionItem = z.object({
  id: idLike,
  anchor_id: str,
  tone: str,
  visual: str,
  media_position: str,
  media: FileRef,
  translations: z
    .array(
      z.object({
        ...Tr,
        title: str,
        body: str,
        media_alt: str,
        items: z.unknown(),
      }),
    )
    .nullish(),
});

const CardsItem = z.object({
  id: idLike,
  anchor_id: str,
  tone: str,
  layout: str,
  columns: z.union([z.string(), z.number()]).nullish(),
  translations: z
    .array(z.object({ ...Tr, title: str, intro: str, cards: z.unknown() }))
    .nullish(),
});

const PricingItem = z.object({
  id: idLike,
  anchor_id: str,
  tone: str,
  translations: z
    .array(
      z.object({
        ...Tr,
        title: str,
        intro: str,
        plans: z.unknown(),
        note: str,
      }),
    )
    .nullish(),
});

const FaqItem = z.object({
  id: idLike,
  anchor_id: str,
  tone: str,
  emit_jsonld: z.boolean().nullish(),
  translations: z
    .array(z.object({ ...Tr, title: str, items: z.unknown() }))
    .nullish(),
});

const CtaItem = z.object({
  id: idLike,
  anchor_id: str,
  tone: str,
  translations: z
    .array(
      z.object({
        ...Tr,
        title: str,
        text: str,
        primary_label: str,
        primary_href: str,
        secondary_label: str,
        secondary_href: str,
      }),
    )
    .nullish(),
});

const RawPage = z.object({
  id: z.string(),
  status: str,
  noindex: z.boolean().nullish(),
  seo_image: z.string().nullish(),
  translations: z.array(
    z.object({
      languages_code: z.string(),
      slug: str,
      title: str,
      seo_title: str,
      seo_description: str,
      canonical: str,
    }),
  ),
  blocks: z.array(
    z.object({
      id: idLike,
      collection: z.string(),
      sort: z.number().nullish(),
      item: z.unknown(),
    }),
  ),
});

export type RawPageData = z.infer<typeof RawPage>;

/** Valide la forme d'un élément `pages` de Directus ; lève si elle est inattendue. */
export function parsePageResponse(data: unknown): RawPageData {
  return RawPage.parse(data);
}

/* -------------------------------------------------------------------------- */
/* Aides                                                                       */
/* -------------------------------------------------------------------------- */

function txt(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function cta(
  label: string | null | undefined,
  href: string | null | undefined,
): Cta | null {
  const l = txt(label);
  const h = safeHref(href);
  return l && h ? { label: l, href: h } : null;
}

function media(
  file: z.infer<typeof FileRef>,
  alt?: string | null,
): MediaRef | null {
  if (!file) return null;
  const f = typeof file === "string" ? { id: file } : file;
  return {
    id: f.id,
    width: "width" in f ? (f.width ?? null) : null,
    height: "height" in f ? (f.height ?? null) : null,
    alt: txt(alt) ?? "",
  };
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], def: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : def;
}

/** Ancre d'un bloc : seul le motif `^[a-z0-9-]{0,40}$` passe ; vide ou invalide = pas d'ancre. */
export function anchorOf(v: unknown): string | null {
  return typeof v === "string" && /^[a-z0-9-]{1,40}$/.test(v) ? v : null;
}

const TONE_VALUES = ["sombre", "clair", "sable"] as const;
/** Ton d'un bloc ; l'ancienne valeur « accent » (appel à l'action, S2) se lit comme « sable ». */
function toneOf(v: unknown, def: Tone): Tone {
  return v === "accent" ? "sable" : oneOf(v, TONE_VALUES, def);
}

/** Liste JSON saisie dans Directus : les entrées invalides sont écartées une à une, jamais la liste entière. */
const ListOf = <S extends z.ZodRawShape>(shape: S) => {
  const schema = z.object(shape);
  return z
    .array(z.unknown())
    .catch([])
    .transform((arr) =>
      arr.flatMap((entry) => {
        const r = schema.safeParse(entry);
        return r.success ? [r.data] : [];
      }),
    );
};

const SectionItems = ListOf({ title: str, text: str });
const CardList = ListOf({
  title: str,
  text: str,
  href: str,
  link_label: str,
  label: str,
  status: str,
});
const PlanList = ListOf({
  name: str,
  price_label: str,
  billing_note: str,
  description: str,
  features: str,
  cta_label: str,
  cta_href: str,
});
const QuestionList = ListOf({ question: str, answer: str });

/* -------------------------------------------------------------------------- */
/* Normalisation d'une page dans une langue                                    */
/* -------------------------------------------------------------------------- */

function forLang<T extends { languages_code: string }>(
  list: T[] | null | undefined,
  code: LangCode,
): T | null {
  return list?.find((t) => t.languages_code === code) ?? null;
}

function normalizeBlock(
  raw: RawPageData["blocks"][number],
  index: number,
  code: LangCode,
): Block | null {
  const key = `${raw.collection}-${raw.id ?? `n${index}`}`;
  switch (raw.collection) {
    case "block_hero": {
      const item = HeroItem.parse(raw.item);
      const t = forLang(item.translations, code);
      const headline = txt(t?.headline);
      if (!t || !headline) return null;
      return {
        type: "hero",
        key,
        anchorId: anchorOf(item.anchor_id),
        variant: toneOf(item.variant, "sombre"),
        perimeterGrid: item.perimeter_grid ?? true,
        media: media(item.media),
        eyebrow: txt(t.eyebrow),
        headline,
        subheadline: txt(t.subheadline),
        primary: cta(t.primary_label, t.primary_href),
        secondary: cta(t.secondary_label, t.secondary_href),
      };
    }
    case "block_section": {
      const item = SectionItem.parse(raw.item);
      const t = forLang(item.translations, code);
      if (!t) return null;
      const body = txt(t.body);
      const parsed = body ? parseRichText(body) : [];
      return {
        type: "section",
        key,
        anchorId: anchorOf(item.anchor_id),
        tone: toneOf(item.tone, "clair"),
        visual: oneOf<SectionVisual>(
          item.visual,
          ["aucun", "perimetre-sur-place", "perimetre-heberge", "flux-donnees"],
          "aucun",
        ),
        title: txt(t.title),
        body: parsed.length > 0 ? parsed : null,
        media: media(item.media, t.media_alt),
        mediaPosition: oneOf(
          item.media_position,
          ["none", "left", "right", "top"],
          "none",
        ),
        items: SectionItems.parse(t.items)
          .map((i) => ({ title: txt(i.title), text: txt(i.text) }))
          .filter((i) => i.title || i.text),
      };
    }
    case "block_cards": {
      const item = CardsItem.parse(raw.item);
      const t = forLang(item.translations, code);
      if (!t) return null;
      const columns = Number(item.columns);
      return {
        type: "cards",
        key,
        anchorId: anchorOf(item.anchor_id),
        tone: toneOf(item.tone, "clair"),
        layout: oneOf<CardLayout>(
          item.layout,
          ["grille", "liste", "etapes", "modules"],
          "grille",
        ),
        columns: columns === 2 || columns === 4 ? columns : 3,
        title: txt(t.title),
        intro: txt(t.intro),
        cards: CardList.parse(t.cards)
          .map((c) => ({
            title: txt(c.title),
            text: txt(c.text),
            href: safeHref(c.href),
            linkLabel: txt(c.link_label),
            label: txt(c.label),
            status: oneOf<CardStatus | "">(
              c.status,
              ["disponible", "pilote", "prevu"],
              "",
            ) || null,
          }))
          .filter((c) => c.title || c.text),
      };
    }
    case "block_pricing": {
      const item = PricingItem.parse(raw.item);
      const t = forLang(item.translations, code);
      if (!t) return null;
      return {
        type: "pricing",
        key,
        anchorId: anchorOf(item.anchor_id),
        tone: toneOf(item.tone, "clair"),
        title: txt(t.title),
        intro: txt(t.intro),
        plans: PlanList.parse(t.plans).flatMap((p) => {
          const name = txt(p.name);
          if (!name) return [];
          return [
            {
              name,
              priceLabel: txt(p.price_label),
              billingNote: txt(p.billing_note),
              description: txt(p.description),
              features: (p.features ?? "")
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter(Boolean),
              cta: cta(p.cta_label, p.cta_href),
            },
          ];
        }),
        note: txt(t.note),
      };
    }
    case "block_faq": {
      const item = FaqItem.parse(raw.item);
      const t = forLang(item.translations, code);
      if (!t) return null;
      const items = QuestionList.parse(t.items).flatMap((q) => {
        const question = txt(q.question);
        const answer = txt(q.answer);
        return question && answer ? [{ question, answer }] : [];
      });
      if (items.length === 0) return null;
      return {
        type: "faq",
        key,
        anchorId: anchorOf(item.anchor_id),
        tone: toneOf(item.tone, "clair"),
        emitJsonLd: item.emit_jsonld ?? true,
        title: txt(t.title),
        items,
      };
    }
    case "block_cta": {
      const item = CtaItem.parse(raw.item);
      const t = forLang(item.translations, code);
      const title = txt(t?.title);
      if (!t || !title) return null;
      return {
        type: "cta",
        key,
        anchorId: anchorOf(item.anchor_id),
        tone: toneOf(item.tone, "sombre"),
        title,
        text: txt(t.text),
        primary: cta(t.primary_label, t.primary_href),
        secondary: cta(t.secondary_label, t.secondary_href),
      };
    }
    default:
      return null;
  }
}

/** Une adresse absolue http(s) ou un chemin du site ; tout le reste est ignoré. */
function canonicalOf(v: string | null | undefined): string | null {
  const h = safeHref(v);
  if (!h || h.startsWith("#") || /^(mailto|tel):/i.test(h)) return null;
  return h;
}

/**
 * Page Directus -> modèle dans une langue. `null` si la page n'a pas de traduction dans cette langue.
 * Lève `CmsContentError` si elle n'a aucun bloc affichable (jamais de page vide).
 */
export function normalizePage(
  raw: RawPageData,
  code: LangCode,
): PageModel | null {
  const tr = forLang(raw.translations, code);
  if (!tr) return null;
  const title = txt(tr.title);
  if (!title) return null;

  const blocks: Block[] = [];
  const ordered = raw.blocks
    .map((b, i) => ({ b, i }))
    .sort((x, y) => (x.b.sort ?? 0) - (y.b.sort ?? 0) || x.i - y.i);
  for (const { b, i } of ordered) {
    try {
      const block = normalizeBlock(b, i, code);
      if (block) blocks.push(block);
    } catch {
      // un bloc dont la forme est inattendue est écarté ; la page reste servie
    }
  }
  if (blocks.length === 0)
    throw new CmsContentError(
      `aucun bloc affichable (page ${raw.id}, ${code})`,
    );

  return {
    id: raw.id,
    lang: code,
    slug: tr.slug ?? "",
    title,
    seoTitle: txt(tr.seo_title),
    seoDescription: txt(tr.seo_description),
    canonical: canonicalOf(tr.canonical),
    noindex: raw.noindex ?? false,
    seoImageId: raw.seo_image ?? null,
    blocks,
    translations: raw.translations.flatMap((t) =>
      t.languages_code === "fr-CA" || t.languages_code === "en-CA"
        ? [{ code: t.languages_code as LangCode, slug: t.slug ?? "" }]
        : [],
    ),
  };
}
