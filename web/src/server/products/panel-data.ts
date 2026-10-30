import { STORAGE_PRODUCTS, type StorageProduct } from "@nexora/db";
import type { OrgEntitlements } from "../billing/entitlements";
import type { AccessLevel } from "../billing/subscription-state";
import type { ProductId, ResolvedProduct } from "./registry";

/**
 * Vues du panneau « Mes outils » : fonctions pures qui transforment les droits de l'organisation
 * (`getOrgEntitlements`, contrat du chantier A) en ce que la page affiche. Aucun accès à la base ni au réseau, aucun
 * texte : les composants lisent les dictionnaires.
 */

/** Seuil de l'avertissement d'espace, en pour cent du quota (décision 5 de la conception du 30/10/2026). */
export const STORAGE_WARNING_PERCENT = 80;

export type StorageLevel = "none" | "ok" | "warning" | "full" | "house";

export type StorageView = {
  level: StorageLevel;
  /** Quota de l'offre + Go supplémentaires, en octets. */
  totalBytes: number;
  usedBytes: number;
  /** 0 à 100, arrondi vers le bas : 100 seulement quand l'espace est vraiment plein. */
  percent: number;
  remainingBytes: number;
  /** Produits qui occupent de l'espace, du plus gros au plus petit ; part du quota total (0 à 100). */
  products: {
    product: StorageProduct;
    bytes: number;
    percentOfTotal: number;
  }[];
};

const clampPercent = (part: number, total: number): number =>
  total <= 0 || part <= 0
    ? 0
    : part >= total
      ? 100
      : Math.floor((part * 100) / total);

/**
 * Espace de l'organisation : barre globale, niveau d'alerte et ventilation par produit. L'organisation « maison »
 * (`house`) n'a pas de limite : on montre l'usage sans pourcentage ni alerte (le contrat n'a pas de champ « maison »).
 */
export function storageView(
  storage: OrgEntitlements["storage"],
  house: boolean,
): StorageView {
  const totalBytes = storage.quotaBytes + storage.extraBytes;
  const { usedBytes } = storage;
  const products = STORAGE_PRODUCTS.map((product) => ({
    product,
    bytes: storage.byProduct[product] ?? 0,
  }))
    .filter((p) => p.bytes > 0)
    // Tri stable : à taille égale, l'ordre du contrat.
    .sort((a, b) => b.bytes - a.bytes)
    .map((p) => ({
      ...p,
      percentOfTotal: house ? 0 : clampPercent(p.bytes, totalBytes),
    }));
  const base = {
    totalBytes,
    usedBytes,
    remainingBytes: Math.max(0, totalBytes - usedBytes),
    products,
  };
  if (house) return { ...base, level: "house", percent: 0 };
  if (totalBytes <= 0)
    return {
      ...base,
      level: usedBytes > 0 ? "full" : "none",
      percent: usedBytes > 0 ? 100 : 0,
    };
  const percent = clampPercent(usedBytes, totalBytes);
  const level: StorageLevel =
    usedBytes >= totalBytes
      ? "full"
      : usedBytes * 100 >= totalBytes * STORAGE_WARNING_PERCENT
        ? "warning"
        : "ok";
  return { ...base, level, percent };
}

export type CreditsLevel = "ok" | "empty" | "blocked" | "free";

export type CreditsView = {
  level: CreditsLevel;
  subscription: number;
  refill: number;
  total: number;
  /** Fin de validité des crédits d'abonnement ; null quand il n'en reste pas. */
  subscriptionExpiresAt: Date | null;
  canUseModels: boolean;
};

/**
 * Crédits : abonnement et recharge séparés (jamais additionnés avant l'affichage du total). `blocked` : compte à solde
 * négatif (remboursement, litige) ; `house` : accès administrateur gratuit.
 */
export function creditsView(
  ent: OrgEntitlements,
  options: {
    house: boolean;
    blocked: boolean;
    subscriptionExpiresAt: Date | null;
  },
): CreditsView {
  const { subscription, refill, total } = ent.credits;
  const level: CreditsLevel = options.house
    ? "free"
    : options.blocked
      ? "blocked"
      : total < 1
        ? "empty"
        : "ok";
  return {
    level,
    subscription,
    refill,
    total,
    subscriptionExpiresAt:
      subscription > 0 ? options.subscriptionExpiresAt : null,
    canUseModels: ent.canUseModels,
  };
}

export type PlanView =
  | { kind: "none" }
  | {
      kind: "active";
      /** Code de l'offre sans le suffixe « -annuel » (le rythme est dans `interval`). */
      code: string;
      interval: "month" | "year" | null;
      /** Prochaine échéance de l'abonnement ; null si inconnue. */
      renewsAt: Date | null;
      /** Résiliation demandée : l'offre prend fin à `renewsAt`. */
      ending: boolean;
      /** Paiement en retard, accès gardé jusqu'à `graceEndsAt`. */
      pastDue: boolean;
      graceEndsAt: Date | null;
    };

type PlanSubscription = {
  planCode: string | null;
  access: AccessLevel;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  graceEndsAt: Date | null;
};

/** Offre en cours de l'organisation, pour la carte « Mon offre » (ou « Aucun abonnement »). */
export function planView(
  ent: OrgEntitlements,
  subscriptions: readonly PlanSubscription[],
): PlanView {
  if (!ent.planCode) return { kind: "none" };
  const entitled = subscriptions.filter(
    (s) => s.planCode !== null && (s.access === "full" || s.access === "grace"),
  );
  const sub =
    entitled.find((s) => s.planCode === ent.planCode) ?? entitled[0] ?? null;
  return {
    kind: "active",
    code: ent.planCode.replace(/-annuel$/, ""),
    interval: ent.interval,
    renewsAt: sub?.currentPeriodEnd ?? null,
    ending: sub?.cancelAtPeriodEnd ?? false,
    pastDue: sub?.access === "grace",
    graceEndsAt: sub?.access === "grace" ? sub.graceEndsAt : null,
  };
}

export type ProductHint = {
  /** Le produit appelle des modèles et il ne reste aucun crédit. */
  needsCredits: boolean;
  /** Le produit écrit chez Nexora et il n'y a pas (ou plus) d'espace. */
  needsStorage: boolean;
};

/**
 * Ce qui manque à chaque produit pour servir : des crédits (s'il appelle des modèles) ou de l'espace (s'il en occupe).
 * Un simple rappel sur la carte, pas un blocage : le service qui refuse l'écriture ou l'appel reste la règle.
 * L'organisation « maison » ne manque de rien.
 */
export function productHints(
  products: readonly ResolvedProduct[],
  ent: OrgEntitlements,
  options: { free: boolean },
): Partial<Record<ProductId, ProductHint>> {
  const noSpace =
    storageView(ent.storage, false).level === "none" ||
    storageView(ent.storage, false).level === "full";
  return Object.fromEntries(
    products.map((p) => [
      p.id,
      {
        needsCredits: !options.free && p.consumesCredits && !ent.canUseModels,
        needsStorage: !options.free && p.storage !== null && noSpace,
      } satisfies ProductHint,
    ]),
  );
}
