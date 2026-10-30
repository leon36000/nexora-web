import type { Lang } from "@/i18n/config";
import { formatMicroDecimal } from "@/server/gateway/activity-csv";

/**
 * Mise en forme des montants, parts et durées du panneau client. Les montants (micro-CAD, `bigint`) passent par
 * un décimal exact en texte : `Intl.NumberFormat` lit alors les chiffres tels quels, sans conversion en flottant.
 */

const locale = (lang: Lang) => (lang === "fr" ? "fr-CA" : "en-CA");

/** Fuseau du journal et des jours de l'activité (comme le tableau d'usage existant). */
export const PANEL_TIME_ZONE = "America/Toronto";

/** Montant du grand livre : au moins 2 décimales, jusqu'à 4 pour les petits coûts. */
export function formatMicroCadExact(lang: Lang, micro: bigint): string {
  return new Intl.NumberFormat(locale(lang), {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
    // Le décimal en texte garde tous ses chiffres (NumberFormat v3) ; ce n'est pas un Number.
  }).format(formatMicroDecimal(micro) as `${number}`);
}

/** Part de `part` dans `total`, en pour cent au centième près, calculée en entiers et bornée à 0–100. */
export function sharePercent(part: bigint, total: bigint): number {
  if (total <= 0n || part <= 0n) return 0;
  if (part >= total) return 100;
  return Number((part * 10_000n) / total) / 100;
}

export function formatLatency(lang: Lang, ms: number): string {
  const nbsp = "\u00a0";
  return ms < 1000
    ? `${new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 0 }).format(ms)}${nbsp}ms`
    : `${new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 1 }).format(ms / 1000)}${nbsp}s`;
}

/** « 2026-10-29 11:04:05 » à l'heure de Montréal : même forme en français et en anglais, sans ambiguïté. */
export function formatDateTime(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZone: PANEL_TIME_ZONE,
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

/** Jour AAAA-MM-JJ (déjà au fuseau de Montréal) en texte court : « 29 oct. » / « Oct 29 ». */
export function formatDayLabel(lang: Lang, day: string): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale(lang), {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Jetons en forme courte : « 5 M », « 1,2 M », « 850 k » ; entiers sous 1 000 (nombre exact, jamais arrondi à 0). */
export function formatTokensCompact(lang: Lang, tokens: number): string {
  const nbsp = "\u00a0";
  const n = (value: number, digits: number) =>
    new Intl.NumberFormat(locale(lang), {
      maximumFractionDigits: digits,
    }).format(value);
  if (tokens >= 1_000_000) return `${n(tokens / 1_000_000, 1)}${nbsp}M`;
  if (tokens >= 1_000) return `${n(tokens / 1_000, 0)}${nbsp}k`;
  return n(tokens, 0);
}

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
