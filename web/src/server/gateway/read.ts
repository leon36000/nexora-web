import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "../db";
import { getPublishedCatalog } from "./catalog";
import { CATALOG_TAG } from "./deps";
import { type PublicModel, publicModels } from "./public";

/**
 * Lecture du catalogue PUBLIÉ pour les pages (Cache Components). Une publication revalide
 * l'étiquette `model-catalog`. Si la base est indisponible, la page affiche un catalogue vide plutôt
 * qu'une erreur (et la durée de cache est courte pour réessayer vite).
 */
export interface PublicCatalog {
  models: PublicModel[];
  /** Date de publication de la version affichée (ISO), ou null. */
  publishedAt: string | null;
  version: string | null;
  available: boolean;
}

export async function getPublicCatalog(): Promise<PublicCatalog> {
  "use cache";
  cacheTag(CATALOG_TAG);
  try {
    const version = await getPublishedCatalog(getDb());
    cacheLife({ stale: 60, revalidate: 300, expire: 86_400 });
    if (!version)
      return { models: [], publishedAt: null, version: null, available: true };
    return {
      models: publicModels(version.snapshot),
      publishedAt: (version.publishedAt ?? version.createdAt).toISOString(),
      version: version.short,
      available: true,
    };
  } catch {
    cacheLife({ stale: 10, revalidate: 10, expire: 60 });
    return { models: [], publishedAt: null, version: null, available: false };
  }
}
