import type { Lang } from "./config";
import { gatewayEnCA } from "./dictionaries/gateway-en-CA";
import {
  type GatewayDictionary,
  gatewayFrCA,
} from "./dictionaries/gateway-fr-CA";

export type { GatewayDictionary };

const dictionaries: Record<Lang, GatewayDictionary> = {
  fr: gatewayFrCA,
  en: gatewayEnCA,
};

/** Dictionnaire de la passerelle : catalogue, fiches, documentation, clés API du compte. */
export function getGatewayDictionary(lang: Lang): GatewayDictionary {
  return dictionaries[lang];
}

/** Prix décimal exact (« 0.6 ») affiché en dollars canadiens ; le calcul reste en micro-unités entières. */
export function formatPriceCad(lang: Lang, decimal: string): string {
  const value = Number(decimal);
  const digits = decimal.split(".")[1]?.length ?? 0;
  return new Intl.NumberFormat(lang === "fr" ? "fr-CA" : "en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: Math.max(2, Math.min(digits, 4)),
    maximumFractionDigits: Math.max(2, Math.min(digits, 4)),
  }).format(value);
}

export function formatInteger(lang: Lang, n: number): string {
  return new Intl.NumberFormat(lang === "fr" ? "fr-CA" : "en-CA").format(n);
}
