import { LANGS, type Lang, localizePath } from "@/i18n/config";
import { langOfCode } from "@/server/cms/lang";
import type { SeoPage } from "@/server/cms/seo-pages";
import type { AppRoute } from "./app-routes";

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

const HEADING: Record<Lang, string> = {
  fr: "Français (fr-CA)",
  en: "English (en-CA)",
};

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * `llms.txt` (llmstxt.org) généré depuis les pages PUBLIÉES et les routes de l'application : un titre, un résumé, puis
 * une liste de liens par langue. Texte brut, sans promesse : Google a indiqué ne pas utiliser ce fichier ; il sert aux
 * outils qui le lisent, rien de plus. Les pages `noindex` n'y figurent pas.
 */
export function buildLlmsTxt(input: LlmsInput): string {
  const lines: string[] = [`# ${input.siteName}`, ""];
  lines.push(`> ${oneLine(input.summary.fr)}`, "");
  for (const lang of LANGS) {
    const items: string[] = [];
    const link = (title: string, path: string, description: string | null) =>
      items.push(
        `- [${oneLine(title).replace(/[[\]]/g, "")}](${input.siteUrl}${localizePath(lang, path)})${
          description ? `: ${oneLine(description)}` : ""
        }`,
      );
    const sorted = [...input.pages].sort((a, b) =>
      (a.translations.find((t) => langOfCode(t.code) === lang)?.slug ?? "") <
      (b.translations.find((t) => langOfCode(t.code) === lang)?.slug ?? "")
        ? -1
        : 1,
    );
    for (const page of sorted) {
      if (page.noindex) continue;
      const t = page.translations.find((x) => langOfCode(x.code) === lang);
      if (!t) continue;
      link(t.title, t.slug === "" ? "/" : `/${t.slug}`, t.seoDescription);
    }
    for (const route of input.appRoutes) {
      const meta = input.routeMeta(route, lang);
      if (meta)
        link(
          meta.title.replace(new RegExp(`\\s*\\|\\s*${input.siteName}$`), ""),
          route.path,
          meta.description,
        );
    }
    if (items.length === 0) continue;
    lines.push(`## ${HEADING[lang]}`, "", ...items, "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
