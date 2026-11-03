import type { Lang } from "@/i18n/config";
import type { PageModel, SectionBlock } from "@/server/cms/model";
import { getPage } from "@/server/cms/read";

/** Page Directus qui porte le film de `/modeles` (le catalogue lui-même n'a pas de page dans le CMS). */
export const MODELS_FILM_PAGE = "passerelle-api-modeles";

/** Ancre de la section qui porte le film (titre, phrase d'accompagnement, fichier par langue et affiche). */
export const MODELS_FILM_ANCHOR = "film";

/** La section du film, ou null si elle n'a pas de vidéo (jamais de lecteur cassé). */
export function pickModelsFilm(page: PageModel): SectionBlock | null {
  for (const block of page.blocks) {
    if (block.type !== "section" || block.anchorId !== MODELS_FILM_ANCHOR)
      continue;
    return block.media?.kind === "video" ? block : null;
  }
  return null;
}

/**
 * Le film de la bande sous le héros de `/modeles`, lu dans Directus comme celui de Creative : une version par langue,
 * son affiche et ses textes. Si la page est illisible ou n'a pas le fichier, la bande n'est simplement pas affichée.
 */
export async function getModelsFilm(lang: Lang): Promise<SectionBlock | null> {
  const result = await getPage(lang, MODELS_FILM_PAGE);
  return result.status === "ok" ? pickModelsFilm(result.page) : null;
}
