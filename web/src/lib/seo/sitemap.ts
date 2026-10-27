import type { MetadataRoute } from "next";
import { HTML_LANG, LANGS, type Lang, localizePath } from "@/i18n/config";
import { cleanSlug } from "@/lib/safe-href";
import { langOfCode } from "@/server/cms/lang";
import type { SeoPage } from "@/server/cms/seo-pages";
import type { AppRoute } from "./app-routes";

type Entry = MetadataRoute.Sitemap[number];

export type SitemapInput = {
  siteUrl: string;
  pages: readonly SeoPage[];
  /** Routes de l'application qui existent dans ce déploiement. */
  appRoutes: readonly AppRoute[];
  /** Modèles publiés du catalogue public (identifiants publics). */
  modelIds: readonly string[];
  /** Date de publication de la version de catalogue affichée ; null si inconnue. */
  catalogPublishedAt: string | null;
  /** Applications VPS publiées (codes publics de /vps/<application>). */
  vpsAppCodes: readonly string[];
  /** Date de publication du catalogue VPS affiché ; null si inconnue. */
  vpsPublishedAt: string | null;
  /** Agents hébergés publiés et listés (identifiants de /agents/<slug>). */
  agentSlugs: readonly string[];
  /** Dernière publication parmi les agents affichés ; null si inconnue. */
  agentsPublishedAt: string | null;
};

const pathOf = (slug: string) => (slug === "" ? "/" : `/${slug}`);

/** Date ISO valide, sinon `undefined` : jamais « maintenant » (un lastmod inventé fait perdre sa valeur au champ). */
function realDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Plan du site. Règles :
 * - pages Directus : publiées seulement (le lecteur filtre déjà), jamais `noindex`, une entrée par traduction ;
 *   une traduction dont le canonical pointe ailleurs n'est pas listée ;
 * - `alternates.languages` : seulement les langues dont la traduction existe ; `x-default` -> fr-CA seulement s'il existe
 *   (même règle que les balises de la page) ;
 * - routes de l'application : fr-CA et en-CA existent toujours ;
 * - `lastModified` : date réelle (page : `date_updated` ; catalogue : date de publication) ou omis.
 */
export function buildSitemap(input: SitemapInput): MetadataRoute.Sitemap {
  const abs = (path: string) => `${input.siteUrl}${path}`;
  const out: Entry[] = [];

  for (const page of input.pages) {
    if (page.noindex) continue;
    const urls = new Map<Lang, string>();
    for (const t of page.translations) {
      const lang = langOfCode(t.code);
      if (!lang) continue;
      // Un slug saisi dans Directus qui n'est pas propre ne devient jamais une adresse (le XML n'échappe rien).
      if (cleanSlug(t.slug) === null) continue;
      const url = abs(localizePath(lang, pathOf(t.slug)));
      const canonical = t.canonical?.replace(/\/+$/, "");
      if (canonical && canonical !== url.replace(/\/+$/, "")) continue;
      urls.set(lang, url);
    }
    const lastModified = realDate(page.updatedAt);
    for (const lang of LANGS) {
      const url = urls.get(lang);
      if (!url) continue;
      const languages: Record<string, string> = {};
      for (const l of LANGS) {
        const u = urls.get(l);
        if (u) languages[HTML_LANG[l]] = u;
      }
      const fr = urls.get("fr");
      if (fr) languages["x-default"] = fr;
      out.push({
        url,
        ...(lastModified ? { lastModified } : {}),
        alternates: { languages },
      });
    }
  }

  const catalogDate = realDate(input.catalogPublishedAt);
  const appEntry = (path: string, lastModified: Date | undefined) => {
    const languages: Record<string, string> = {};
    for (const l of LANGS) languages[HTML_LANG[l]] = abs(localizePath(l, path));
    languages["x-default"] = abs(localizePath("fr", path));
    for (const l of LANGS)
      out.push({
        url: abs(localizePath(l, path)),
        ...(lastModified ? { lastModified } : {}),
        alternates: { languages },
      });
  };
  const vpsDate = realDate(input.vpsPublishedAt);
  const agentsDate = realDate(input.agentsPublishedAt);
  for (const route of input.appRoutes) {
    appEntry(
      route.path,
      route.dated === "catalog"
        ? catalogDate
        : route.dated === "vps"
          ? vpsDate
          : route.dated === "agents"
            ? agentsDate
            : undefined,
    );
    if (route.path === "/modeles")
      for (const id of input.modelIds) appEntry(`/modeles/${id}`, catalogDate);
    if (route.path === "/agents")
      for (const slug of input.agentSlugs)
        appEntry(`/agents/${slug}`, agentsDate);
    if (route.path === "/vps")
      for (const code of input.vpsAppCodes) appEntry(`/vps/${code}`, vpsDate);
  }
  return out;
}
