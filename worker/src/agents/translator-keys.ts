import type { PageBlockRow, PageSnapshot } from "./page-reader.ts";

/**
 * Extraction / application des chaînes à traduire. Le Traducteur ne voit et ne renvoie que des CHAÎNES indexées par
 * une clé stable : la structure de la page, les liens, les ancres, les tons et les types de blocs viennent du CODE
 * (copiés du français). Un modèle ne peut donc ni ajouter un bloc, ni changer un lien, ni toucher à un statut.
 *
 * Clés : `b<n>.<champ>` ou `b<n>.<liste>.<i>.<champ>` (n = rang du bloc, à partir de 1). Les blocs de tarifs ne sont
 * jamais traduits par un agent (les prix et leurs libellés sont une décision humaine).
 */

type Json = Record<string, unknown>;

/** Champs texte simples (traduits) et champs copiés tels quels, par type de bloc. */
const SCHEMA = {
  block_hero: {
    text: [
      "eyebrow",
      "headline",
      "subheadline",
      "primary_label",
      "secondary_label",
    ],
    copy: ["primary_href", "secondary_href"],
    html: [] as string[],
    lists: {} as Record<string, { text: string[]; copy: string[] }>,
  },
  block_section: {
    text: ["title"],
    copy: ["media_alt"],
    html: ["body"],
    lists: { items: { text: ["title", "text"], copy: [] } },
  },
  block_cards: {
    text: ["title", "intro"],
    copy: [],
    html: [],
    lists: {
      cards: {
        text: ["title", "text", "link_label", "label"],
        copy: ["href", "status"],
      },
    },
  },
  block_faq: {
    text: ["title"],
    copy: [],
    html: [],
    lists: { items: { text: ["question", "answer"], copy: [] } },
  },
  block_cta: {
    text: ["title", "text", "primary_label", "secondary_label"],
    copy: ["primary_href", "secondary_href"],
    html: [],
    lists: {},
  },
} as const;
type Translatable = keyof typeof SCHEMA;
const isTranslatable = (c: string): c is Translatable => c in SCHEMA;

const asString = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

function frenchOf(block: PageBlockRow): Json | null {
  const tr = block.item?.translations?.find(
    (t) => t.languages_code === "fr-CA",
  );
  return tr ?? null;
}

/** Chaînes françaises à traduire : page puis blocs. */
export function extractStrings(page: PageSnapshot): Record<string, string> {
  const out: Record<string, string> = {};
  const fr = page.translations.find((t) => t.languages_code === "fr-CA");
  if (!fr) return out;
  for (const k of ["title", "seo_title", "seo_description"] as const) {
    const v = asString(fr[k]);
    if (v) out[`p.${k}`] = v;
  }
  page.blocks.forEach((b, i) => {
    if (!isTranslatable(b.collection)) return;
    const tr = frenchOf(b);
    if (!tr) return;
    const spec = SCHEMA[b.collection];
    const n = i + 1;
    for (const f of [...spec.text, ...spec.html]) {
      const v = asString(tr[f]);
      if (v) out[`b${n}.${f}`] = v;
    }
    for (const [list, lspec] of Object.entries(spec.lists)) {
      const items = Array.isArray(tr[list]) ? (tr[list] as Json[]) : [];
      items.forEach((it, j) => {
        for (const f of lspec.text) {
          const v = asString(it?.[f]);
          if (v) out[`b${n}.${list}.${j}.${f}`] = v;
        }
      });
    }
  });
  return out;
}

/** Squelette HTML (balises et attributs, sans le texte) : la traduction d'un corps doit avoir le même. */
export function htmlSkeleton(html: string): string {
  return (html.match(/<[^>]+>/g) ?? [])
    .map((t) => t.replace(/\s+/g, " ").trim().toLowerCase())
    .join("");
}

export class TranslationShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranslationShapeError";
  }
}

/** Vérifie que le modèle a renvoyé EXACTEMENT les clés demandées, des chaînes sans balisage inattendu. */
export function validateTranslated(
  source: Record<string, string>,
  translated: Record<string, string>,
): void {
  const want = Object.keys(source);
  const got = Object.keys(translated);
  const missing = want.filter((k) => !(k in translated));
  const extra = got.filter((k) => !(k in source));
  if (missing.length || extra.length)
    throw new TranslationShapeError(
      `clés différentes (manquantes : ${missing.slice(0, 5).join(", ") || "aucune"} ; en trop : ${extra.slice(0, 5).join(", ") || "aucune"})`,
    );
  for (const k of want) {
    const src = source[k] as string;
    const dst = translated[k];
    if (typeof dst !== "string" || dst.trim() === "")
      throw new TranslationShapeError(`« ${k} » vide`);
    if (/\.body$/.test(k)) {
      if (htmlSkeleton(dst) !== htmlSkeleton(src))
        throw new TranslationShapeError(
          `« ${k} » : la structure HTML a changé`,
        );
    } else if (/<\s*\/?\s*[a-z!]/i.test(dst)) {
      throw new TranslationShapeError(`« ${k} » : balisage interdit`);
    }
    if (dst.length > src.length * 3 + 80)
      throw new TranslationShapeError(`« ${k} » : longueur anormale`);
  }
}

export interface EnglishBlockUpdate {
  /** Ligne de jonction `pages_blocks`. */
  junctionId: number;
  collection: Translatable;
  itemId: string;
  /** Traduction en-CA existante (mise à jour) ou null (création). */
  existingTranslationId: number | string | null;
  translation: Json;
}

/** Construit les traductions en-CA des blocs : textes traduits, tout le reste copié du français. */
export function buildEnglishBlocks(
  page: PageSnapshot,
  translated: Record<string, string>,
): EnglishBlockUpdate[] {
  const out: EnglishBlockUpdate[] = [];
  page.blocks.forEach((b, i) => {
    if (!isTranslatable(b.collection) || !b.item) return;
    const fr = frenchOf(b);
    if (!fr) return;
    const spec = SCHEMA[b.collection];
    const n = i + 1;
    const tr: Json = {};
    for (const f of [...spec.text, ...spec.html]) {
      const key = `b${n}.${f}`;
      tr[f] = key in translated ? translated[key] : (fr[f] ?? null);
    }
    for (const f of spec.copy) tr[f] = fr[f] ?? null;
    for (const [list, lspec] of Object.entries(spec.lists)) {
      const items = Array.isArray(fr[list]) ? (fr[list] as Json[]) : [];
      tr[list] = items.map((it, j) => {
        const o: Json = {};
        for (const f of lspec.text) {
          const key = `b${n}.${list}.${j}.${f}`;
          o[f] = key in translated ? translated[key] : (it?.[f] ?? null);
        }
        for (const f of lspec.copy) o[f] = it?.[f] ?? null;
        return o;
      });
    }
    const existing = b.item.translations?.find(
      (t) => t.languages_code === "en-CA",
    );
    out.push({
      junctionId: b.id,
      collection: b.collection,
      itemId: b.item.id,
      existingTranslationId: existing?.id ?? null,
      translation: tr,
    });
  });
  return out;
}

/** Blocs qu'un agent ne traduit pas (tarifs…) : signalés au relecteur. */
export function untranslatedBlocks(page: PageSnapshot): string[] {
  return page.blocks.flatMap((b, i) =>
    isTranslatable(b.collection) ? [] : [`bloc ${i + 1} (${b.collection})`],
  );
}
