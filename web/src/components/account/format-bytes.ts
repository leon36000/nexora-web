import type { Lang } from "@/i18n/config";

/** Module à part, sans dépendance serveur : les composants client (état de Nexora Code) le chargent aussi. */
const locale = (lang: Lang) => (lang === "fr" ? "fr-CA" : "en-CA");

const BYTE_UNITS = {
  fr: ["o", "Ko", "Mo", "Go", "To"],
  en: ["B", "KB", "MB", "GB", "TB"],
} as const;

/**
 * Octets en forme lisible, en unités décimales (1 Go = 1 000 000 000 octets, la définition du quota d'espace) :
 * « 250 Mo », « 1,5 Go ». Une décimale sous 100, aucune au-delà ; l'espace insécable colle le nombre à l'unité.
 */
export function formatBytes(lang: Lang, bytes: number): string {
  const units = BYTE_UNITS[lang];
  let value = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  let i = 0;
  while (value >= 1000 && i < units.length - 1) {
    value /= 1000;
    i += 1;
  }
  const digits = i > 0 && value < 100 ? 1 : 0;
  const text = new Intl.NumberFormat(locale(lang), {
    maximumFractionDigits: digits,
  }).format(value);
  return `${text} ${units[i]}`;
}
