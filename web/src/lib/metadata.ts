import type { Metadata } from "next";
import {
  HTML_LANG,
  LANGS,
  type Lang,
  localizePath,
  OG_LOCALE,
} from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { ogImage } from "./seo/og";
import { SITE_URL } from "./site";

type PageMetadataInput = {
  lang: Lang;
  /** Chemin neutre, sans préfixe de langue : `/`, `/solutions`… */
  path: string;
  title: string;
  description: string;
  siteName: string;
  /**
   * Page hors index (espace client) : `robots` noindex et aucune image Open Graph (la route /og ne produit pas
   * d'image pour une page non publique).
   */
  noindex?: boolean;
};

/**
 * Métadonnées de base d'une page : titre, description, canonical, alternates hreflang
 * réciproques (fr-CA, en-CA, x-default -> fr-CA) et Open Graph. Les URL sont absolues.
 */
export function buildPageMetadata({
  lang,
  path,
  title,
  description,
  siteName,
  noindex = false,
}: PageMetadataInput): Metadata {
  const languages: Record<string, string> = {};
  for (const l of LANGS) languages[HTML_LANG[l]] = localizePath(l, path);
  languages["x-default"] = localizePath("fr", path);

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates: {
      canonical: localizePath(lang, path),
      languages,
    },
    openGraph: {
      type: "website",
      siteName,
      title,
      description,
      url: localizePath(lang, path),
      locale: OG_LOCALE[lang],
      alternateLocale: LANGS.filter((l) => l !== lang).map((l) => OG_LOCALE[l]),
      ...(noindex ? {} : { images: [ogImage(lang, path, title)] }),
    },
    twitter: {
      card: noindex ? "summary" : "summary_large_image",
      title,
      description,
      ...(noindex ? {} : { images: [ogImage(lang, path, title).url] }),
    },
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
  };
}

/**
 * Métadonnées d'une page qui n'existe pas (ou plus). `generateMetadata` ne lève PAS `notFound()` : avec les composants
 * en cache, une erreur levée là fait servir une coquille d'erreur vide (ni titre, ni `lang`, ni contenu avant
 * l'hydratation). La page appelle `notFound()` elle-même : la mise en page, l'en-tête et la page 404 sont alors rendus
 * côté serveur, avec ce titre et `noindex`.
 */
export function notFoundMetadata(lang: Lang): Metadata {
  return {
    title: getDictionary(lang).meta.notFound.title,
    robots: { index: false, follow: false },
  };
}
