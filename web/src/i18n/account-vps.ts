import type { Lang } from "./config";
import { accountVpsEnCA } from "./dictionaries/account-vps-en-CA";
import {
  type AccountVpsDictionary,
  accountVpsFrCA,
} from "./dictionaries/account-vps-fr-CA";

export type { AccountVpsDictionary };

const dictionaries: Record<Lang, AccountVpsDictionary> = {
  fr: accountVpsFrCA,
  en: accountVpsEnCA,
};

/** Dictionnaire de l'espace « Mes VPS » (liste, accès SSH, opérations, confirmations, journal). */
export function getAccountVpsDictionary(lang: Lang): AccountVpsDictionary {
  return dictionaries[lang];
}
