import { Button } from "@/components/ui/button";
import type { Lang } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { PreviewInfo } from "@/server/cms/model";

/**
 * Bandeau « Aperçu — non publié », fixé en bas de l'écran. Quitter l'aperçu = POST /api/preview/exit
 * (formulaire natif, aucun JavaScript requis).
 */
export function PreviewBanner({
  lang,
  path,
  preview,
  t,
}: {
  lang: Lang;
  path: string;
  preview: PreviewInfo;
  t: Dictionary["cms"]["preview"];
}) {
  return (
    <aside
      role="status"
      className="theme-dark fixed inset-x-0 bottom-0 z-[90] border-t border-line-strong bg-bg text-fg"
    >
      <div className="mx-auto flex w-full max-w-page flex-wrap items-center gap-x-6 gap-y-3 px-gutter py-3">
        <strong className="font-mono text-label uppercase text-accent-text">
          {t.banner}
        </strong>
        <span className="text-sm text-fg-muted">
          {preview.versionKey
            ? `${t.version} ${preview.versionName ?? preview.versionKey}`
            : `${t.noVersion} (${t.pageStatus} ${preview.pageStatus})`}
        </span>
        <form method="post" action="/api/preview/exit" className="ml-auto">
          <input type="hidden" name="lang" value={lang} />
          <input type="hidden" name="path" value={path} />
          <Button type="submit" variant="secondary">
            {t.exit}
          </Button>
        </form>
      </div>
    </aside>
  );
}
