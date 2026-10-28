import type { AgentDirectus } from "./directus-client.ts";

/** Lecture d'une page de Directus (lecture seule) telle que les agents la voient, en brouillon ou publiée. */

const BLOCK_TYPES = [
  "block_hero",
  "block_section",
  "block_cards",
  "block_pricing",
  "block_faq",
  "block_cta",
] as const;

const PAGE_READ_FIELDS = [
  "id",
  "status",
  "noindex",
  "date_updated",
  "translations.id",
  "translations.languages_code",
  "translations.slug",
  "translations.title",
  "translations.seo_title",
  "translations.seo_description",
  "blocks.id",
  "blocks.sort",
  "blocks.collection",
  ...BLOCK_TYPES.flatMap((b) => [
    `blocks.item:${b}.*`,
    `blocks.item:${b}.translations.*`,
  ]),
].join(",");

type Json = Record<string, unknown>;

interface PageTranslationRow {
  id: number | string;
  languages_code: string;
  slug: string | null;
  title: string | null;
  seo_title: string | null;
  seo_description: string | null;
}
export interface PageBlockRow {
  /** Ligne de jonction `pages_blocks`. */
  id: number;
  sort: number | null;
  collection: string;
  item:
    | ({
        id: string;
        translations?: (Json & {
          id: number | string;
          languages_code: string;
        })[];
      } & Json)
    | null;
}
export interface PageSnapshot {
  id: string;
  status: string;
  noindex: boolean;
  translations: PageTranslationRow[];
  blocks: PageBlockRow[];
}

export async function readPage(
  directus: AgentDirectus,
  pageId: string,
): Promise<PageSnapshot> {
  const raw = await directus.get<Partial<PageSnapshot>>(
    `/items/pages/${pageId}?fields=${encodeURIComponent(PAGE_READ_FIELDS)}&deep[blocks][_sort]=sort`,
  );
  if (!raw?.id) throw new Error("page introuvable");
  return {
    id: raw.id,
    status: raw.status ?? "draft",
    noindex: Boolean(raw.noindex),
    translations: raw.translations ?? [],
    blocks: [...(raw.blocks ?? [])].sort(
      (a, b) => (a.sort ?? 1e9) - (b.sort ?? 1e9) || a.id - b.id,
    ),
  };
}

/** Pages publiées (id, slug, titre) dans une langue : cibles possibles des liens internes suggérés. */
export async function listPublishedPages(
  directus: AgentDirectus,
  language: string,
): Promise<{ pageId: string; slug: string; title: string }[]> {
  const filter = JSON.stringify({
    _and: [
      { languages_code: { _eq: language } },
      { pages_id: { status: { _eq: "published" } } },
    ],
  });
  const rows = await directus.get<
    { pages_id: string; slug: string | null; title: string | null }[]
  >(
    `/items/pages_translations?filter=${encodeURIComponent(filter)}&fields=pages_id,slug,title&limit=200`,
  );
  return (rows ?? []).map((r) => ({
    pageId: r.pages_id,
    slug: r.slug ?? "",
    title: r.title ?? "",
  }));
}
