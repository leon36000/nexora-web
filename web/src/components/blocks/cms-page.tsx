import type { Lang } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { buildFaqJsonLd, jsonLdString } from "@/lib/jsonld";
import type { PageModel, PreviewInfo } from "@/server/cms/model";
import { PageBlocks } from "./page-blocks";
import { PreviewBanner } from "./preview-banner";

/** Page issue de Directus : blocs, données structurées FAQPage (générées par code) et bandeau d'aperçu. */
export function CmsPage({
  lang,
  page,
  preview,
}: {
  lang: Lang;
  page: PageModel;
  preview: PreviewInfo | null;
}) {
  const faq = buildFaqJsonLd(page.blocks);
  const { cms } = getDictionary(lang);
  return (
    <>
      <PageBlocks lang={lang} page={page} />
      {faq ? (
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON généré par code, '<' échappé par jsonLdString
          dangerouslySetInnerHTML={{ __html: jsonLdString(faq) }}
        />
      ) : null}
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
