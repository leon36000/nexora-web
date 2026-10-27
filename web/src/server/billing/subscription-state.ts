import { SUBSCRIPTION_STATUSES, type SubscriptionStatus } from "@nexora/db";

/**
 * Machine à états des abonnements (miroir local de Stripe Billing, jalon S4).
 *
 * États (= statuts Stripe, enregistrés tels quels) :
 *
 *   incomplete ──invoice.paid──────────────▶ active
 *   incomplete ──expire (Stripe)───────────▶ incomplete_expired        (terminal)
 *   trialing   ──fin d'essai (Stripe)──────▶ active
 *   active     ──invoice.payment_failed────▶ past_due   (ouvre la grâce : graceDays)
 *   past_due   ──invoice.paid──────────────▶ active     (efface la grâce)
 *   past_due   ──relances épuisées (Stripe)▶ unpaid ou canceled
 *   unpaid     ──invoice.paid──────────────▶ active
 *   *          ──customer.subscription.deleted▶ canceled                (terminal)
 *
 * Règles :
 * - `canceled` et `incomplete_expired` sont terminaux : aucun événement tardif ne les réactive.
 * - Une relance échouée ne prolonge pas la grâce (la fin de grâce est fixée à la première défaillance).
 * - Un événement dont `created` est antérieur au dernier événement appliqué est ignoré
 *   (Stripe ne garantit pas l'ordre de livraison).
 * - `customer.subscription.updated` fait foi sur le statut ; `invoice.*` sert d'accélérateur.
 *
 * Niveau d'accès dérivé (`accessLevel`) : full (active, trialing), grace (past_due avant la fin de
 * grâce), suspended (past_due après la grâce, unpaid, paused), none (le reste). C'est ce niveau
 * que le provisionnement VPS (S6) consultera pour suspendre un service.
 */
export interface SubState {
  status: SubscriptionStatus;
  graceEndsAt: Date | null;
  canceledAt: Date | null;
  /** `created` (secondes Unix) du dernier événement appliqué. */
  lastEventCreated: number;
}

export type SubEvent =
  | { type: "invoice_paid"; created: number }
  | { type: "invoice_payment_failed"; created: number }
  | { type: "subscription_updated"; created: number; stripeStatus: string }
  | { type: "subscription_deleted"; created: number };

export interface TransitionContext {
  graceDays: number;
  now: Date;
}

const TERMINAL = new Set<SubscriptionStatus>([
  "canceled",
  "incomplete_expired",
]);

function isStatus(value: string): value is SubscriptionStatus {
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}

function graceFrom(ctx: TransitionContext): Date {
  return new Date(ctx.now.getTime() + ctx.graceDays * 86_400_000);
}

export function applySubscriptionEvent(
  state: SubState,
  event: SubEvent,
  ctx: TransitionContext,
): SubState {
  if (event.type === "subscription_updated" && !isStatus(event.stripeStatus))
    throw new Error("statut d'abonnement Stripe inconnu");
  if (event.created < state.lastEventCreated) return state;
  const stamped = { ...state, lastEventCreated: event.created };

  switch (event.type) {
    case "subscription_deleted":
      return {
        ...stamped,
        status: "canceled",
        graceEndsAt: null,
        canceledAt: state.canceledAt ?? ctx.now,
      };

    case "invoice_paid":
      if (TERMINAL.has(state.status) || state.status === "trialing")
        return stamped;
      return { ...stamped, status: "active", graceEndsAt: null };

    case "invoice_payment_failed":
      if (
        state.status === "active" ||
        state.status === "trialing" ||
        state.status === "paused"
      )
        return {
          ...stamped,
          status: "past_due",
          graceEndsAt: state.graceEndsAt ?? graceFrom(ctx),
        };
      // incomplete (premier paiement), past_due (relance), unpaid, états terminaux : inchangés.
      return stamped;

    case "subscription_updated": {
      if (TERMINAL.has(state.status)) return stamped;
      const status = event.stripeStatus as SubscriptionStatus;
      if (status === "canceled")
        return {
          ...stamped,
          status,
          graceEndsAt: null,
          canceledAt: state.canceledAt ?? ctx.now,
        };
      if (status === "past_due")
        return {
          ...stamped,
          status,
          graceEndsAt: state.graceEndsAt ?? graceFrom(ctx),
        };
      return { ...stamped, status, graceEndsAt: null };
    }
  }
}

export type AccessLevel = "full" | "grace" | "suspended" | "none";

export function accessLevel(state: SubState, now: Date): AccessLevel {
  switch (state.status) {
    case "active":
    case "trialing":
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
