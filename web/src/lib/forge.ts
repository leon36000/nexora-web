/**
 * La forge de dépôts de code de Nexora : GitLab aujourd'hui, Gitspace demain.
 *
 * TEMPORAIRE. Quand Gitspace sera terminé, il suffit de changer ce fichier : `label` (« Gitspace »), `defaultUrl`
 * et `temporary: false`. Le panneau `/compte` et le bouton de la page `/gitspace` lisent tous les deux cette
 * configuration ; aucun texte ne la répète.
 *
 * L'adresse se règle sans reconstruire l'image : variable d'environnement `GITSPACE_FORGE_URL` (lue au rendu par
 * le serveur), documentée dans `deploy/` et `docs/guide-operateur.md`. Le GitLab privé du fondateur n'est joignable
 * que sur le réseau privé (tailnet).
 */
export const FORGE = {
  /** Nom affiché. */
  label: "GitLab",
  /** Adresse par défaut : le GitLab privé de l'équipe (réseau privé seulement). */
  defaultUrl: "https://pc4.tail0c55ff.ts.net",
  /** Vrai tant que Gitspace n'a pas remplacé GitLab : affiche la mention « temporaire ». */
  temporary: true,
} as const;

/** Adresse de la forge : variable d'environnement si elle est une adresse https valide, sinon l'adresse par défaut. */
export function forgeUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const raw = (
    env.GITSPACE_FORGE_URL ??
    env.NEXT_PUBLIC_GITSPACE_FORGE_URL ??
    ""
  ).trim();
  try {
    const u = new URL(raw);
    if (u.protocol === "https:" || u.protocol === "http:") return u.toString();
  } catch {
    // adresse absente ou invalide : l'adresse par défaut
  }
  return FORGE.defaultUrl;
}
