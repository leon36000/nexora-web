import type { Lang } from "./config";
import { accountEnCA } from "./dictionaries/account-en-CA";
import {
  type AccountDictionary,
  accountFrCA,
} from "./dictionaries/account-fr-CA";

export type { AccountDictionary };

const dictionaries: Record<Lang, AccountDictionary> = {
  fr: accountFrCA,
  en: accountEnCA,
};

/** Dictionnaire de l'espace client (connexion, inscription, tableau de bord). */
export function getAccountDictionary(lang: Lang): AccountDictionary {
  return dictionaries[lang];
}

/** Remplace les marqueurs `{nom}` d'une chaîne du dictionnaire. */
export function fmt(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/** Montant en dollars canadiens, selon la langue (« 25,00 $ » / « $25.00 »). */
export function formatCad(lang: Lang, cents: number | bigint): string {
  const value = Number(cents) / 100;
  return new Intl.NumberFormat(lang === "fr" ? "fr-CA" : "en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(value);
}

export function formatDate(lang: Lang, date: Date): string {
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-CA" : "en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Toronto",
  }).format(date);
}

/** Montant du grand livre (micro-unités CAD) : au moins 2 décimales, jusqu'à 4 pour les petits coûts. */
export function formatMicroCad(lang: Lang, micro: bigint): string {
  return new Intl.NumberFormat(lang === "fr" ? "fr-CA" : "en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(Number(micro) / 1_000_000);
}
