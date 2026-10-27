import "server-only";
import {
  getPublishedCatalog,
  type PublicVpsApp,
  type PublicVpsPlan,
  publicVpsCatalog,
} from "@nexora/vps";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "../db";

/** Étiquette de cache du catalogue VPS public (/vps et /vps/<application>). */
export const VPS_CATALOG_TAG = "vps-catalog";

export interface PublicVps {
  plans: PublicVpsPlan[];
  apps: PublicVpsApp[];
  version: string | null;
  publishedAt: string | null;
  /** Faux si la base ne répond pas : la page l'indique plutôt que d'afficher une erreur. */
  available: boolean;
}

/**
 * Catalogue VPS PUBLIÉ pour les pages. Seule une version publiée apparaît : sans version publiée, la
 * page affiche « offres en préparation » (aucun prix inventé). Une publication revalide l'étiquette.
 */
export async function getPublicVps(): Promise<PublicVps> {
  "use cache";
  cacheTag(VPS_CATALOG_TAG);
  try {
    const version = await getPublishedCatalog(getDb());
    cacheLife({ stale: 60, revalidate: 300, expire: 86_400 });
    if (!version)
      return {
        plans: [],
        apps: [],
        version: null,
        publishedAt: null,
        available: true,
      };
    const pub = publicVpsCatalog(version.snapshot);
    return {
      ...pub,
      version: version.short,
      publishedAt: (version.publishedAt ?? version.createdAt).toISOString(),
      available: true,
    };
  } catch {
    cacheLife({ stale: 10, revalidate: 10, expire: 60 });
    return {
      plans: [],
      apps: [],
      version: null,
      publishedAt: null,
      available: false,
    };
  }
}
