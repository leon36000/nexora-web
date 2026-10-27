import { normalizeText } from "@nexora/seo";
import { type Lang, localizePath } from "@/i18n/config";
import { buildFaqJsonLd } from "@/lib/jsonld";
import type { PageModel } from "@/server/cms/model";
import {
  articleJsonLd,
  breadcrumbJsonLd,
  organizationJsonLd,
  serviceJsonLd,
  softwareApplicationJsonLd,
  websiteJsonLd,
} from "./jsonld";
import { pageSchemaType } from "./page-schema";

/** Libellé technique du premier maillon du fil d'Ariane (donnée structurée, non affichée). */
export const HOME_CRUMB: Record<Lang, string> = { fr: "Accueil", en: "Home" };

/** Toutes les chaînes des blocs (sans clés techniques) : ce que la page peut afficher. */
function blockStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) blockStrings(v, out);
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value))
      if (!["key", "type", "href", "id", "anchorId"].includes(k))
        blockStrings(v, out);
  return out;
}

export type SeoDates = { createdAt: string | null; updatedAt: string | null };

/**
 * Données structurées d'une page Directus, dérivées de ses blocs VISIBLES :
 * - accueil : Organization + WebSite ; autres pages : BreadcrumbList ;
 * - Service / SoftwareApplication / Article selon le registre de slugs (`page-schema.ts`) ;
 * - FAQPage : blocs FAQ qui l'autorisent.
 * Le nom d'un Service/Article est le titre de la page s'il s'affiche, sinon le titre du héros (qui s'affiche
 * toujours) ; la description est le sous-titre du héros. Rien de ce qui n'est pas affiché n'est émis.
 */
export function buildCmsJsonLd(input: {
  page: PageModel;
  lang: Lang;
  siteName: string;
  siteUrl: string;
  dates: SeoDates | null;
}): unknown[] {
  const { page, lang, siteUrl } = input;
  const out: unknown[] = [];
  const shown = new Set(blockStrings(page.blocks).map(normalizeText));
  const isShown = (s: string | null | undefined) =>
    !!s && shown.has(normalizeText(s));
  const hero = page.blocks.find((b) => b.type === "hero");
  const headline = hero?.type === "hero" ? hero.headline : null;
  const subheadline = hero?.type === "hero" ? hero.subheadline : null;
  const url = `${siteUrl}${localizePath(lang, page.slug === "" ? "/" : `/${page.slug}`)}`;

  if (page.slug === "") {
    out.push(
      organizationJsonLd({ name: input.siteName, url: siteUrl }),
      websiteJsonLd({ name: input.siteName, url: siteUrl, lang }),
    );
  } else {
    out.push(
      breadcrumbJsonLd([
        { name: HOME_CRUMB[lang], url: `${siteUrl}${localizePath(lang, "/")}` },
        { name: page.title, url },
      ]),
    );
  }

  const frSlug =
    page.translations.find((t) => t.code === "fr-CA")?.slug ?? page.slug;
  const type = page.slug === "" ? null : pageSchemaType(frSlug);
  const name = isShown(page.title) ? page.title : headline;
  const description = isShown(subheadline) ? subheadline : null;
  if (type && name) {
    if (type === "service")
      out.push(
        serviceJsonLd({
          name,
          description,
          url,
          providerName: input.siteName,
          organizationUrl: siteUrl,
        }),
      );
    else if (type === "software")
      out.push(
        softwareApplicationJsonLd({
          name,
          description,
          url,
          category: "BusinessApplication",
          offers: [], // aucun prix affiché : pas d'offre
        }),
      );
    else
      out.push(
        articleJsonLd({
          headline: name,
          description,
          url,
          lang,
          publisherName: input.siteName,
          datePublished: input.dates?.createdAt ?? null,
          dateModified: input.dates?.updatedAt ?? null,
          image: null,
        }),
      );
  }

  out.push(buildFaqJsonLd(page.blocks));
  return out.filter((x) => x !== null);
}
