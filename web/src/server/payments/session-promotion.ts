import type Stripe from "stripe";

/**
 * Code de promotion Stripe appliqué à une session de paiement (code saisi sur la page de Stripe, donc sans
 * métadonnée de notre côté). Sert aux statistiques seulement ; `null` s'il n'y en a pas.
 */
export async function resolveSessionPromotion(
  stripe: Pick<Stripe, "checkout">,
  sessionId: string,
): Promise<string | null> {
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["total_details.breakdown"],
  });
  const discounts = session.total_details?.breakdown?.discounts ?? [];
  for (const d of discounts) {
    const promo = d.discount?.promotion_code;
    if (typeof promo === "string") return promo;
    if (promo && typeof promo === "object" && "id" in promo) return promo.id;
  }
  return null;
}
