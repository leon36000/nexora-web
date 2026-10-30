import { SITE_URL } from "@/lib/site";

/**
 * Messages d'erreur « plus de crédits » (API de la passerelle, WorkStudio intégré…), en français, avec le chemin vers
 * la recharge et vers l'abonnement. Aucun prix n'y figure : les prix sont publiés (ou non) par la page Tarifs.
 * Règle d'accès : un solde de crédits supérieur à zéro (abonnement OU recharge) suffit ; voir `entitlements.ts`.
 */
export const RECHARGE_PATH = "/compte/facturation#ajouter-des-fonds";
export const PLANS_PATH = "/tarifs";

export const rechargeUrl = () => `${SITE_URL}${RECHARGE_PATH}`;
export const plansUrl = () => `${SITE_URL}${PLANS_PATH}`;

const HOW = () =>
  `Rechargez votre compte (${rechargeUrl()}) ou choisissez un abonnement (${plansUrl()}) pour continuer.`;

/** Solde à zéro (moins d'un crédit). */
export const noCreditsMessage = () =>
  `Il ne vous reste plus de crédits. ${HOW()}`;

/** Des crédits restent, mais la requête (coût maximal estimé) en demande plus. */
export const notEnoughCreditsMessage = () =>
  `Il ne vous reste pas assez de crédits pour cette requête. ${HOW()}`;

/** Solde négatif (remboursement ou litige). */
export const blockedMessage = () =>
  `Le compte est bloqué parce que son solde est négatif. Rechargez votre compte (${rechargeUrl()}) pour reprendre.`;
