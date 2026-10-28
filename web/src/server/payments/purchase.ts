import {
  and,
  type Database,
  eq,
  inArray,
  ne,
  type PromoScope,
  subscriptions,
} from "@nexora/db";
import { hasDisputeRestriction } from "../billing/disputes";
import type { PlanSource, SubscriptionPlan } from "../billing/plans";
import { emailTrialConsumed } from "../billing/trial-guard";
import type { AppliedPromo } from "../stripe/checkout";
import type { PromoRow } from "./promo";
import { type PromoRejection, validatePromo } from "./promo-apply";
import type { PaymentSettings } from "./settings";

export type PromoResolution =
  | { kind: "none" }
  | { kind: "rejected"; reason: PromoRejection }
  | {
      kind: "discount";
      promo: AppliedPromo;
      row: PromoRow;
      /** Rabais de 100 % pour toujours : aucune carte n'est nécessaire. */
      noPaymentMethodNeeded: boolean;
    }
  | { kind: "gift"; promo: PromoRow };

/**
 * Code saisi dans un parcours d'achat -> ce qu'il faut en faire. Toute la décision est prise ici, côté serveur :
 * le navigateur ne fournit que le texte du code.
 */
export async function resolvePromo(
  db: Database,
  input: {
    code: string | undefined;
    scope: PromoScope;
    organizationId: string;
    userId: string;
    amountCents?: number;
    now: Date;
  },
): Promise<PromoResolution> {
  const code = input.code?.trim();
  if (!code) return { kind: "none" };
  const check = await validatePromo(db, { ...input, code });
  if (!check.ok) return { kind: "rejected", reason: check.reason };
  if (check.gift) return { kind: "gift", promo: check.promo };
  const p = check.promo;
  return {
    kind: "discount",
    row: p,
    promo: {
      promoCodeId: p.id,
      stripePromotionCodeId:
        p.kind === "trial" ? null : p.stripePromotionCodeId,
      ...(p.kind === "trial" && p.trialDays ? { trialDays: p.trialDays } : {}),
      ...(p.onePerCustomer ? { onePerCustomer: true } : {}),
    },
    noPaymentMethodNeeded: p.kind === "free" && p.duration === "forever",
  };
}

/**
 * Frais de recharge (désactivés par défaut) : en points de base avec un minimum, DÉDUITS des crédits.
 * Payer 100 $ avec 5 % donne 95 $ de crédits. Les crédits restent toujours positifs.
 */
export function creditFee(
  settings: Pick<
    PaymentSettings,
    "creditsFeeEnabled" | "creditsFeeBps" | "creditsFeeMinCents"
  >,
  amountCents: number,
): { feeCents: number; creditsCents: number } {
  if (!settings.creditsFeeEnabled)
    return { feeCents: 0, creditsCents: amountCents };
  const pct = Math.round((amountCents * settings.creditsFeeBps) / 10_000);
  const fee = Math.min(
    Math.max(pct, settings.creditsFeeMinCents),
    amountCents - 1,
  );
  return { feeCents: fee, creditsCents: amountCents - fee };
}

/**
 * Essai gratuit à appliquer au Checkout d'une offre : durée de l'offre, carte exigée selon l'offre ou le réglage
 * général. Un seul essai par organisation et par offre (toutes périodes confondues) : `undefined` si elle a déjà
 * eu un abonnement à cette offre, ou si le courriel a déjà servi à un essai de la famille (`trial-guard.ts`).
 */
export async function trialFor(
  db: Database,
  input: {
    plan: SubscriptionPlan;
    plans: PlanSource;
    organizationId: string;
    settings: Pick<PaymentSettings, "trialRequiresCard">;
    /** Courriel de la personne qui s'abonne : un courriel (normalisé) déjà servi pour un essai n'en obtient plus. */
    email?: string;
  },
): Promise<{ days: number; requireCard: boolean } | undefined> {
  const { plan } = input;
  if (plan.trialDays <= 0) return undefined;
  let codes = [plan.code];
  try {
    codes = (await input.plans.listPublished())
      .filter((p) => p.family === plan.family)
      .map((p) => p.code);
    if (!codes.includes(plan.code)) codes.push(plan.code);
  } catch {
    // Directus illisible : on se limite à l'offre elle-même.
  }
  const [prior] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.organizationId, input.organizationId),
        inArray(subscriptions.planCode, codes),
        ne(subscriptions.status, "incomplete_expired"),
        ne(subscriptions.status, "gifted"),
      ),
    )
    .limit(1);
  if (prior) return undefined;
  // Litige ouvert ou perdu : plus d'essai gratuit (voir billing/disputes.ts).
  if (await hasDisputeRestriction(db, input.organizationId)) return undefined;
  if (input.email && (await emailTrialConsumed(db, input.email, plan.family)))
    return undefined;
  const requireCard =
    plan.trialCard === "required"
      ? true
      : plan.trialCard === "not_required"
        ? false
        : input.settings.trialRequiresCard;
  return { days: plan.trialDays, requireCard };
}
