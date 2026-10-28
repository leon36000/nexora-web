import { type Lang, localizePath, stripLangPrefix } from "@/i18n/config";
import { cleanSlug } from "@/lib/safe-href";
import type { SlugPair } from "@/server/cms/model";

/**
 * Table de correspondance des slugs entre langues, tirée des pages publiées de Directus.
 * `fr["souverainete"] === "sovereignty"` ; `null` : la page existe dans cette langue seulement.
 * Objet simple, sérialisable : il passe en props aux composants client (sélecteur de langue).
 */
export type Alternates = {
  fr: Record<string, string | null>;
  en: Record<string, string | null>;
};

export const NO_ALTERNATES: Alternates = { fr: {}, en: {} };

export function buildAlternates(pairs: readonly SlugPair[]): Alternates {
  const out: Alternates = { fr: {}, en: {} };
  for (const p of pairs) {
    // Un slug de Directus qui n'est pas propre est ignoré : il ne devient ni clé ni cible (`/evil.com`, `//hôte`).
    const fr = cleanSlug(p["fr-CA"]) === null ? undefined : p["fr-CA"];
    const en = cleanSlug(p["en-CA"]) === null ? undefined : p["en-CA"];
    if (fr !== undefined) out.fr[fr] = en ?? null;
    if (en !== undefined) out.en[en] = fr ?? null;
  }
  return out;
}

const other = (lang: Lang): Lang => (lang === "fr" ? "en" : "fr");

/** `/x/y/` -> `x/y` ; `/` -> `` */
const slugOf = (neutral: string) => neutral.replace(/^\/+|\/+$/g, "");

/** Chemin neutre (sans préfixe de langue) de la même page dans l'autre langue. */
export function alternatePath(
  alt: Alternates,
  from: Lang,
  neutralPath: string,
): string {
  const slug = slugOf(neutralPath);
  if (slug === "") return "/";
  const target = alt[from][slug];
  if (target === undefined) return `/${slug}`; // route de l'application ou slug identique : même chemin
  return target === null ? "/" : target === "" ? "/" : `/${target}`;
}

/**
 * Lien de navigation saisi dans Directus -> lien propre à la langue d'affichage. Un slug écrit avec celui de
 * l'autre langue est traduit (la navigation ne produit jamais de 404 pour une simple différence de slug).
 * Les liens externes, les ancres seules et les liens inconnus ne sont pas touchés (sauf barre finale et préfixe).
 */
export function resolveHrefForLang(
  alt: Alternates,
  lang: Lang,
  href: string,
): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const cut = href.search(/[?#]/);
  const path = cut === -1 ? href : href.slice(0, cut);
  const suffix = cut === -1 ? "" : href.slice(cut);
  const slug = slugOf(stripLangPrefix(path));
  if (slug === "") return `${localizePath(lang, "/")}${suffix}`;
  let target = slug;
  if (alt[lang][slug] === undefined) {
    const translated = alt[other(lang)][slug];
    if (translated) target = translated;
  }
  return `${localizePath(lang, `/${target}`)}${suffix}`;
}
