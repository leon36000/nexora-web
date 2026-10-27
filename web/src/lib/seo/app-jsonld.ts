import { type Lang, localizePath } from "@/i18n/config";
import { SITE_URL } from "@/lib/site";
import { HOME_CRUMB } from "./cms-jsonld";
import { breadcrumbJsonLd } from "./jsonld";

/** Fil d'Ariane d'une route de l'application : Accueil > ...trail (chemins neutres, sans préfixe de langue). */
export function appBreadcrumb(
  lang: Lang,
  trail: readonly { name: string; path: string }[],
) {
  return breadcrumbJsonLd([
    { name: HOME_CRUMB[lang], url: `${SITE_URL}${localizePath(lang, "/")}` },
    ...trail.map((t) => ({
      name: t.name,
      url: `${SITE_URL}${localizePath(lang, t.path)}`,
    })),
  ]);
}
