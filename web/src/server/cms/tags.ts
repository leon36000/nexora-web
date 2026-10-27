import type { LangCode } from "./lang";

/** Étiquettes de cache Next (`cacheTag` / `revalidateTag`). Une seule source pour la lecture et la revalidation. */
export const LANG_CODES: readonly LangCode[] = ["fr-CA", "en-CA"];

/** Une page, quelle que soit la langue : `page:<collection>:<id>` (Directus envoie collection = pages). */
export const pageIdTag = (id: string) => `page:pages:${id}`;
/** Résultat d'une recherche par slug (utile aussi quand la page n'existait pas encore : 404 mis en cache). */
export const pageSlugTag = (code: LangCode, slug: string) =>
  `page-slug:${code}:${slug}`;
export const NAV_TAG = "nav";
export const SITE_TAG = "site";
/** Table de correspondance des slugs entre langues : change dès qu'une page est publiée, renommée ou dépubliée. */
export const SLUGS_TAG = "slugs";
