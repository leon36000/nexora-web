import { LANGS, type Lang, localizePath } from "@/i18n/config";
import { langOfCode } from "@/server/cms/lang";
import type { SeoPage } from "@/server/cms/seo-pages";
import type { AppRoute } from "./app-routes";
import { type ResolvedFact, resolveFacts } from "./entity";

export type LlmsInput = {
  siteName: string;
  siteUrl: string;
  /** Résumé du site, par langue : texte déjà publié (réglages ou dictionnaire), jamais écrit pour l'occasion. */
  summary: Record<Lang, string>;
  pages: readonly SeoPage[];
  appRoutes: readonly AppRoute[];
  routeMeta: (
    route: AppRoute,
    lang: Lang,
  ) => { title: string; description: string | null } | null;
};

export const LANG_TAG: Record<Lang, string> = { fr: "fr-CA", en: "en-CA" };

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------------------------------------------------------
// Thèmes du plan du site
// ---------------------------------------------------------------------------------------------------------------
export type SectionKey =
  | "main"
  | "solutions"
  | "services"
  | "trust"
  | "guides"
  | "company"
  | "optional";

export const SECTION_ORDER: readonly SectionKey[] = [
  "main",
  "solutions",
  "services",
  "trust",
  "guides",
  "company",
  "optional",
];

const SECTION_TITLE: Record<SectionKey, Record<Lang, string>> = {
  main: { fr: "Produits et API", en: "Products and API" },
  solutions: { fr: "Solutions", en: "Solutions" },
  services: { fr: "Services et déploiement", en: "Services and deployment" },
  trust: { fr: "Souveraineté et données", en: "Sovereignty and data" },
  guides: { fr: "Guides", en: "Guides" },
  company: { fr: "Entreprise et aide", en: "Company and help" },
  // « Optional » : mot-clé de la convention llmstxt.org (sections que le lecteur peut sauter).
  optional: { fr: "Optional", en: "Optional" },
};

const FACTS_TITLE: Record<Lang, string> = {
  fr: "Faits à retenir",
  en: "Key facts",
};

const MAIN_HEADS = new Set([
  "workstudio",
  "nexora-workstudio",
  "opsys-ai",
  "suite",
  "vision",
  "croissance",
  "passerelle-api-modeles",
  "modeles",
  "docs",
  "vps",
  "agents",
  "tarifs",
]);

/** Ordre des produits dans la section « Produits et API » ; le reste suit, par chemin. */
const MAIN_RANK: readonly string[] = [
  "workstudio",
  "opsys-ai",
  "modeles",
  "passerelle-api-modeles",
  "docs/api",
  "vps",
  "tarifs",
  "agents",
  "suite",
  "croissance",
  "vision",
];

const trimPath = (path: string) => path.replace(/^\/+|\/+$/g, "");

/** Thème d'une PAGE du CMS d'après son chemin neutre français. Une page inconnue va à « Optional ». */
export function sectionOf(frPath: string): SectionKey {
  const p = trimPath(frPath);
  const head = p.split("/")[0] ?? "";
  if (p === "") return "company";
  if (MAIN_HEADS.has(head)) return "main";
  if (head === "solutions") return "solutions";
  if (["services", "deploiement", "methode"].includes(head)) return "services";
  if (["souverainete", "vos-donnees", "centre-de-confiance"].includes(head))
    return "trust";
  if (["guides", "blog", "articles"].includes(head)) return "guides";
  if (["entreprise", "faq", "contact"].includes(head)) return "company";
  return "optional";
}

/** Clé de tri : thème, rang du produit, puis chemin. Stable et indépendante de l'ordre de lecture de Directus. */
export function orderKey(frPath: string, section = sectionOf(frPath)): string {
  const p = trimPath(frPath);
  const rank = MAIN_RANK.indexOf(p);
  return `${SECTION_ORDER.indexOf(section)}|${String(rank === -1 ? 99 : rank).padStart(2, "0")}|${p}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Pages publiées, par langue
// ---------------------------------------------------------------------------------------------------------------
export interface LlmsEntry {
  /** Chemin neutre français, clé commune aux deux langues. */
  frPath: string;
  section: SectionKey;
  title: string;
  description: string | null;
  url: string;
  /** Page du CMS (`page`) ou route de l'application (`app`). */
  origin: "page" | "app";
}

/**
 * Pages publiées et indexables dans une langue : pages Directus non `noindex` qui existent dans la langue, puis routes
 * de l'application qui ont un titre dans les dictionnaires. Triées par thème. Même source que le sitemap.
 */
export function llmsEntries(input: LlmsInput, lang: Lang): LlmsEntry[] {
  const out: LlmsEntry[] = [];
  const abs = (path: string) => `${input.siteUrl}${localizePath(lang, path)}`;
  for (const page of input.pages) {
    if (page.noindex) continue;
    const t = page.translations.find((x) => langOfCode(x.code) === lang);
    if (!t) continue;
    const fr = page.translations.find((x) => langOfCode(x.code) === "fr");
    const frSlug = (fr ?? t).slug;
    const frPath = frSlug === "" ? "/" : `/${frSlug}`;
    out.push({
      frPath,
      section: sectionOf(frPath),
      title: oneLine(t.seoTitle ?? t.title),
      description: t.seoDescription ? oneLine(t.seoDescription) : null,
      url: abs(t.slug === "" ? "/" : `/${t.slug}`),
      origin: "page",
    });
  }
  for (const route of input.appRoutes) {
    const meta = input.routeMeta(route, lang);
    if (!meta) continue;
    out.push({
      frPath: route.path,
      section: route.path === "/contact" ? "company" : "main",
      title: oneLine(
        meta.title.replace(
          new RegExp(
            `\\s*\\|\\s*${input.siteName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          ),
          "",
        ),
      ),
      description: meta.description ? oneLine(meta.description) : null,
      url: abs(route.path),
      origin: "app",
    });
  }
  return out.sort((a, b) => {
    const ka = orderKey(a.frPath, a.section);
    const kb = orderKey(b.frPath, b.section);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

/** Adresse absolue, dans une langue, de la page publiée qui porte un chemin neutre français ; `null` si elle n'existe pas. */
export function buildLocator(
  input: LlmsInput,
): (frPath: string, lang: Lang) => string | null {
  const index = new Map<string, string>();
  for (const lang of LANGS)
    for (const e of llmsEntries(input, lang))
      index.set(`${lang}|${e.frPath}`, e.url);
  return (frPath, lang) => index.get(`${lang}|${frPath}`) ?? null;
}

/** Faits canoniques disponibles dans une langue (pages publiées seulement). */
export function factsFor(input: LlmsInput, lang: Lang): ResolvedFact[] {
  return resolveFacts(lang, buildLocator(input));
}

export function factLines(facts: readonly ResolvedFact[]): string[] {
  return facts.map((f) => `- ${oneLine(f.text)} (${f.url})`);
}

/** En-tête commun de llms.txt et llms-full.txt : titre, résumé dans les deux langues, et l'explication du fichier. */
export function llmsHeader(input: LlmsInput): string[] {
  return [
    `# ${input.siteName}`,
    "",
    `> ${oneLine(input.summary.fr)}`,
    "",
    `English (en-CA): ${oneLine(input.summary.en)}`,
    "",
    `Le site existe en français (fr-CA, langue première) et en anglais (en-CA). Ce fichier donne d'abord les faits à retenir, puis le plan du site, en français puis en anglais. The site exists in French (fr-CA, primary) and English (en-CA). This file gives the key facts first, then the site map, in French then English. Contenu complet des pages en Markdown / full page content in Markdown: ${input.siteUrl}/llms-full.txt (français seulement / French only: ?lang=fr ; English only: ?lang=en)`,
    "",
  ];
}

/**
 * `llms.txt` (llmstxt.org) généré depuis les pages PUBLIÉES et les routes de l'application : un titre, un résumé, des
 * faits à retenir (phrases courtes rattachées au registre d'affirmations, avec l'adresse de la page), puis des listes de
 * liens par thème et par langue. Texte brut déterministe, sans promesse : Google a indiqué ne pas utiliser ce fichier ;
 * il sert aux outils qui le lisent, rien de plus. Les pages `noindex` n'y figurent pas.
 */
export function buildLlmsTxt(input: LlmsInput): string {
  const lines = llmsHeader(input);
  for (const lang of LANGS) {
    const tag = LANG_TAG[lang];
    const facts = factLines(factsFor(input, lang));
    if (facts.length > 0)
      lines.push(`## ${FACTS_TITLE[lang]} (${tag})`, "", ...facts, "");
    const entries = llmsEntries(input, lang);
    for (const section of SECTION_ORDER) {
      const items = entries
        .filter((e) => e.section === section)
        .map(
          (e) =>
            `- [${e.title.replace(/[[\]]/g, "")}](${e.url})${e.description ? `: ${e.description}` : ""}`,
        );
      if (items.length === 0) continue;
      lines.push(
        `## ${SECTION_TITLE[section][lang]} (${tag})`,
        "",
        ...items,
        "",
      );
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export const sectionTitle = (section: SectionKey, lang: Lang) =>
  SECTION_TITLE[section][lang];
export const factsTitle = (lang: Lang) => FACTS_TITLE[lang];
