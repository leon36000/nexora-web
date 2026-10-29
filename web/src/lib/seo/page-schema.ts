/**
 * Type de données structurées d'une page Directus, déduit du slug fr-CA. Registre en code tant que Directus n'a pas
 * de champ dédié (proposition : `pages.schema_type`, voir docs/seo.md). Une page absente du registre n'émet que
 * ses données génériques (fil d'Ariane, WebPage, FAQPage si elle a un bloc FAQ).
 *
 * - `service` : pages qui décrivent ce que Nexora AI fait pour vous (services, solutions, déploiement, OPSYS-AI,
 *   passerelle). Le nom et la description viennent de la page ; aucune offre sans prix affiché.
 * - `software` : le logiciel WorkStudio.
 * - `article` : guides et billets (`guides/…`, `blog/…`, `articles/…`).
 * - `about` : la page « Entreprise » (AboutPage).
 */
export type PageSchemaType = "service" | "software" | "article" | "about";

const BY_SLUG: Record<string, PageSchemaType> = {
  "opsys-ai": "service",
  "passerelle-api-modeles": "service",
  workstudio: "software",
  "nexora-workstudio": "software",
  entreprise: "about",
  // page de synthèse des gabarits de flux de travaux (guide) ; ses fiches suivent le préfixe ci-dessous
  "gabarits-flux-de-travaux": "article",
};
/** Sections dont chaque sous-page décrit un service. */
const SERVICE_SECTIONS = ["services", "solutions", "deploiement"] as const;
const ARTICLE_PREFIXES = [
  "blog/",
  "articles/",
  "guides/",
  "gabarits-flux-de-travaux/",
] as const;

export function pageSchemaType(frSlug: string): PageSchemaType | null {
  const known = BY_SLUG[frSlug];
  if (known) return known;
  if (ARTICLE_PREFIXES.some((p) => frSlug.startsWith(p))) return "article";
  const [section] = frSlug.split("/");
  if (section && (SERVICE_SECTIONS as readonly string[]).includes(section))
    return "service";
  return null;
}

/**
 * Pages-sections qui existent vraiment : seules elles deviennent une étape du fil d'Ariane d'une sous-page (aucune
 * étape inventée). Libellés techniques de la donnée structurée, non affichés (même statut que `HOME_CRUMB`).
 * Clé = premier segment du slug fr-CA.
 */
export const SECTION_CRUMBS: Record<string, { fr: string; en: string }> = {
  solutions: { fr: "Solutions", en: "Solutions" },
  services: { fr: "Services", en: "Services" },
  deploiement: { fr: "Déploiement", en: "Deployment" },
  souverainete: { fr: "Souveraineté", en: "Sovereignty" },
  "gabarits-flux-de-travaux": {
    fr: "Gabarits de flux de travaux",
    en: "Workflow templates",
  },
};
