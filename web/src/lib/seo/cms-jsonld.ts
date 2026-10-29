import { normalizeText } from "@nexora/seo";
import { type Lang, localizePath } from "@/i18n/config";
import { buildFaqJsonLd } from "@/lib/jsonld";
import type { PageModel } from "@/server/cms/model";
import { type OrgProfile, organizationProfile } from "./entity";
import {
  articleJsonLd,
  breadcrumbJsonLd,
  type Crumb,
  organizationJsonLd,
  serviceJsonLd,
  softwareApplicationJsonLd,
  webPageJsonLd,
  websiteJsonLd,
} from "./jsonld";
import { ogPath } from "./og";
import { pageSchemaType, SECTION_CRUMBS } from "./page-schema";

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
 * - accueil : Organization (logo, profils publics, région) + WebSite + WebPage ;
 * - autres pages : BreadcrumbList (avec l'étape de section quand elle existe) + WebPage (AboutPage pour l'entreprise) ;
 * - Service / SoftwareApplication / Article selon le registre de slugs (`page-schema.ts`) ; un Article remplace la
 *   WebPage ; l'éditeur, le fournisseur et l'auteur sont toujours la même Organization (`@id`) ;
 * - FAQPage : blocs FAQ qui l'autorisent.
 * Le nom d'une page est son titre s'il s'affiche, sinon le titre du héros (qui s'affiche toujours) ; la description est
 * le sous-titre du héros s'il s'affiche. Rien de ce qui n'est pas affiché n'est émis, aucune date n'est inventée.
 */
export function buildCmsJsonLd(input: {
  page: PageModel;
  lang: Lang;
  siteName: string;
  siteUrl: string;
  dates: SeoDates | null;
  /** Logo, profils publics et région de l'entreprise ; défaut : profil du site (`organizationProfile`). */
  profile?: OrgProfile;
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
  const frSlug =
    page.translations.find((t) => t.code === "fr-CA")?.slug ?? page.slug;
  const type = page.slug === "" ? null : pageSchemaType(frSlug);
  const name = isShown(page.title) ? page.title : headline;
  const description = isShown(subheadline) ? subheadline : null;

  if (page.slug === "") {
    out.push(
      organizationJsonLd({
        name: input.siteName,
        url: siteUrl,
        profile: input.profile ?? organizationProfile(siteUrl),
      }),
      websiteJsonLd({ name: input.siteName, url: siteUrl, lang }),
    );
  } else {
    const crumbs: Crumb[] = [
      { name: HOME_CRUMB[lang], url: `${siteUrl}${localizePath(lang, "/")}` },
    ];
    // Étape de section : seulement pour une section qui existe vraiment (registre `SECTION_CRUMBS`).
    const section = frSlug.split("/")[0] ?? "";
    const own = page.slug.split("/");
    const sectionCrumb = SECTION_CRUMBS[section];
    if (sectionCrumb && own.length > 1)
      crumbs.push({
        name: sectionCrumb[lang],
        url: `${siteUrl}${localizePath(lang, `/${own[0]}`)}`,
      });
    crumbs.push({ name: page.title, url });
    out.push(breadcrumbJsonLd(crumbs));
  }

  // Un Article tient lieu de WebPage ; toute autre page publiée dit sa langue, son site et sa dernière modification.
  if (type !== "article")
    out.push(
      webPageJsonLd({
        name,
        description,
        url,
        lang,
        siteUrl,
        siteName: input.siteName,
        dateModified: input.dates?.updatedAt ?? null,
        kind: type === "about" ? "AboutPage" : "WebPage",
      }),
    );

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
          publisher: { name: input.siteName, url: siteUrl },
        }),
      );
    else if (type === "article")
      out.push(
        articleJsonLd({
          headline: name,
          description,
          url,
          lang,
          publisherName: input.siteName,
          publisherUrl: siteUrl,
          datePublished: input.dates?.createdAt ?? null,
          dateModified: input.dates?.updatedAt ?? null,
          // image Open Graph de la page (route /og : titre de la page publiée)
          image: `${siteUrl}${ogPath(lang, page.slug === "" ? "/" : `/${page.slug}`)}`,
        }),
      );
  }
  out.push(buildFaqJsonLd(page.blocks));
  return out.filter((x) => x !== null);
}
