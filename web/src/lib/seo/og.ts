import type { Lang } from "@/i18n/config";

export const OG_SIZE = { width: 1200, height: 630 } as const;

/**
 * Chemin de l'image Open Graph dynamique d'une page : `/og/<lang>/<chemin neutre>`. Le texte vient de la page
 * elle-même (route /og), jamais de l'appelant. L'accueil : `/og/<lang>`.
 */
export function ogPath(lang: Lang, neutralPath: string): string {
  const clean = neutralPath.replace(/^\/+|\/+$/g, "");
  return clean === "" ? `/og/${lang}` : `/og/${lang}/${clean}`;
}

export function ogImage(lang: Lang, neutralPath: string, alt: string) {
  return { url: ogPath(lang, neutralPath), ...OG_SIZE, alt };
}
