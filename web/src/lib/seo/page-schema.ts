/**
 * Type de données structurées d'une page Directus, déduit du slug fr-CA. Registre en code tant que Directus n'a pas
 * de champ dédié (proposition : `pages.schema_type`, voir docs/seo.md). Une page absente du registre n'émet que
 * ses données génériques (fil d'Ariane, FAQPage si elle a un bloc FAQ).
 */
export type PageSchemaType = "service" | "software" | "article";

const BY_SLUG: Record<string, PageSchemaType> = {
  "opsys-ai": "service",
  workstudio: "software",
  "nexora-workstudio": "software",
};
const ARTICLE_PREFIXES = ["blog/", "articles/"] as const;

export function pageSchemaType(frSlug: string): PageSchemaType | null {
  const known = BY_SLUG[frSlug];
  if (known) return known;
  if (ARTICLE_PREFIXES.some((p) => frSlug.startsWith(p))) return "article";
  return null;
}
