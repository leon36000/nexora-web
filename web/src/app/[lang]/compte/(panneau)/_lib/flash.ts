import { type AccountDictionary, fmt, formatCad } from "@/i18n/account";
import type { Lang } from "@/i18n/config";
import type { BillingConfig } from "@/server/ledger/config";

export type Flash = {
  kind: "success" | "info" | "error";
  message: string;
} | null;

export type Search = Record<string, string | string[] | undefined>;

export const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

/**
 * Message de retour d'un paiement ou d'une erreur de facturation, lu dans l'adresse (`?achat=ok`, `?erreur=…`,
 * `?offert=…`). Les routes `/api/billing/*` redirigent toutes vers `/compte` : l'aperçu l'affiche.
 */
export function flashFromSearch(
  lang: Lang,
  t: AccountDictionary,
  q: Search,
  config: BillingConfig,
): Flash {
  const errors = t.dashboard.alerts.errors as Record<string, string>;
  const promoErrors = t.promo.errors as Record<string, string>;
  const errorCode = first(q.erreur);
  if (errorCode)
    return {
      kind: "error",
      message: errorCode.startsWith("promo_")
        ? (promoErrors[errorCode.slice("promo_".length)] ??
          errors.internal_error ??
          "")
        : fmt(errors[errorCode] ?? errors.internal_error ?? "", {
            min: formatCad(lang, config.minPurchaseCents),
            max: formatCad(lang, config.maxPurchaseCents),
          }),
    };
  const gifted = first(q.offert);
  if (gifted === "abonnement" || gifted === "credits" || gifted === "vps")
    return {
      kind: "success",
      message:
        gifted === "abonnement"
          ? t.promo.gifted.subscription
          : gifted === "vps"
            ? t.promo.gifted.vps
            : t.promo.gifted.credits,
    };
  if (first(q.achat) === "ok")
    return { kind: "success", message: t.dashboard.alerts.purchaseOk };
  if (first(q.achat) === "annule")
    return { kind: "info", message: t.dashboard.alerts.purchaseCancelled };
  if (first(q.abonnement) === "ok")
    return { kind: "success", message: t.dashboard.alerts.subscriptionOk };
  if (first(q.abonnement) === "annule")
    return { kind: "info", message: t.dashboard.alerts.subscriptionCancelled };
  return null;
}
