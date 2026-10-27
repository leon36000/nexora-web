import { billingCustomers, type Database, eq, organizations } from "@nexora/db";
import type Stripe from "stripe";
import { type Lang, localizePath } from "@/i18n/config";
import type { SubscriptionPlan } from "../billing/plans";
import { planConfigVersion } from "../billing/plans";
import { type BillingConfig, configVersion } from "../ledger/config";

export type CheckoutErrorCode =
  | "invalid_amount"
  | "plan_not_synced"
  | "no_customer"
  | "stripe_error"
  /** Client Stripe impossible à construire (secret absent du coffre, clé non test…). */
  | "stripe_unavailable";

export class CheckoutError extends Error {
  readonly code: CheckoutErrorCode;
  /** Pour `stripe_error` : type, code et paramètre fautif signalés par Stripe (jamais le message). */
  readonly detail?: { type?: string; code?: string; param?: string };
  constructor(
    code: CheckoutErrorCode,
    message: string,
    detail?: CheckoutError["detail"],
  ) {
    super(message);
    this.name = "CheckoutError";
    this.code = code;
    this.detail = detail;
  }
}

export interface CheckoutDeps {
  db: Database;
  stripe: Pick<Stripe, "customers" | "checkout" | "billingPortal">;
  config: BillingConfig;
  /** Adresse publique du site (sans barre finale). */
  siteUrl: string;
}

const STRIPE_LOCALE: Record<Lang, "fr-CA" | "en"> = { fr: "fr-CA", en: "en" };

function accountUrl(deps: CheckoutDeps, lang: Lang, query = ""): string {
  return `${deps.siteUrl}${localizePath(lang, "/compte")}${query}`;
}

/** Client Stripe de l'organisation : créé une seule fois (clé d'idempotence + lien unique en base). */
export async function ensureStripeCustomer(
  deps: CheckoutDeps,
  organizationId: string,
  email?: string,
): Promise<string> {
  const read = async () => {
    const [row] = await deps.db
      .select({ id: billingCustomers.stripeCustomerId })
      .from(billingCustomers)
      .where(eq(billingCustomers.organizationId, organizationId));
    return row?.id;
  };
  const existing = await read();
  if (existing) return existing;

  const [org] = await deps.db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  if (!org) throw new CheckoutError("no_customer", "organisation introuvable");

  const customer = await deps.stripe.customers.create(
    {
      name: org.name,
      ...(email ? { email } : {}),
      metadata: { organization_id: organizationId },
    },
    { idempotencyKey: `customer:${organizationId}` },
  );
  await deps.db
    .insert(billingCustomers)
    .values({ organizationId, stripeCustomerId: customer.id })
    .onConflictDoNothing();
  return (await read()) ?? customer.id;
}

function wrapStripe<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    if (error instanceof CheckoutError) throw error;
    // Ni message ni requête (peuvent citer des données du client) : seulement le type d'erreur.
    const type =
      typeof error === "object" && error && "type" in error
        ? String((error as { type: unknown }).type)
        : "unknown";
    throw new CheckoutError(
      "stripe_error",
      `Stripe a refusé la requête (${type})`,
    );
  });
}

/** Code promo validé par le serveur (voir `payments/promo-apply.ts`), prêt à passer au Checkout. */
export interface AppliedPromo {
  /** Identifiant de notre fiche : voyage dans les métadonnées, relu par le webhook. */
  promoCodeId: string;
  /** Code de promotion Stripe (rabais) ; `null` pour un code d'essai pur. */
  stripePromotionCodeId: string | null;
  /** Code d'essai : jours offerts (abonnements). */
  trialDays?: number;
}

/** Ce que tous les parcours d'achat partagent : code promo, champ de la page Stripe, essai sans carte. */
export interface CheckoutExtras {
  promo?: AppliedPromo;
  /** Laisser le champ « code promo » de la page Stripe quand aucun code n'est appliqué. */
  allowStripePageCodes?: boolean;
  /** Rabais de 100 % pour toujours : aucune carte n'est nécessaire. */
  noPaymentMethodNeeded?: boolean;
}

/** Remise et champ de code d'une session : `discounts` et `allow_promotion_codes` s'excluent chez Stripe. */
function discountParams(extras: CheckoutExtras) {
  const id = extras.promo?.stripePromotionCodeId;
  if (id) return { discounts: [{ promotion_code: id }] };
  if (!extras.promo && extras.allowStripePageCodes)
    return { allow_promotion_codes: true };
  return {};
}

const promoMeta = (extras: CheckoutExtras): Record<string, string> =>
  extras.promo ? { promo_code_id: extras.promo.promoCodeId } : {};

export interface CreditCheckoutInput extends CheckoutExtras {
  organizationId: string;
  /** Montant avant taxes, en cents CAD. */
  amountCents: number;
  lang: Lang;
  /** Crédits accordés (cents), nets des frais de recharge ; défaut : le montant payé. */
  creditsCents?: number;
  /** Libellé de la ligne sur la page de paiement (dictionnaire de la langue). */
  productName: string;
  /** Produit Stripe « Crédits » de la langue : permet de limiter un coupon aux crédits. */
  productId?: string;
  email?: string;
}

/**
 * Achat de crédits : paiement UNIQUE (mode `payment`), distinct des abonnements. Les taxes (TPS et
 * TVQ) sont calculées par Stripe Tax en sus du montant ; les crédits accordés valent le montant
 * avant taxes (D7). L'adresse de facturation est exigée pour le calcul des taxes.
 */
export async function createCreditCheckout(
  deps: CheckoutDeps,
  input: CreditCheckoutInput,
): Promise<{ url: string; sessionId: string }> {
  const { minPurchaseCents, maxPurchaseCents, currency } = deps.config;
  if (
    !Number.isSafeInteger(input.amountCents) ||
    input.amountCents < minPurchaseCents ||
    input.amountCents > maxPurchaseCents
  )
    throw new CheckoutError(
      "invalid_amount",
      `montant hors bornes (${minPurchaseCents} à ${maxPurchaseCents} cents)`,
    );
  const creditsCents = input.creditsCents ?? input.amountCents;
  if (
    !Number.isSafeInteger(creditsCents) ||
    creditsCents <= 0 ||
    creditsCents > input.amountCents
  )
    throw new CheckoutError(
      "invalid_amount",
      "les crédits accordés ne peuvent pas dépasser le montant payé",
    );
  const customer = await wrapStripe(() =>
    ensureStripeCustomer(deps, input.organizationId, input.email),
  );
  const session = await wrapStripe(() =>
    deps.stripe.checkout.sessions.create({
      mode: "payment",
      customer,
      client_reference_id: input.organizationId,
      locale: STRIPE_LOCALE[input.lang],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: input.amountCents,
            tax_behavior: "exclusive",
            ...(input.productId
              ? { product: input.productId }
              : { product_data: { name: input.productName } }),
          },
        },
      ],
      ...discountParams(input),
      automatic_tax: { enabled: true },
      billing_address_collection: "required",
      customer_update: { address: "auto", name: "auto" },
      tax_id_collection: { enabled: true },
      invoice_creation: { enabled: true },
      metadata: {
        kind: "credits",
        organization_id: input.organizationId,
        credits_cents: String(creditsCents),
        config_version: configVersion(deps.config),
        ...promoMeta(input),
      },
      success_url: accountUrl(
        deps,
        input.lang,
        "?achat=ok&session_id={CHECKOUT_SESSION_ID}",
      ),
      cancel_url: accountUrl(deps, input.lang, "?achat=annule"),
    }),
  );
  if (!session.url)
    throw new CheckoutError("stripe_error", "session sans adresse");
  return { url: session.url, sessionId: session.id };
}

export interface SubscriptionCheckoutInput extends CheckoutExtras {
  organizationId: string;
  plan: SubscriptionPlan;
  lang: Lang;
  email?: string;
  /** Essai gratuit de l'offre, décidé par l'appelant (aucun essai si le client en a déjà eu un). */
  trial?: { days: number; requireCard: boolean };
}

/** Durée d'essai effective : le plus long de l'offre et du code d'essai. */
export function effectiveTrialDays(input: SubscriptionCheckoutInput): number {
  return Math.max(input.trial?.days ?? 0, input.promo?.trialDays ?? 0);
}

/** Abonnement : mode `subscription`, prix Stripe du plan publié (créé par « Publier vers Stripe »). */
export async function createSubscriptionCheckout(
  deps: CheckoutDeps,
  input: SubscriptionCheckoutInput,
): Promise<{ url: string; sessionId: string }> {
  if (!input.plan.stripePriceId)
    throw new CheckoutError(
      "plan_not_synced",
      "ce plan n'a pas de prix Stripe : lancer « Publier vers Stripe »",
    );
  const customer = await wrapStripe(() =>
    ensureStripeCustomer(deps, input.organizationId, input.email),
  );
  const meta = {
    organization_id: input.organizationId,
    plan_code: input.plan.code,
    ...promoMeta(input),
  };
  const trialDays = effectiveTrialDays(input);
  // Sans carte seulement si le réglage (général ou de l'offre) le décide ; un rabais de 100 % pour toujours
  // n'en demande jamais.
  const cardOptional =
    input.noPaymentMethodNeeded === true ||
    (trialDays > 0 && input.trial?.requireCard === false);
  const session = await wrapStripe(() =>
    deps.stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: input.organizationId,
      locale: STRIPE_LOCALE[input.lang],
      line_items: [{ price: input.plan.stripePriceId as string, quantity: 1 }],
      ...discountParams(input),
      ...(cardOptional ? { payment_method_collection: "if_required" as const } : {}),
      automatic_tax: { enabled: true },
      billing_address_collection: "required",
      customer_update: { address: "auto", name: "auto" },
      tax_id_collection: { enabled: true },
      metadata: {
        kind: "subscription",
        ...meta,
        config_version: planConfigVersion(input.plan),
      },
      subscription_data: {
        metadata: meta,
        ...(trialDays > 0
          ? {
              trial_period_days: trialDays,
              ...(cardOptional && input.noPaymentMethodNeeded !== true
                ? {
                    trial_settings: {
                      end_behavior: { missing_payment_method: "cancel" as const },
                    },
                  }
                : {}),
            }
          : {}),
      },
      success_url: accountUrl(
        deps,
        input.lang,
        "?abonnement=ok&session_id={CHECKOUT_SESSION_ID}",
      ),
      cancel_url: accountUrl(deps, input.lang, "?abonnement=annule"),
    }),
  );
  if (!session.url)
    throw new CheckoutError("stripe_error", "session sans adresse");
  return { url: session.url, sessionId: session.id };
}

/** Portail client Stripe (moyens de paiement, factures, annulation). */
export async function createPortalSession(
  deps: CheckoutDeps,
  input: { organizationId: string; lang: Lang },
): Promise<{ url: string }> {
  const [link] = await deps.db
    .select({ id: billingCustomers.stripeCustomerId })
    .from(billingCustomers)
    .where(eq(billingCustomers.organizationId, input.organizationId));
  if (!link)
    throw new CheckoutError(
      "no_customer",
      "aucun client Stripe pour cette organisation",
    );
  const session = await wrapStripe(() =>
    deps.stripe.billingPortal.sessions.create({
      customer: link.id,
      return_url: accountUrl(deps, input.lang),
    }),
  );
  return { url: session.url };
}
