import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { buildRobots } from "@/lib/seo/robots-policy";
import { SITE_URL } from "@/lib/site";

/** /robots.txt : politique par type de robot ; préproduction = Disallow: / (voir lib/seo/robots-policy.ts). */
export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  return buildRobots({ siteUrl: SITE_URL });
}
