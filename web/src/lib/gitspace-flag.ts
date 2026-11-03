/**
 * Gitspace est masqué du site public et du panneau tant qu'il n'est pas construit, testé et conforme aux attentes
 * (décision du fondateur, 3 novembre 2026). Un seul indicateur le rétablit : `GITSPACE_VISIBLE=true`.
 *
 * Ce que l'indicateur commande : la page `/gitspace` (404 sinon), sa redirection `/gitspace/depots`, la fiche
 * `/apps/gitspace` et sa carte, les entrées de `llms.txt` et du plan du site, et l'entrée « Dépôts de code » du panneau
 * `/compte` (qui garde `lib/forge.ts`). Le contenu Directus de la page `gitspace` est archivé, jamais supprimé :
 * rétablissement dans `docs/guide-operateur.md` (« Rétablir Gitspace »).
 *
 * Par défaut, tout est masqué. L'indicateur se lit à chaque appel (les pages `/apps` prérendues lisent sa valeur à la
 * construction de l'image).
 */
export function gitspaceVisible(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.GITSPACE_VISIBLE?.trim().toLowerCase() === "true";
}
