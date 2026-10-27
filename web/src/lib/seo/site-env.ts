/**
 * Le site n'est indexable que si `SITE_ENV=production` EXACTEMENT. Toute autre valeur, ou l'absence de la variable,
 * donne un site non indexable (défaut sûr : oublier la variable en préproduction ne livre jamais la préproduction
 * aux moteurs ; l'oublier en production se voit tout de suite et se corrige).
 */
export function isIndexableEnvironment(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.SITE_ENV === "production";
}

/** En-tête posé sur toutes les pages d'un environnement non indexable. */
export const NOINDEX_HEADER = "noindex, nofollow";
