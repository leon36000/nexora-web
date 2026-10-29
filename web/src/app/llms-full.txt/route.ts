import { connection } from "next/server";
import { type Lang, localizePath } from "@/i18n/config";
import { getGatewayDictionary } from "@/i18n/gateway";
import { getDictionary } from "@/i18n/get-dictionary";
import { resolveHrefForLang } from "@/lib/alternates";
import { availableAppRoutes } from "@/lib/seo/app-routes";
import type { LlmsDoc, LlmsModel, LlmsVpsApp } from "@/lib/seo/llms-full";
import { buildLlmsFullTxt } from "@/lib/seo/llms-full";
import { pageToMarkdown } from "@/lib/seo/page-markdown";
import { SITE_URL } from "@/lib/site";
import { langOfCode } from "@/server/cms/lang";
import { getAlternates, getPage, getSiteSettings } from "@/server/cms/read";
import { getSeoPages } from "@/server/cms/seo-read";
import { getPublicCatalog } from "@/server/gateway/read";
import { getPublicVps } from "@/server/vps/read";

/**
 * /llms-full.txt : le contenu essentiel des pages PUBLIÉES en Markdown propre, généré depuis les modèles de page (ce que
 * les pages affichent), avec les faits à retenir, le catalogue de modèles et les applications VPS. Même source que le
 * sitemap : une page non publiée, `noindex` ou absente d'une langue n'y figure pas. Texte brut, revalidé à chaque
 * publication (les lectures sont mises en cache par étiquette).
 */
const CONCURRENCY = 6;

async function inChunks<T, R>(
  items: readonly T[],
  size: number,
  fn: (x: T) => Promise<R>,
) {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

export async function GET(request: Request) {
  await connection();
  const asked = new URL(request.url).searchParams.get("lang");
  const only: Lang | undefined =
    asked === "fr" || asked === "en" ? asked : undefined;
  const [pages, frSettings, enSettings, alternates, catalog, vps] =
    await Promise.all([
      getSeoPages(),
      getSiteSettings("fr"),
      getSiteSettings("en"),
      getAlternates(),
      getPublicCatalog(),
      getPublicVps(),
    ]);
  const fr = getDictionary("fr");
  const en = getDictionary("en");

  const targets = pages
    .filter((p) => !p.noindex)
    .flatMap((p) =>
      p.translations.flatMap((t) => {
        const lang = langOfCode(t.code);
        const frSlug =
          p.translations.find((x) => langOfCode(x.code) === "fr")?.slug ??
          t.slug;
        return lang && (!only || lang === only)
          ? [{ lang, slug: t.slug, frPath: frSlug === "" ? "/" : `/${frSlug}` }]
          : [];
      }),
    );
  const docs = (
    await inChunks(targets, CONCURRENCY, async (t): Promise<LlmsDoc | null> => {
      const result = await getPage(t.lang, t.slug);
      if (result.status !== "ok" || result.preview || result.page.noindex)
        return null;
      const status = getDictionary(t.lang).cms.status;
      const markdown = pageToMarkdown(result.page, {
        siteUrl: SITE_URL,
        resolveHref: (href) => resolveHrefForLang(alternates, t.lang, href),
        statusLabels: {
          disponible: status.disponible,
          "acces-anticipe": status["acces-anticipe"],
          "qualifie-localement": status["qualifie-localement"],
          "en-developpement": status["en-developpement"],
          pilote: status.pilote,
          prevu: status.prevu,
        },
      });
      return {
        lang: t.lang,
        frPath: t.frPath,
        url: `${SITE_URL}${localizePath(t.lang, t.slug === "" ? "/" : `/${t.slug}`)}`,
        title: result.page.seoTitle ?? result.page.title,
        description: result.page.seoDescription,
        markdown,
      };
    })
  ).filter((d): d is LlmsDoc => d !== null);

  const residency = (id: string): Record<Lang, string> => {
    const label = (lang: Lang) =>
      (getGatewayDictionary(lang).residency as Record<string, string>)[id] ??
      id;
    return { fr: label("fr"), en: label("en") };
  };
  const models: LlmsModel[] = catalog.models.map((m) => ({
    id: m.id,
    name: m.name,
    provider: m.providerName,
    residency: residency(m.residency),
    kind: m.kind === "embedding" ? "embedding" : "chat",
    contextMax: m.contextMax,
    // « note » non vide = prix de développement : il n'est jamais reproduit dans ce fichier.
    devPrice: m.note !== "",
    inputPerMillion: m.inputPerMillion,
    outputPerMillion: m.outputPerMillion,
  }));
  const apps: LlmsVpsApp[] = vps.apps.map((a) => ({
    name: a.name,
    tagline: { fr: a.taglineFr, en: a.taglineEn },
    minRamMb: a.minRamMb,
  }));

  const body = buildLlmsFullTxt({
    lang: only,
    siteName: fr.meta.siteName,
    siteUrl: SITE_URL,
    summary: {
      fr: frSettings?.seoDescription ?? fr.meta.home.description,
      en: enSettings?.seoDescription ?? en.meta.home.description,
    },
    pages,
    appRoutes: availableAppRoutes(),
    routeMeta: (route, lang) => route.meta(lang),
    docs,
    catalog:
      catalog.available && models.length > 0
        ? { models, publishedAt: catalog.publishedAt }
        : null,
    vps: vps.available && apps.length > 0 ? { apps } : null,
  });
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control":
        "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
