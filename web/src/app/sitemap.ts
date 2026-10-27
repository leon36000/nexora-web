import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { availableAppRoutes } from "@/lib/seo/app-routes";
import { buildSitemap } from "@/lib/seo/sitemap";
import { SITE_URL } from "@/lib/site";
import { getSeoPages } from "@/server/cms/seo-read";
import { getPublicCatalog } from "@/server/gateway/read";
import { getPublicVps } from "@/server/vps/read";

/**
 * /sitemap.xml : pages publiées de Directus + routes de l'application + fiches de modèles publiées.
 * Rendu à la demande (les données viennent de lectures en cache revalidées par étiquette) : une publication
 * apparaît au passage suivant, sans reconstruction.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const [pages, catalog, vps] = await Promise.all([
    getSeoPages(),
    getPublicCatalog(),
    getPublicVps(),
  ]);
  return buildSitemap({
    siteUrl: SITE_URL,
    pages,
    appRoutes: availableAppRoutes(),
    modelIds: catalog.models.map((m) => m.id),
    catalogPublishedAt: catalog.publishedAt,
    vpsAppCodes: vps.apps.map((a) => a.code),
    vpsPublishedAt: vps.publishedAt,
  });
}
