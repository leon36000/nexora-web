import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { CmsPage } from "@/components/blocks/cms-page";
import { Unavailable } from "@/components/blocks/unavailable";
import { isLang } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { notFoundMetadata } from "@/lib/metadata";
import { normalizeSlug } from "@/lib/safe-href";
import { buildCmsMetadata } from "@/lib/seo";
import {
  getPage,
  getSiteSettings,
  listPublishedSlugs,
} from "@/server/cms/read";

/**
 * Pages publiées connues au moment du build ; les autres se rendent à la demande puis restent en cache.
 * Cache Components exige au moins une valeur : `opsys-ai` (page phare) sert d'échantillon si Directus est muet.
 */
export async function generateStaticParams() {
  const lang = await getLang();
  const slugs = isLang(lang) ? await listPublishedSlugs(lang) : [];
  const list = slugs.length > 0 ? slugs : ["opsys-ai"];
  return list.map((slug) => ({ slug: slug.split("/") }));
}

export async function generateMetadata(
  props: PageProps<"/[lang]/[...slug]">,
): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const slug = normalizeSlug((await props.params).slug);
  if (slug === null) return notFoundMetadata(lang);
  const result = await getPage(lang, slug);
  if (result.status === "not-found") return notFoundMetadata(lang);
  if (result.status === "unavailable")
    return { robots: { index: false, follow: false } };
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
 * Route générique des pages Directus (opsys-ai, souveraineté…). Une page absente, non publiée ou sans
 * traduction dans la langue demandée donne le 404 localisé, rendu dans la mise en page (en-tête, pied de page).
 */
export default async function CmsRoutePage(
  props: PageProps<"/[lang]/[...slug]">,
) {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const slug = normalizeSlug((await props.params).slug);
  if (slug === null) notFound();
  const result = await getPage(lang, slug);
  if (result.status === "not-found") notFound();
  if (result.status === "unavailable")
    return <Unavailable lang={lang} t={getDictionary(lang).cms.unavailable} />;
  return <CmsPage lang={lang} page={result.page} preview={result.preview} />;
}
