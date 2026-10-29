import type { Metadata } from "next";
import { HTML_LANG, type Lang, localizePath, OG_LOCALE } from "@/i18n/config";
import { langOfCode } from "@/server/cms/lang";
import type { PageModel, SiteSettings } from "@/server/cms/model";
import { isArticleLike } from "./byline";
import { mediaPath } from "./media";
import { ogImage } from "./seo/og";

type Input = {
  page: PageModel;
  lang: Lang;
  settings: SiteSettings | null;
  siteName: string;
  /** Aperçu authentifié : jamais indexable. */
  preview: boolean;
  /** Dates réelles de la page (Directus) : servent aux guides ; absentes = omises, jamais inventées. */
  dates?: { createdAt: string | null; updatedAt: string | null } | null;
};

const pathOf = (slug: string) => (slug === "" ? "/" : `/${slug}`);

/**
 * Métadonnées d'une page issue de Directus : titre, description, canonical, robots, Open Graph,
 * et alternates hreflang UNIQUEMENT pour les langues dont la traduction existe (x-default -> fr-CA s'il existe).
 */
export function buildCmsMetadata({
  page,
  lang,
  settings,
  siteName,
  preview,
  dates = null,
}: Input): Metadata {
  const base = page.seoTitle ?? page.title;
  const template = settings?.seoTitleTemplate;
  const title =
    page.slug !== "" && template?.includes("%s")
      ? template.replace("%s", base)
      : base;
  const description =
    page.seoDescription ?? settings?.seoDescription ?? undefined;

  const languages: Record<string, string> = {};
  const others: string[] = [];
  for (const t of page.translations) {
    const l = langOfCode(t.code);
    if (!l) continue;
    languages[HTML_LANG[l]] = localizePath(l, pathOf(t.slug));
    if (l !== lang) others.push(OG_LOCALE[l]);
  }
  const fr = page.translations.find((t) => t.code === "fr-CA");
  if (fr) languages["x-default"] = localizePath("fr", pathOf(fr.slug));

  const canonical = page.canonical ?? localizePath(lang, pathOf(page.slug));
  const imageId = page.seoImageId ?? settings?.ogDefaultImageId ?? null;
  // Sans image saisie dans Directus : image Open Graph dynamique (titre de la page publiée, rendu par /og).
  const images = imageId
    ? [{ url: mediaPath(imageId) }]
    : [ogImage(lang, pathOf(page.slug), title)];
  const hidden = preview || page.noindex;
  // Un guide est un article (comme son Article JSON-LD) : type, dates réelles et auteur (l'entreprise).
  const frSlug = fr?.slug ?? page.slug;
  const article = page.slug !== "" && isArticleLike(frSlug);

  return {
    title,
    description,
    alternates: { canonical, languages },
    robots: hidden
      ? { index: false, follow: false, nocache: true }
      : { index: true, follow: true },
    openGraph: {
      ...(article
        ? {
            type: "article" as const,
            ...(dates?.createdAt ? { publishedTime: dates.createdAt } : {}),
            ...(dates?.updatedAt ? { modifiedTime: dates.updatedAt } : {}),
            authors: [siteName],
          }
        : { type: "website" as const }),
      siteName,
      title,
      description,
      url: canonical,
      locale: OG_LOCALE[lang],
      alternateLocale: others,
      images,
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title,
      description,
      images: images?.map((i) => i.url),
    },
  };
}
