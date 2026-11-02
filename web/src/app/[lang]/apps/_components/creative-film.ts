import type { Lang } from "@/i18n/config";
import type { MediaRef, PageModel } from "@/server/cms/model";
import { getPage } from "@/server/cms/read";

/** Le film de Nexora Creative et son affiche, tels que les sert Directus. */
export type CreativeFilm = { media: MediaRef; poster: MediaRef | null };

/** Ancre de la carte Creative de l'accueil : son fichier (par langue, `media_lang`) et son affiche font foi pour la fiche. */
export const CREATIVE_ANCHOR = "creative";

/** Le film de la section d'ancre `creative` de la page, ou null si elle n'a pas de vidéo (jamais de lecteur cassé). */
export function pickCreativeFilm(page: PageModel): CreativeFilm | null {
  for (const block of page.blocks) {
    if (block.type !== "section" || block.anchorId !== CREATIVE_ANCHOR)
      continue;
    if (block.media?.kind !== "video") return null;
    return {
      media: block.media,
      poster: block.poster?.kind === "image" ? block.poster : null,
    };
  }
  return null;
}

/**
 * Le film de la fiche `/apps/creative`, lu dans Directus comme celui de la carte d'accueil : une seule source, une
 * version par langue. Si l'accueil est illisible ou n'a pas le fichier, la fiche s'affiche sans lecteur.
 */
export async function getCreativeFilm(
  lang: Lang,
): Promise<CreativeFilm | null> {
  const result = await getPage(lang, "");
  return result.status === "ok" ? pickCreativeFilm(result.page) : null;
}
