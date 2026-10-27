import type { Database } from "@nexora/db";
import type Stripe from "stripe";
import { type Lang, localizePath } from "@/i18n/config";
import type { BillingConfig } from "../ledger/config";
import {
  type CheckoutDeps,
  CheckoutError,
  ensureStripeCustomer,
} from "./checkout";

export interface VpsCheckoutInput {
  organizationId: string;
  orderId: string;
  /** Prix Stripe de la durée choisie, tiré de la version de catalogue publiée « appliquée ». */
  priceId: string;
  catalogVersion: string;
  lang: Lang;
  email?: string;
}

const STRIPE_LOCALE: Record<Lang, "fr-CA" | "en"> = { fr: "fr-CA", en: "en" };

/**
 * Abonnement VPS : Checkout en mode `subscription`, prix hors taxes (Stripe Tax ajoute TPS et TVQ),
 * adresse de facturation exigée. La clé d'idempotence dérivée de la commande renvoie la même session
 * si le formulaire est renvoyé. `vps_order_id` voyage dans les métadonnées de la session ET de
 * l'abonnement : les factures et événements d'abonnement retrouvent la commande.
 */
export async function createVpsCheckout(
  deps: {
    db: Database;
    stripe: CheckoutDeps["stripe"];
    config: BillingConfig;
    siteUrl: string;
  },
  input: VpsCheckoutInput,
): Promise<{ url: string; sessionId: string }> {
  try {
    const customer = await ensureStripeCustomer(
      {
        db: deps.db,
        stripe: deps.stripe,
        config: deps.config,
        siteUrl: deps.siteUrl,
      },
      input.organizationId,
      input.email,
    );
    const meta = {
      kind: "vps",
      organization_id: input.organizationId,
      vps_order_id: input.orderId,
    };
    const session = await deps.stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer,
        client_reference_id: input.organizationId,
        locale: STRIPE_LOCALE[input.lang],
        line_items: [{ price: input.priceId, quantity: 1 }],
        automatic_tax: { enabled: true },
        billing_address_collection: "required",
        customer_update: { address: "auto", name: "auto" },
        tax_id_collection: { enabled: true },
        metadata: { ...meta, config_version: input.catalogVersion },
        subscription_data: { metadata: meta },
        success_url: `${deps.siteUrl}${localizePath(input.lang, "/compte/vps")}?commande=ok&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${deps.siteUrl}${localizePath(input.lang, "/vps")}?commande=annulee`,
      } satisfies Stripe.Checkout.SessionCreateParams,
      { idempotencyKey: `vps-checkout:${input.orderId}` },
    );
    if (!session.url)
      throw new CheckoutError("stripe_error", "session sans adresse");
    return { url: session.url, sessionId: session.id };
  } catch (error) {
    if (error instanceof CheckoutError) throw error;
    const type =
      typeof error === "object" && error && "type" in error
        ? String((error as { type: unknown }).type)
        : "unknown";
    throw new CheckoutError(
      "stripe_error",
      `Stripe a refusé la requête (${type})`,
    );
  }
}
