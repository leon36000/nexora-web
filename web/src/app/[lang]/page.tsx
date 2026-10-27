import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { CmsPage } from "@/components/blocks/cms-page";
import { HomeSkeleton } from "@/components/home/skeleton";
import { isLang } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { buildPageMetadata } from "@/lib/metadata";
import { buildCmsMetadata } from "@/lib/seo";
import { getPage, getSiteSettings } from "@/server/cms/read";

/** Métadonnées du squelette (dictionnaire), utilisées seulement si l'accueil n'est pas publié. */
function skeletonMetadata(lang: "fr" | "en"): Metadata {
  const { meta } = getDictionary(lang);
  return buildPageMetadata({
    lang,
    path: "/",
    title: meta.home.title,
    description: meta.home.description,
    siteName: meta.siteName,
  });
}

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const result = await getPage(lang, "");
  if (result.status !== "ok") return skeletonMetadata(lang);
  const settings = await getSiteSettings(lang);
  return buildCmsMetadata({
    page: result.page,
    lang,
    settings,
    siteName: getDictionary(lang).meta.siteName,
    preview: result.preview !== null,
  });
}

/**
 * Accueil : lit la page d'accueil (slug vide) dans Directus. Le squelette n'est qu'un repli, quand la page n'est
 * pas publiée ou que Directus est illisible sans instantané.
 */
export default async function HomePage() {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const result = await getPage(lang, "");
  if (result.status === "ok")
    return <CmsPage lang={lang} page={result.page} preview={result.preview} />;
  return <HomeSkeleton lang={lang} />;
}
