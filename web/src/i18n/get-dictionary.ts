import type { Lang } from "./config";
import { enCA } from "./dictionaries/en-CA";
import { type Dictionary, frCA } from "./dictionaries/fr-CA";

export type { Dictionary };

const dictionaries: Record<Lang, Dictionary> = {
  fr: frCA,
  en: enCA,
};

/**
 * Dictionnaire d'interface d'une langue. Synchrone : les dictionnaires sont des modules
 * TypeScript (typés, vérifiés à la compilation) et restent côté serveur ; seules les
 * chaînes utiles sont transmises en props aux composants client.
 */
export function getDictionary(lang: Lang): Dictionary {
  return dictionaries[lang];
}
