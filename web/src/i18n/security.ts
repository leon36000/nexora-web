import type { Lang } from "./config";
import { securityEnCA } from "./dictionaries/security-en-CA";
import {
  type SecurityDictionary,
  securityFrCA,
} from "./dictionaries/security-fr-CA";

export type { SecurityDictionary };

const dictionaries: Record<Lang, SecurityDictionary> = {
  fr: securityFrCA,
  en: securityEnCA,
};

export function getSecurityDictionary(lang: Lang): SecurityDictionary {
  return dictionaries[lang];
}
