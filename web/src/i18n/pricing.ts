import type { Lang } from "./config";
import { pricingEnCA } from "./dictionaries/pricing-en-CA";
import { type PricingDictionary, pricingFrCA } from "./dictionaries/pricing-fr-CA";

export type { PricingDictionary };

const dictionaries: Record<Lang, PricingDictionary> = {
  fr: pricingFrCA,
  en: pricingEnCA,
};

/** Dictionnaire de la page Tarifs. */
export function getPricingDictionary(lang: Lang): PricingDictionary {
  return dictionaries[lang];
}
