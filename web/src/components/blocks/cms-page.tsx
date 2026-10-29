import { JsonLd } from "@/components/seo/json-ld";
import type { Lang } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { isArticleLike } from "@/lib/byline";
import { buildCmsJsonLd } from "@/lib/seo/cms-jsonld";
import { SITE_URL } from "@/lib/site";
import type { PageModel, PreviewInfo } from "@/server/cms/model";
import { getSeoPages } from "@/server/cms/seo-read";
import { PageBlocks } from "./page-blocks";
import { PageByline } from "./page-byline";
import { PreviewBanner } from "./preview-banner";

/**
 * Page issue de Directus : blocs, données structurées générées par code (accueil : Organization et WebSite ;
 * autres : fil d'Ariane ; Service, SoftwareApplication, Article selon le registre ; FAQPage) et bandeau d'aperçu.
 * En aperçu, aucune donnée structurée : la page n'est pas publiée.
 */
export async function CmsPage({
  lang,
  page,
  preview,
}: {
  lang: Lang;
  page: PageModel;
  preview: PreviewInfo | null;
}) {
  const { cms, meta } = getDictionary(lang);
  const dates = preview
    ? null
    : ((await getSeoPages()).find((p) => p.id === page.id) ?? null);
  const jsonLd = preview
    ? []
    : buildCmsJsonLd({
        page,
        lang,
        siteName: meta.siteName,
        siteUrl: SITE_URL,
        dates,
      });
  // Les guides montrent ce que leur `Article` déclare : auteur, publication et mise à jour réelles.
  const frSlug =
    page.translations.find((t) => t.code === "fr-CA")?.slug ?? page.slug;
  const byline =
    !preview && page.slug !== "" && isArticleLike(frSlug) ? (
      <PageByline
        lang={lang}
        dates={dates}
        siteName={meta.siteName}
        t={cms.byline}
      />
    ) : null;
  return (
    <>
      <PageBlocks lang={lang} page={page} byline={byline} />
      {jsonLd.map((data, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: liste fixe générée à chaque rendu, sans réordonnancement
        <JsonLd key={i} data={data} />
      ))}
      {preview ? (
        <PreviewBanner
          lang={lang}
          path={page.slug === "" ? "/" : `/${page.slug}`}
          preview={preview}
          t={cms.preview}
        />
      ) : null}
    </>
  );
}
