import type { Lang } from "./config";
import { modelsEnCA } from "./dictionaries/models-en-CA";
import { type ModelsDictionary, modelsFrCA } from "./dictionaries/models-fr-CA";
import { type GatewayDictionary, getGatewayDictionary } from "./gateway";

export type { ModelsDictionary };

/** Dictionnaire des pages de modèles + les libellés que la passerelle porte déjà (capacités, lieux d'hébergement). */
export type ModelsText = ModelsDictionary &
  Pick<GatewayDictionary, "capabilities" | "residency">;

const dictionaries: Record<Lang, ModelsDictionary> = {
  fr: modelsFrCA,
  en: modelsEnCA,
};
const texts = new Map<Lang, ModelsText>();

/** Dictionnaire des pages publiques de modèles (liste, fiche, comparateur, classements). */
export function getModelsDictionary(lang: Lang): ModelsText {
  let t = texts.get(lang);
  if (!t) {
    const g = getGatewayDictionary(lang);
    t = {
      ...dictionaries[lang],
      capabilities: g.capabilities,
      residency: g.residency,
    };
    texts.set(lang, t);
  }
  return t;
}

const locale = (lang: Lang) => (lang === "fr" ? "fr-CA" : "en-CA");

/** Pluriel selon la langue : `{ one, other }` du dictionnaire. */
export function plural(
  lang: Lang,
  n: number,
  forms: { one: string; other: string },
): string {
  return new Intl.PluralRules(locale(lang)).select(n) === "one"
    ? forms.one
    : forms.other;
}

/** Nombre de jetons en forme courte, arrondi vers le bas comme l'usage (« 32 k » pour 32 768) : 131072 -> « 131 k », 1048576 -> « 1 M ». */
export function formatTokensShort(lang: Lang, n: number): string {
  const num = (x: number, max: number) =>
    new Intl.NumberFormat(locale(lang), { maximumFractionDigits: max }).format(
      x,
    );
  if (n >= 1_000_000) return `${num(Math.floor(n / 100_000) / 10, 1)} M`;
  if (n >= 1_000) return `${num(Math.floor(n / 1_000), 0)} k`;
  return num(n, 0);
}

/** Date AAAA-MM-JJ en toutes lettres (jour civil, sans fuseau). */
export function formatDay(lang: Lang, day: string): string {
  return new Intl.DateTimeFormat(locale(lang), {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

/** Mois AAAA-MM en toutes lettres (« mars 2026 »). */
export function formatMonth(lang: Lang, month: string): string {
  return new Intl.DateTimeFormat(locale(lang), {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

export function formatScore(lang: Lang, n: number): string {
  return new Intl.NumberFormat(locale(lang), {
    maximumFractionDigits: 2,
  }).format(n);
}
