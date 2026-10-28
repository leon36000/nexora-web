import { z } from "zod";
import { cleanSlug } from "@/lib/safe-href";
import type { CmsClient } from "./client";
import { CmsContentError } from "./errors";

/** Page publiée vue sous l'angle SEO : dates réelles et textes de balises, par langue. */
type SeoPageTranslation = {
  code: "fr-CA" | "en-CA";
  /** `""` pour l'accueil. */
  slug: string;
  title: string;
  seoTitle: string | null;
  seoDescription: string | null;
  canonical: string | null;
};

export type SeoPage = {
  id: string;
  noindex: boolean;
  createdAt: string | null;
  /** `date_updated` de la page dans Directus ; null si inconnu (le sitemap omet alors lastmod). */
  updatedAt: string | null;
  translations: SeoPageTranslation[];
};

const Rows = z.array(
  z.object({
    id: z.string(),
    status: z.string(),
    noindex: z.boolean().nullish(),
    date_created: z.string().nullish(),
    date_updated: z.string().nullish(),
    translations: z
      .array(
        z.object({
          languages_code: z.string(),
          slug: z.string().nullish(),
          title: z.string().nullish(),
          seo_title: z.string().nullish(),
          seo_description: z.string().nullish(),
          canonical: z.string().nullish(),
        }),
      )
      .nullish(),
  }),
);

/**
 * Pages PUBLIÉES (filtre `status = published` TOUJOURS, revérifié ligne par ligne : sans licence le jeton lecteur voit
 * aussi les brouillons). Les pages `noindex` sont renvoyées avec leur drapeau : c'est l'appelant (sitemap, llms.txt)
 * qui les exclut.
 */
export async function fetchSeoPages(client: CmsClient): Promise<SeoPage[]> {
  const data = await client.get("/items/pages", {
    filter: JSON.stringify({ status: { _eq: "published" } }),
    fields:
      "id,status,noindex,date_created,date_updated,translations.languages_code,translations.slug,translations.title,translations.seo_title,translations.seo_description,translations.canonical",
    sort: "id",
    limit: "-1",
  });
  let rows: z.infer<typeof Rows>;
  try {
    rows = Rows.parse(data);
  } catch {
    throw new CmsContentError(
      "réponse Directus de forme inattendue (pages SEO)",
    );
  }
  return rows
    .filter((r) => r.status === "published")
    .map((r) => ({
      id: r.id,
      noindex: r.noindex === true,
      createdAt: r.date_created ?? null,
      updatedAt: r.date_updated ?? null,
      translations: (r.translations ?? []).flatMap((t) =>
        (t.languages_code === "fr-CA" || t.languages_code === "en-CA") &&
        t.title &&
        cleanSlug(t.slug) !== null
          ? [
              {
                code: t.languages_code as "fr-CA" | "en-CA",
                slug: t.slug ?? "",
                title: t.title,
                seoTitle: t.seo_title ?? null,
                seoDescription: t.seo_description ?? null,
                canonical: t.canonical ?? null,
              },
            ]
          : [],
      ),
    }));
}
