import { connection } from "next/server";
import { getDictionary } from "@/i18n/get-dictionary";
import { availableAppRoutes } from "@/lib/seo/app-routes";
import { buildLlmsTxt } from "@/lib/seo/llms";
import { SITE_URL } from "@/lib/site";
import { getSiteSettings } from "@/server/cms/read";
import { getSeoPages } from "@/server/cms/seo-read";

/** /llms.txt : liste des pages publiées (étiquette `slugs`, revalidée à chaque publication). Texte brut. */
export async function GET() {
  await connection();
  const [pages, frSettings, enSettings] = await Promise.all([
    getSeoPages(),
    getSiteSettings("fr"),
    getSiteSettings("en"),
  ]);
  const fr = getDictionary("fr");
  const en = getDictionary("en");
  const body = buildLlmsTxt({
    siteName: fr.meta.siteName,
    siteUrl: SITE_URL,
    summary: {
      fr: frSettings?.seoDescription ?? fr.meta.home.description,
      en: enSettings?.seoDescription ?? en.meta.home.description,
    },
    pages,
    appRoutes: availableAppRoutes(),
    routeMeta: (route, lang) => route.meta(lang),
  });
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control":
        "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
