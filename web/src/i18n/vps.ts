import type { Lang } from "./config";
import { vpsEnCA } from "./dictionaries/vps-en-CA";
import { type VpsDictionary, vpsFrCA } from "./dictionaries/vps-fr-CA";

export type { VpsDictionary };

const dictionaries: Record<Lang, VpsDictionary> = {
  fr: vpsFrCA,
  en: vpsEnCA,
};

/** Dictionnaire des pages publiques VPS : plans, applications, configurateur de commande. */
export function getVpsDictionary(lang: Lang): VpsDictionary {
  return dictionaries[lang];
}
