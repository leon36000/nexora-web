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

/**
 * Routes de l'application dont l'adresse diffère d'une langue à l'autre. Le chemin NEUTRE (clé) est celui du
 * dossier `src/app/[lang]/…` ; `localizePath` produit l'adresse publique de la langue, `stripLangPrefix` retrouve
 * le chemin neutre, et `proxy.ts` réécrit l'adresse anglaise vers la route (puis redirige l'ancienne adresse).
 */
export const LOCALIZED_ROUTES: Readonly<Record<string, Partial<Record<Lang, string>>>> = {
  "/tarifs": { en: "/pricing" },
};

/** `/solutions` -> `/solutions` (fr) ou `/en/solutions` (en). `/` -> `/` ou `/en`. `/tarifs` -> `/en/pricing`. */
export function localizePath(lang: Lang, path: string): string {
  const clean = path === "/" ? "" : path.replace(/\/+$/, "");
  if (lang === DEFAULT_LANG) return clean === "" ? "/" : clean;
  return `/en${LOCALIZED_ROUTES[clean]?.[lang] ?? clean}`;
}

/** Retire un préfixe de langue éventuel (`/en/x`, `/fr/x`) et renvoie le chemin neutre (`/en/pricing` -> `/tarifs`). */
export function stripLangPrefix(pathname: string): string {
  const match = pathname.match(/^\/(fr|en)(?=\/|$)(.*)$/);
  if (!match) return pathname || "/";
  const rest = match[2] === "" ? "/" : (match[2] as string);
  if (match[1] === "en")
    for (const [neutral, byLang] of Object.entries(LOCALIZED_ROUTES))
      if (byLang.en === rest) return neutral;
  return rest;
}
