import {
  type AccessLevel,
  accessLevel,
  type SubscriptionStatus,
  type VpsInstanceStatus,
  type VpsOrderStatus,
} from "@nexora/db";

/**
 * Règles du cycle de vie d'un VPS face à son abonnement (D7). Fonctions pures : la lecture de
 * la base et les appels à Proxmox sont faits ailleurs.
 *
 * Le délai de grâce vient de la machine à états des abonnements (S4) : `accessLevel`.
 *   active/trialing  → full      : le service tourne
 *   past_due (grâce) → grace     : le service tourne encore
 *   past_due (échu), unpaid, paused → suspended : le service est SUSPENDU (VM arrêtée, données gardées)
 *   canceled         → résiliation : VM arrêtée, rétention (7 jours par défaut), puis suppression
 */
export type LifecycleDecision =
  | { kind: "noop" }
  | { kind: "suspend" }
  | { kind: "resume" }
  | { kind: "terminate" }
  | { kind: "delete" };

export interface LifecycleInput {
  instance: { status: VpsInstanceStatus; retentionEndsAt: Date | null };
  subscription: {
    status: SubscriptionStatus;
    graceEndsAt: Date | null;
  } | null;
  now: Date;
}

const LIVE_FOR_TERMINATION: readonly VpsInstanceStatus[] = [
  "provisioning",
  "active",
  "suspended",
  "reinstalling",
];

export function decideLifecycle(input: LifecycleInput): LifecycleDecision {
  const { instance, subscription, now } = input;
  if (instance.status === "deleted" || instance.status === "failed")
    return { kind: "noop" };
  if (instance.status === "canceled") {
    // La suppression ne dépend que de la date de rétention enregistrée à la résiliation.
    return instance.retentionEndsAt && instance.retentionEndsAt <= now
      ? { kind: "delete" }
      : { kind: "noop" };
  }
  if (!subscription) return { kind: "noop" };
  if (
    subscription.status === "canceled" &&
    LIVE_FOR_TERMINATION.includes(instance.status)
  )
    return { kind: "terminate" };

  const access = accessLevel(subscription, now);
  if (instance.status === "active" && access === "suspended")
    return { kind: "suspend" };
  if (
    instance.status === "suspended" &&
    (access === "full" || access === "grace")
  )
    return { kind: "resume" };
  return { kind: "noop" };
}

/** Date de suppression d'une VM résiliée : `days` jours après la résiliation. */
export function retentionEnd(from: Date, days: number): Date {
  if (!Number.isInteger(days) || days < 0)
    throw new Error("durée de rétention : entier positif ou nul attendu");
  return new Date(from.getTime() + days * 86_400_000);
}

/**
 * Ce que le paiement confirmé d'un abonnement fait d'une commande.
 *   provision : commande en attente ou payée → on provisionne (une seule fois, clé de tâche fixe)
 *   resume    : commande EXPIRÉE (ou déjà en attente d'une décision) mais payée → on la reprend si une
 *               capacité est disponible, sinon l'opérateur est alerté (jamais de remboursement automatique)
 *   wait      : rien à faire
 */
export type OrderPaymentAction = "provision" | "resume" | "wait";

export function orderPaymentAction(
  orderStatus: VpsOrderStatus,
  access: AccessLevel,
): OrderPaymentAction {
  const paying = access === "full" || access === "grace";
  if (orderStatus === "awaiting_payment" || orderStatus === "paid")
    return paying ? "provision" : "wait";
  if (orderStatus === "expired" || orderStatus === "late_payment")
    return paying ? "resume" : "wait";
  return "wait";
}
