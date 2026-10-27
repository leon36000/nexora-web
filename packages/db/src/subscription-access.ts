import type { SubscriptionStatus } from "./schema-billing.ts";

/**
 * Niveau d'accès dérivé d'un abonnement (machine à états de S4, `web/src/server/billing/
 * subscription-state.ts`) : full (active, trialing, gifted : offert par l'équipe), grace (past_due avant la fin de grâce),
 * suspended (past_due après la grâce, unpaid, paused), none (le reste).
 * Défini ici pour que le site ET le worker (provisionnement VPS, S6) lisent la même règle.
 */
export type AccessLevel = "full" | "grace" | "suspended" | "none";

export function accessLevel<
  T extends { status: SubscriptionStatus; graceEndsAt: Date | null },
>(state: T, now: Date): AccessLevel {
  switch (state.status) {
    case "active":
    case "trialing":
    case "gifted":
      return "full";
    case "past_due":
      return state.graceEndsAt && state.graceEndsAt > now
        ? "grace"
        : "suspended";
    case "unpaid":
    case "paused":
      return "suspended";
    default:
      return "none";
  }
}
