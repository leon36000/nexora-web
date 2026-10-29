import "server-only";
import { appRouteExists } from "@/lib/seo/app-routes";

let cached: boolean | undefined;

/**
 * La page publique `/apps` (Nexora Apps) existe-t-elle dans ce déploiement ? Elle est construite à part : tant
 * qu'elle n'est pas là, la navigation annonce « Bientôt » au lieu de proposer un lien mort.
 */
export function appsPageAvailable(): boolean {
  if (process.env.NODE_ENV !== "production") return appRouteExists("apps");
  cached ??= appRouteExists("apps");
  return cached;
}
