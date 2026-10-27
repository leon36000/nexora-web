/**
 * Configuration des langues (segments natifs de l'App Router, sans bibliothèque).
 *
 * - fr-CA est la langue par défaut et vit à la racine : `/`, `/solutions`…
 * - en-CA vit sous `/en` : `/en`, `/en/solutions`…
 * - Le segment dynamique interne `[lang]` vaut « fr » ou « en » ; `proxy.ts` réécrit
 *   les URL sans préfixe vers `/fr/…` (l'internaute ne voit jamais `/fr`).
 */
export const LANGS = ["fr", "en"] as const;
export type Lang = (typeof LANGS)[number];

export const DEFAULT_LANG: Lang = "fr";

/** Valeur de l'attribut `lang` de <html> et des balises hreflang. */
export const HTML_LANG: Record<Lang, string> = {
  fr: "fr-CA",
  en: "en-CA",
};

/** Valeur `og:locale` (format Open Graph). */
export const OG_LOCALE: Record<Lang, string> = {
  fr: "fr_CA",
  en: "en_CA",
};

export function isLang(value: string): value is Lang {
  return (LANGS as readonly string[]).includes(value);
}

/** `/solutions` -> `/solutions` (fr) ou `/en/solutions` (en). `/` -> `/` ou `/en`. */
export function localizePath(lang: Lang, path: string): string {
  const clean = path === "/" ? "" : path.replace(/\/+$/, "");
  if (lang === DEFAULT_LANG) return clean === "" ? "/" : clean;
  return `/en${clean}`;
}

/** Retire un préfixe de langue éventuel (`/en/x`, `/fr/x`) et renvoie le chemin neutre. */
export function stripLangPrefix(pathname: string): string {
  const match = pathname.match(/^\/(fr|en)(?=\/|$)(.*)$/);
  if (!match) return pathname || "/";
  return match[2] === "" ? "/" : match[2];
}
