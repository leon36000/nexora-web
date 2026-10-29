import { SITE_NAME } from "@/lib/site";
import { type Lang, localizePath } from "./config";
import { appsEnCA } from "./dictionaries/apps-en-CA";
import { type AppsDictionary, appsFrCA } from "./dictionaries/apps-fr-CA";

export type { AppsDictionary };

/**
 * Registre de Nexora Apps : tout ce qui ne dépend pas de la langue (identifiant, état, mode d'accès, appel à
 * l'action). Les textes sont dans `dictionaries/apps-*.ts`. Une page, la carte de la liste, la route du plan du site
 * et les données structurées lisent le même registre : pour passer un outil de « Bientôt » à « Disponible », on change
 * une ligne ici et on complète sa liste « ce qui est prêt » dans les deux dictionnaires.
 */

/** État honnête d'un outil : livré, en préparation, ou prévu à une étape ultérieure. */
export const APP_STATES = ["disponible", "bientot", "plus_tard"] as const;
export type AppState = (typeof APP_STATES)[number];

/** Mode d'accès : `inclus` est réservé à Nexora Privacy Router (incluse par défaut, jamais payante). */
const APP_ACCESS = [
  "gratuit",
  "abonnement",
  "usage",
  "inclus",
  "a_definir",
] as const;
export type AppAccess = (typeof APP_ACCESS)[number];

/** Forme d'un identifiant d'adresse : minuscules, chiffres et tirets, sans tiret aux extrémités. */
export const APP_SLUG = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;

export type AppDef = {
  slug: string;
  state: AppState;
  access: AppAccess;
  /** Catégorie de l'application pour les données structurées (`SoftwareApplication`). */
  category: "BusinessApplication" | "DeveloperApplication";
  /** Liste d'attente (produit non livré) ou simple contact. */
  cta: "waitlist" | "contact";
  /** Fiches proposées en bas de page. */
  related: readonly string[];
};

export const APPS = [
  {
    slug: "code",
    state: "bientot",
    access: "gratuit",
    category: "DeveloperApplication",
    cta: "waitlist",
    related: ["rag", "privacy-router"],
  },
  {
    slug: "gitspace",
    state: "bientot",
    access: "abonnement",
    category: "DeveloperApplication",
    cta: "waitlist",
    related: ["code", "rag"],
  },
  {
    slug: "rag",
    state: "bientot",
    access: "abonnement",
    category: "DeveloperApplication",
    cta: "waitlist",
    related: ["code", "privacy-router"],
  },
  {
    slug: "webpilot",
    state: "bientot",
    access: "usage",
    category: "DeveloperApplication",
    cta: "waitlist",
    related: ["privacy-router", "code"],
  },
  {
    slug: "privacy-router",
    state: "bientot",
    access: "inclus",
    category: "BusinessApplication",
    cta: "contact",
    related: ["webpilot", "rag"],
  },
  {
    slug: "creative",
    state: "plus_tard",
    access: "a_definir",
    category: "BusinessApplication",
    cta: "waitlist",
    related: ["outils"],
  },
  {
    slug: "outils",
    state: "bientot",
    access: "gratuit",
    category: "BusinessApplication",
    cta: "waitlist",
    related: ["code", "creative"],
  },
] as const satisfies readonly AppDef[];

type AppSlug = (typeof APPS)[number]["slug"];
export type AppContent = AppsDictionary["apps"][AppSlug];

const dictionaries: Record<Lang, AppsDictionary> = {
  fr: appsFrCA,
  en: appsEnCA,
};

/** Dictionnaire de Nexora Apps : page de liste, légende des états, textes communs des fiches et contenu de chaque outil. */
export function getAppsDictionary(lang: Lang): AppsDictionary {
  return dictionaries[lang];
}

/** Entrée du registre pour un identifiant d'adresse ; `undefined` pour tout autre texte (aucune propriété héritée). */
export function findApp(slug: string): (typeof APPS)[number] | undefined {
  return APPS.find((a) => a.slug === slug);
}

/** Contenu d'un outil dans la langue demandée ; `undefined` si l'identifiant n'est pas au registre. */
export function getAppContent(
  lang: Lang,
  slug: string,
): AppContent | undefined {
  const app = findApp(slug);
  return app ? getAppsDictionary(lang).apps[app.slug] : undefined;
}

/** Chemin neutre (sans préfixe de langue) d'une fiche. */
export const appPath = (slug: string) => `/apps/${slug}`;

/** Métadonnées de la liste : titre, description (celles de la page et de `app-routes.ts`). */
export function listMeta(lang: Lang): { title: string; description: string } {
  const m = getAppsDictionary(lang).meta.list;
  return { title: m.title, description: m.description };
}

/**
 * Métadonnées d'une fiche : le titre est « Nom | Nexora AI », la description est l'accroche affichée sous le titre
 * (les données structurées et la balise décrivent exactement ce que la page montre). `null` si l'identifiant est inconnu.
 */
export function appMeta(
  lang: Lang,
  slug: string,
): { title: string; description: string } | null {
  const content = getAppContent(lang, slug);
  return content
    ? { title: `${content.name} | ${SITE_NAME}`, description: content.hook }
    : null;
}

/**
 * Lien du formulaire de contact pour la liste d'attente (ou la question) d'un outil : `?sujet=apps-<identifiant>`,
 * reconnu par le formulaire (`lib/contact-subject.ts`) qui présélectionne le besoin et préremplit le message.
 */
export function appContactHref(lang: Lang, slug: string): string {
  return `${localizePath(lang, "/contact")}?sujet=apps-${slug}`;
}
