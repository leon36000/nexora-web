import type { Lang } from "./config";
import { visualsEnCA } from "./dictionaries/visuals-en-CA";
import {
  type VisualsDictionary,
  visualsFrCA,
} from "./dictionaries/visuals-fr-CA";

export type { VisualsDictionary };

const dictionaries: Record<Lang, VisualsDictionary> = {
  fr: visualsFrCA,
  en: visualsEnCA,
};

/** Dictionnaire des illustrations et maquettes d'interface (blocs du CMS, héros, pages de l'application). */
export function getVisualsDictionary(lang: Lang): VisualsDictionary {
  return dictionaries[lang];
}
