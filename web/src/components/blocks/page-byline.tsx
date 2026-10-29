import { fmt } from "@/i18n/account";
import type { Lang } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { bylineDates } from "@/lib/byline";
import type { SeoDates } from "@/lib/seo/cms-jsonld";

/**
 * Ligne de signature d'un guide : auteur (l'entreprise, la même Organization que dans la donnée structurée), date de
 * publication et date de mise à jour RÉELLES (Directus). Ce que la page montre est exactement ce que `Article` déclare.
 * Rien ne s'affiche sans date : jamais de date inventée.
 */
export function PageByline({
  lang,
  dates,
  siteName,
  t,
}: {
  lang: Lang;
  dates: SeoDates | null;
  siteName: string;
  t: Dictionary["cms"]["byline"];
}) {
  const { published, updated } = bylineDates(dates, lang);
  if (!published && !updated) return null;
  return (
    <div className="theme-light border-b border-line bg-bg text-fg">
      <p className="mx-auto flex w-full max-w-page flex-wrap gap-x-5 gap-y-1 px-gutter py-3 font-mono text-label uppercase text-fg-muted">
        <span>{fmt(t.by, { name: siteName })}</span>
        {published ? (
          <span>
            {t.published}{" "}
            <time dateTime={published.iso}>{published.label}</time>
          </span>
        ) : null}
        {updated ? (
          <span>
            {t.updated} <time dateTime={updated.iso}>{updated.label}</time>
          </span>
        ) : null}
      </p>
    </div>
  );
}
