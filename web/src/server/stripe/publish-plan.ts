import { createHash } from "node:crypto";
import type Stripe from "stripe";
import type { SubscriptionPlan } from "../billing/plans";

/** Erreur de validation d'un plan avant tout appel à Stripe. */
export class PublishPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishPlanError";
  }
}

export interface PublishPlanResult {
  stripeProductId: string;
  stripePriceId: string;
  productCreated: boolean;
  priceCreated: boolean;
  previousPriceArchived: boolean;
}

const short = (...parts: Array<string | number>) =>
  createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 12);

/**
 * « Publier vers Stripe » (D3, §11) : crée ou met à jour le produit et le prix d'un plan
 * PUBLIÉ dans Directus, puis renvoie leurs identifiants (à écrire dans la fiche du plan).
 *
 * - Un prix absent, nul ou non entier bloque la publication (jamais 0 $).
 * - Un prix Stripe est immuable : si le montant, la période, la devise ou le produit changent, un
 *   nouveau prix est créé et l'ancien est archivé (les abonnés existants le gardent).
 * - Les créations portent une clé d'idempotence dérivée du contenu : relancer l'action n'en
 *   duplique pas ; un changement de contenu donne une autre clé.
 * - Les prix sont hors taxes (`tax_behavior: exclusive`) : Stripe Tax ajoute TPS et TVQ.
 */
export async function publishPlanToStripe(
  stripe: Pick<Stripe, "products" | "prices">,
  plan: SubscriptionPlan,
): Promise<PublishPlanResult> {
  if (!Number.isSafeInteger(plan.priceCents) || plan.priceCents <= 0)
    throw new PublishPlanError("prix absent ou nul : publication refusée");
  if (plan.interval !== "month" && plan.interval !== "year")
    throw new PublishPlanError("période de facturation inconnue");

  const tr = plan.translations["fr-CA"] ?? Object.values(plan.translations)[0];
  const name = tr?.name || plan.code;
  const description = tr?.description || undefined;
  const metadata = { plan_code: plan.code, plan_id: plan.id };

  let productId = plan.stripeProductId;
  let productCreated = false;
  if (productId) {
    await stripe.products.update(productId, {
      name,
      ...(description ? { description } : {}),
      metadata,
      active: true,
    });
  } else {
    const product = await stripe.products.create(
      { name, ...(description ? { description } : {}), metadata },
      {
        idempotencyKey: `plan-product:${plan.code}:${short(name, description ?? "")}`,
      },
    );
    productId = product.id;
    productCreated = true;
  }

  let priceId = plan.stripePriceId;
  let priceCreated = false;
  let archived = false;
  if (priceId) {
    const existing = await stripe.prices.retrieve(priceId);
    const same =
      existing &&
      existing.active === true &&
      existing.unit_amount === plan.priceCents &&
      existing.currency === "cad" &&
      existing.recurring?.interval === plan.interval &&
      (typeof existing.product === "string"
        ? existing.product
        : existing.product?.id) === productId;
    if (!same) {
      await stripe.prices.update(priceId, { active: false });
      archived = true;
      priceId = null;
    }
  }
  if (!priceId) {
    const price = await stripe.prices.create(
      {
        product: productId,
        currency: "cad",
        unit_amount: plan.priceCents,
        recurring: { interval: plan.interval },
        tax_behavior: "exclusive",
        metadata,
      },
      {
        idempotencyKey: `plan-price:${plan.code}:${productId}:${plan.interval}:${plan.priceCents}`,
      },
    );
    priceId = price.id;
    priceCreated = true;
  }
  return {
    stripeProductId: productId,
    stripePriceId: priceId,
    productCreated,
    priceCreated,
    previousPriceArchived: archived,
  };
}
