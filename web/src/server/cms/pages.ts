import { ZodError, z } from "zod";
import type { CmsClient } from "./client";
import { CmsContentError } from "./errors";
import type { LangCode } from "./lang";
import type { PageModel, PreviewInfo, SlugPair } from "./model";
import { normalizePage, parsePageResponse } from "./normalize";

/* -------------------------------------------------------------------------- */
/* Champs demandés                                                              */
/* -------------------------------------------------------------------------- */

const FILE = (p: string) =>
  `${p}.media.id,${p}.media.width,${p}.media.height,${p}.media.type`;

/** Champs d'une page avec ses six types de blocs M2A (forme décrite dans docs/cms.md §3). */
export const PAGE_FIELDS = [
  "id",
  "status",
  "noindex",
  "seo_image",
  "translations.languages_code",
  "translations.slug",
  "translations.title",
  "translations.seo_title",
  "translations.seo_description",
  "translations.canonical",
  "blocks.id",
  "blocks.collection",
  "blocks.sort",
  "blocks.item:block_hero.id",
  "blocks.item:block_hero.variant",
  "blocks.item:block_hero.anchor_id",
  "blocks.item:block_hero.perimeter_grid",
  FILE("blocks.item:block_hero"),
  "blocks.item:block_hero.translations.*",
  "blocks.item:block_section.id",
  "blocks.item:block_section.media_position",
  "blocks.item:block_section.tone",
  "blocks.item:block_section.visual",
  "blocks.item:block_section.anchor_id",
  FILE("blocks.item:block_section"),
  "blocks.item:block_section.translations.*",
  "blocks.item:block_cards.id",
  "blocks.item:block_cards.columns",
  "blocks.item:block_cards.layout",
  "blocks.item:block_cards.tone",
  "blocks.item:block_cards.anchor_id",
  "blocks.item:block_cards.translations.*",
  "blocks.item:block_pricing.id",
  "blocks.item:block_pricing.tone",
  "blocks.item:block_pricing.anchor_id",
  "blocks.item:block_pricing.translations.*",
  "blocks.item:block_faq.id",
  "blocks.item:block_faq.emit_jsonld",
  "blocks.item:block_faq.tone",
  "blocks.item:block_faq.anchor_id",
  "blocks.item:block_faq.translations.*",
  "blocks.item:block_cta.id",
  "blocks.item:block_cta.tone",
  "blocks.item:block_cta.anchor_id",
  "blocks.item:block_cta.translations.*",
].join(",");

const PUBLISHED = { status: { _eq: "published" } } as const;

/** Directus refuse `_eq` avec une chaîne vide : l'accueil (slug vide) se cherche avec `_empty`. */
function slugCondition(slug: string) {
  return slug === "" ? { slug: { _empty: true } } : { slug: { _eq: slug } };
}

/**
 * Filtre qui retrouve la traduction (langue + slug) d'une page.
 * `publishedOnly` : AJOUTE `pages_id.status = published`. Sans licence, le jeton lecteur voit les
 * brouillons : ce filtre est la seule barrière (voir AGENTS.md).
 */
export function translationFilter(
  code: LangCode,
  slug: string,
  publishedOnly: boolean,
): string {
  const and: unknown[] = [
    { languages_code: { _eq: code } },
    slugCondition(slug),
  ];
  if (publishedOnly) and.push({ pages_id: PUBLISHED });
  return JSON.stringify({ _and: and });
}

const IdRows = z.array(z.object({ pages_id: z.string() }));

function asContentError(e: unknown): never {
  if (e instanceof ZodError)
    throw new CmsContentError(
      `réponse Directus de forme inattendue (${e.issues[0]?.path.join(".") || "racine"})`,
    );
  throw e;
}

async function resolvePageId(
  client: CmsClient,
  code: LangCode,
  slug: string,
  publishedOnly: boolean,
): Promise<string | null> {
  const data = await client.get("/items/pages_translations", {
    filter: translationFilter(code, slug, publishedOnly),
    fields: "pages_id",
    limit: "1",
  });
  try {
    return IdRows.parse(data)[0]?.pages_id ?? null;
  } catch (e) {
    return asContentError(e);
  }
}

/* -------------------------------------------------------------------------- */
/* Lecture publique                                                             */
/* -------------------------------------------------------------------------- */

/** Page PUBLIÉE dans une langue, ou `null`. Ne renvoie jamais un brouillon. */
export async function fetchPublishedPage(
  client: CmsClient,
  code: LangCode,
  slug: string,
): Promise<PageModel | null> {
  const id = await resolvePageId(client, code, slug, true);
  if (!id) return null;
  const data = await client.get(`/items/pages/${encodeURIComponent(id)}`, {
    fields: PAGE_FIELDS,
  });
  try {
    const raw = parsePageResponse(data);
    // seconde barrière : même si le filtre était ignoré ou si l'état a changé entre deux requêtes
    if (raw.status !== "published") return null;
    return normalizePage(raw, code);
  } catch (e) {
    return asContentError(e);
  }
}

/** Slugs publiés par langue (hors accueil), pour `generateStaticParams`. */
export async function fetchPublishedSlugs(
  client: CmsClient,
): Promise<{ code: LangCode; slug: string }[]> {
  const data = await client.get("/items/pages_translations", {
    filter: JSON.stringify({ pages_id: PUBLISHED }),
    fields: "languages_code,slug",
    limit: "-1",
  });
  const rows = (() => {
    try {
      return z
        .array(
          z.object({ languages_code: z.string(), slug: z.string().nullish() }),
        )
        .parse(data);
    } catch (e) {
      return asContentError(e);
    }
  })();
  return rows.flatMap((r) =>
    (r.languages_code === "fr-CA" || r.languages_code === "en-CA") && r.slug
      ? [{ code: r.languages_code as LangCode, slug: r.slug }]
      : [],
  );
}

/**
 * Slugs de chaque page publiée dans chaque langue, regroupés par page (accueil compris, slug vide) :
 * table de correspondance du sélecteur de langue et des liens de navigation.
 */
export async function fetchSlugPairs(client: CmsClient): Promise<SlugPair[]> {
  const data = await client.get("/items/pages_translations", {
    filter: JSON.stringify({ pages_id: PUBLISHED }),
    fields: "pages_id,languages_code,slug",
    limit: "-1",
  });
  let rows: { pages_id: string; languages_code: string; slug?: string | null }[];
  try {
    rows = z
      .array(
        z.object({
          pages_id: z.string(),
          languages_code: z.string(),
          slug: z.string().nullish(),
        }),
      )
      .parse(data);
  } catch (e) {
    return asContentError(e);
  }
  const byPage = new Map<string, SlugPair>();
  for (const r of rows) {
    if (r.languages_code !== "fr-CA" && r.languages_code !== "en-CA") continue;
    const pair = byPage.get(r.pages_id) ?? {};
    pair[r.languages_code] = r.slug ?? "";
    byPage.set(r.pages_id, pair);
  }
  return [...byPage.values()];
}

/* -------------------------------------------------------------------------- */
/* Aperçu : la version de contenu en cours                                      */
/* -------------------------------------------------------------------------- */

const VersionRows = z.array(
  z.object({
    key: z.string().nullish(),
    name: z.string().nullish(),
    date_updated: z.string().nullish(),
  }),
);

/**
 * Page telle qu'elle serait avec sa version la plus récemment enregistrée (API des versions de
 * Directus : `?version=<clé>` renvoie l'élément fusionné, blocs M2A compris). Sans version, l'élément
 * principal (brouillon compris). Le client reçu doit avoir le droit de lire `directus_versions` (jeton
 * Publication) : à n'appeler qu'en mode brouillon (Draft Mode) authentifié.
 */
export async function fetchPageForPreview(
  client: CmsClient,
  code: LangCode,
  slug: string,
): Promise<{ page: PageModel; preview: PreviewInfo } | null> {
  const id = await resolvePageId(client, code, slug, false);
  if (!id) return null;

  const versionsData = await client.get("/versions", {
    filter: JSON.stringify({
      _and: [{ collection: { _eq: "pages" } }, { item: { _eq: id } }],
    }),
    sort: "-date_updated",
    fields: "key,name,date_updated",
    limit: "1",
  });
  let version: z.infer<typeof VersionRows>[number] | undefined;
  try {
    version = VersionRows.parse(versionsData)[0];
  } catch (e) {
    return asContentError(e);
  }
  const versionKey = version?.key ?? null;

  const data = await client.get(`/items/pages/${encodeURIComponent(id)}`, {
    fields: PAGE_FIELDS,
    ...(versionKey ? { version: versionKey } : {}),
  });
  try {
    const raw = parsePageResponse(data);
    const page = normalizePage(raw, code);
    if (!page) return null;
    return {
      page,
      preview: {
        versionKey,
        versionName: version?.name ?? null,
        updatedAt: version?.date_updated ?? null,
        pageStatus: raw.status ?? "draft",
      },
    };
  } catch (e) {
    return asContentError(e);
  }
}
