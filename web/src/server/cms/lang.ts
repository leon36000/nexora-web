import { HTML_LANG, type Lang } from "@/i18n/config";

/** Codes de langue de Directus (table `languages`). */
export type LangCode = "fr-CA" | "en-CA";

export function langCode(lang: Lang): LangCode {
  return HTML_LANG[lang] as LangCode;
}

export function langOfCode(code: string): Lang | null {
  if (code === "fr-CA") return "fr";
  if (code === "en-CA") return "en";
  return null;
}
