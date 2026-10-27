import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentsDictionary } from "@/i18n/agents";
import type { Lang } from "@/i18n/config";
import { getGatewayDictionary } from "@/i18n/gateway";
import { getPricingDictionary } from "@/i18n/pricing";
import { getDictionary } from "@/i18n/get-dictionary";
import { getVpsDictionary } from "@/i18n/vps";

/**
 * Routes de l'APPLICATION (pas des pages Directus) à lister dans le sitemap et llms.txt. Une route n'y entre que si
 * elle existe vraiment dans ce déploiement : `/vps` apparaît seul quand le jalon VPS est fusionné.
 *
 * Aucun texte n'est écrit ici pour une route inconnue : sans titre dans les dictionnaires, la route est listée dans
 * le sitemap mais pas dans llms.txt, et son image Open Graph retombe sur le nom du site.
 */
export type AppRoute = {
  /** Chemin neutre (sans préfixe de langue). */
  path: string;
  /** Dossier sous `src/app/[lang]/` qui porte la page. */
  dir: string;
  /** Daté par la publication du catalogue de modèles (/modeles) ou du catalogue VPS (/vps). */
  dated: "catalog" | "vps" | "agents" | null;
  meta: (lang: Lang) => { title: string; description: string | null } | null;
};

export const APP_ROUTES: readonly AppRoute[] = [
  {
    // Offres d'abonnement publiées (/tarifs en français, /en/pricing en anglais : voir LOCALIZED_ROUTES).
    path: "/tarifs",
    dir: "tarifs",
    dated: null,
    meta: (lang) => {
      const m = getPricingDictionary(lang).meta;
      return { title: m.title, description: m.description };
    },
  },
  {
    path: "/contact",
    dir: "contact",
    dated: null,
    meta: (lang) => {
      const m = getDictionary(lang).contact.meta;
      return { title: m.title, description: m.description };
    },
  },
  {
    path: "/modeles",
    dir: "modeles",
    dated: "catalog",
    meta: (lang) => {
      const m = getGatewayDictionary(lang).meta.models;
      return { title: m.title, description: m.description };
    },
  },
  {
    path: "/docs/api",
    dir: "docs/api",
    dated: null,
    meta: (lang) => {
      const m = getGatewayDictionary(lang).meta.docs;
      return { title: m.title, description: m.description };
    },
  },
  {
    // Jalon agents hébergés : listée seulement si la page existe.
    path: "/agents",
    dir: "agents",
    dated: "agents",
    meta: (lang) => {
      const m = getAgentsDictionary(lang).meta.list;
      return { title: m.title, description: m.description };
    },
  },
  {
    // Jalon VPS : listée seulement si la page existe.
    path: "/vps",
    dir: "vps",
    dated: "vps",
    meta: (lang) => {
      const m = getVpsDictionary(lang).meta.vps;
      return { title: m.title, description: m.description };
    },
  },
];

/**
 * La page existe-t-elle dans ce déploiement ? Manifeste de Next (production, y compris `standalone`), sinon le
 * fichier source (développement et build).
 */
export function appRouteExists(
  dir: string,
  cwd: string = process.cwd(),
): boolean {
  try {
    const manifest = join(cwd, ".next", "server", "app-paths-manifest.json");
    if (existsSync(manifest)) {
      const keys = Object.keys(
        JSON.parse(readFileSync(manifest, "utf8")) as Record<string, string>,
      );
      if (keys.includes(`/[lang]/${dir}/page`)) return true;
    }
  } catch {
    // manifeste illisible : on se rabat sur le fichier source
  }
  const sources = join(cwd, "src", "app", "[lang]");
  // Ni manifeste ni sources : le serveur tourne depuis un autre répertoire (`next start <dossier>`). On ne sait pas :
  // retirer les routes viderait le sitemap, llms.txt et la navigation des pages de l'application.
  if (!existsSync(sources) && !existsSync(join(cwd, ".next", "server")))
    return true;
  return existsSync(join(sources, dir, "page.tsx"));
}

export function availableAppRoutes(
  exists: (dir: string) => boolean = appRouteExists,
): AppRoute[] {
  return APP_ROUTES.filter((r) => exists(r.dir));
}
