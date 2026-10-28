/** Profil `cacheLife` d'une page du CMS (secondes). */
export interface PageCacheLife {
  stale: number;
  revalidate: number;
  expire: number;
}

/**
 * Durée de cache d'une page lue dans Directus.
 *
 * - Page trouvée et lue en direct : longue durée (30 jours d'expiration, revalidation en arrière-plan).
 * - Adresse INCONNUE : 5 minutes au plus. Chaque adresse inventée (`/a1`, `/a2`…) crée sinon une entrée de cache gardée 30
 *   jours et coûte une requête à Directus ; avec une durée courte les entrées s'éteignent d'elles-mêmes (la publication
 *   d'une nouvelle page invalide de toute façon l'étiquette de son adresse). Pas moins de 5 minutes : Next tient un cache
 *   qui expire plus tôt pour « court », l'exclut du prérendu, et la page répond alors 500 au lieu de 404.
 * - Instantané (Directus en panne) : réessai rapide, trouvée ou non.
 */
export function pageCacheLife(input: {
  source: "fresh" | "stale";
  found: boolean;
}): PageCacheLife {
  if (input.source === "stale")
    return { stale: 30, revalidate: 10, expire: 600 };
  if (!input.found) return { stale: 30, revalidate: 120, expire: 300 };
  return { stale: 60, revalidate: 300, expire: 2_592_000 };
}
