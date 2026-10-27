import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { loadWithFallback } from "./resilient";
import { readerClient, snapshotStore } from "./runtime";
import { fetchSeoPages, type SeoPage } from "./seo-pages";
import { SLUGS_TAG } from "./tags";

/**
 * Pages publiées pour le sitemap, llms.txt et les images Open Graph. Même étiquette `slugs` que la table des
 * correspondances : une publication la revalide. Panne de Directus : dernière version connue ; sinon liste vide
 * (le sitemap n'invente rien).
 */
export async function getSeoPages(): Promise<SeoPage[]> {
  "use cache";
  cacheTag(SLUGS_TAG);
  try {
    const loaded = await loadWithFallback(snapshotStore(), "seo-pages", () =>
      fetchSeoPages(readerClient()),
    );
    if (loaded.source === "fresh")
      cacheLife({ stale: 60, revalidate: 300, expire: 2_592_000 });
    else cacheLife({ stale: 30, revalidate: 10, expire: 600 });
    return loaded.value ?? [];
  } catch {
    cacheLife({ stale: 30, revalidate: 10, expire: 600 });
    return [];
  }
}
