import { log } from "@/server/log";
import type { SnapshotStore } from "./snapshots";

export type Loaded<T> = {
  /** `null` : le contenu n'existe pas (ou n'est pas publié). */
  value: T | null;
  /** "stale" : Directus est en panne, c'est la dernière version connue. */
  source: "fresh" | "stale";
};

/**
 * Lit un contenu dans Directus ; si Directus est en panne (ou répond n'importe quoi), sert
 * la dernière version connue au lieu de planter ou de rendre une page vide.
 *
 * - un contenu lu avec succès devient le nouvel instantané ;
 * - un contenu ABSENT (non publié, supprimé) efface l'instantané : une page dépubliée
 *   volontairement ne doit pas revenir pendant une panne ;
 * - sans instantané, l'erreur d'origine est relancée (à l'appelant de choisir le repli).
 */
export async function loadWithFallback<T>(
  store: SnapshotStore,
  key: string,
  fetcher: () => Promise<T | null>,
): Promise<Loaded<T>> {
  try {
    const value = await fetcher();
    if (value === null) store.delete(key);
    else store.set(key, value);
    return { value, source: "fresh" };
  } catch (error) {
    const snapshot = store.get<T>(key);
    if (snapshot !== undefined) {
      log.warn("cms : Directus indisponible, dernière version connue servie", {
        key,
        error,
      });
      return { value: snapshot, source: "stale" };
    }
    log.error("cms : Directus indisponible et aucun instantané", {
      key,
      error,
    });
    throw error;
  }
}
