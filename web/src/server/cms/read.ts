import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { draftMode } from "next/headers";
import type { Lang } from "@/i18n/config";
import {
  type Alternates,
  buildAlternates,
  NO_ALTERNATES,
} from "@/lib/alternates";
import { log } from "@/server/log";
import { slugKnownAbsent } from "./known-slugs";
import { langCode } from "./lang";
import type { NavItem, PageModel, PreviewInfo, SiteSettings } from "./model";
import {
  fetchPageForPreview,
  fetchPublishedPage,
  fetchPublishedSlugs,
  fetchSlugPairs,
} from "./pages";
import { loadWithFallback } from "./resilient";
import { previewClient, readerClient, snapshotStore } from "./runtime";
import { fetchNavigation, fetchSiteSettings } from "./settings";
import { NAV_TAG, pageIdTag, pageSlugTag, SITE_TAG, SLUGS_TAG } from "./tags";

/**
 * Lecture du contenu pour le rendu (Next 16, Cache Components).
 *
 * Mise en cache : `use cache` + étiquettes. Une publication revalide `page:pages:<id>` et
 * `page-slug:<langue>:<slug>` (voir server/revalidate.ts). En mode brouillon (Draft Mode), Next
 * ré-exécute ces fonctions à chaque requête et n'enregistre rien : l'aperçu n'est jamais mis en cache partagé.
 *
 * Résilience : si Directus est en panne, on sert la dernière version connue (instantané) ; la durée de cache est
 * alors très courte pour réessayer vite. Jamais de page vide : sans instantané, `unavailable`.
 */

export type PageResult =
  | {
      status: "ok";
      page: PageModel;
      preview: PreviewInfo | null;
      stale: boolean;
    }
  | { status: "not-found" }
  | { status: "unavailable" };

export async function getPage(lang: Lang, slug: string): Promise<PageResult> {
  "use cache";
  const code = langCode(lang);
  cacheTag(pageSlugTag(code, slug));
  const { isEnabled } = await draftMode();

  if (isEnabled) {
    cacheLife({ stale: 0, revalidate: 1, expire: 60 });
    try {
      const r = await fetchPageForPreview(previewClient(), code, slug);
      if (!r) return { status: "not-found" };
      return { status: "ok", page: r.page, preview: r.preview, stale: false };
    } catch (error) {
      log.error("cms : aperçu impossible", { slug, lang, error });
      return { status: "unavailable" };
    }
  }

  try {
    const loaded = await loadWithFallback(
      snapshotStore(),
      `page:${code}:${slug}`,
      () => fetchPublishedPage(readerClient(), code, slug),
    );
    if (loaded.value) cacheTag(pageIdTag(loaded.value.id));
    if (loaded.source === "fresh")
      cacheLife({ stale: 60, revalidate: 300, expire: 2_592_000 });
    else cacheLife({ stale: 30, revalidate: 10, expire: 600 });
    return loaded.value
      ? {
          status: "ok",
          page: loaded.value,
          preview: null,
          stale: loaded.source === "stale",
        }
      : { status: "not-found" };
  } catch {
    cacheLife({ stale: 30, revalidate: 10, expire: 600 });
    // Directus illisible et pas d'instantané de cette page : si elle ne figure pas dans la dernière liste connue des
    // pages publiées, c'est une adresse inconnue (404), pas une page à réessayer.
    return slugKnownAbsent(snapshotStore(), code, slug)
      ? { status: "not-found" }
      : { status: "unavailable" };
  }
}

export async function getSiteSettings(
  lang: Lang,
): Promise<SiteSettings | null> {
  "use cache";
  cacheTag(SITE_TAG);
  const code = langCode(lang);
  try {
    const loaded = await loadWithFallback(snapshotStore(), `site:${code}`, () =>
      fetchSiteSettings(readerClient(), code),
    );
    if (loaded.source === "fresh")
      cacheLife({ stale: 300, revalidate: 900, expire: 2_592_000 });
    else cacheLife({ stale: 30, revalidate: 10, expire: 600 });
    return loaded.value;
  } catch {
    cacheLife({ stale: 30, revalidate: 10, expire: 600 });
    return null;
  }
}

export async function getNavigation(lang: Lang): Promise<NavItem[]> {
  "use cache";
  cacheTag(NAV_TAG);
  const code = langCode(lang);
  try {
    const loaded = await loadWithFallback(snapshotStore(), `nav:${code}`, () =>
      fetchNavigation(readerClient(), code),
    );
    if (loaded.source === "fresh")
      cacheLife({ stale: 300, revalidate: 900, expire: 2_592_000 });
    else cacheLife({ stale: 30, revalidate: 10, expire: 600 });
    return loaded.value ?? [];
  } catch {
    cacheLife({ stale: 30, revalidate: 10, expire: 600 });
    return [];
  }
}

/**
 * Table de correspondance des slugs fr-CA ↔ en-CA des pages publiées (sélecteur de langue, liens de navigation).
 * Vide si Directus est illisible et sans instantané : le sélecteur garde alors le même chemin dans l'autre langue.
 */
export async function getAlternates(): Promise<Alternates> {
  "use cache";
  cacheTag(SLUGS_TAG);
  try {
    const loaded = await loadWithFallback(snapshotStore(), "slug-pairs", () =>
      fetchSlugPairs(readerClient()),
    );
    if (loaded.source === "fresh")
      cacheLife({ stale: 60, revalidate: 300, expire: 2_592_000 });
    else cacheLife({ stale: 30, revalidate: 10, expire: 600 });
    return buildAlternates(loaded.value ?? []);
  } catch {
    cacheLife({ stale: 30, revalidate: 10, expire: 600 });
    return NO_ALTERNATES;
  }
}

/** Slugs publiés pour la langue demandée (hors accueil) : `generateStaticParams`. Jamais d'exception. */
export async function listPublishedSlugs(lang: Lang): Promise<string[]> {
  const code = langCode(lang);
  try {
    const loaded = await loadWithFallback(snapshotStore(), "slugs", () =>
      fetchPublishedSlugs(readerClient()),
    );
    return (loaded.value ?? [])
      .filter((s) => s.code === code)
      .map((s) => s.slug);
  } catch {
    return [];
  }
}
