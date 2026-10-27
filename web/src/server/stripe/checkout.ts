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

export interface CreditCheckoutInput {
  organizationId: string;
  /** Montant avant taxes, en cents CAD. */
  amountCents: number;
  lang: Lang;
  /** Libellé de la ligne sur la page de paiement (dictionnaire de la langue). */
  productName: string;
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
            product_data: { name: input.productName },
          },
        },
      ],
      automatic_tax: { enabled: true },
      billing_address_collection: "required",
      customer_update: { address: "auto", name: "auto" },
      tax_id_collection: { enabled: true },
      invoice_creation: { enabled: true },
      metadata: {
        kind: "credits",
        organization_id: input.organizationId,
        credits_cents: String(input.amountCents),
        config_version: configVersion(deps.config),
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

export interface SubscriptionCheckoutInput {
  organizationId: string;
  plan: SubscriptionPlan;
  lang: Lang;
  email?: string;
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
  };
  const session = await wrapStripe(() =>
    deps.stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: input.organizationId,
      locale: STRIPE_LOCALE[input.lang],
      line_items: [{ price: input.plan.stripePriceId as string, quantity: 1 }],
      automatic_tax: { enabled: true },
      billing_address_collection: "required",
      customer_update: { address: "auto", name: "auto" },
      tax_id_collection: { enabled: true },
      metadata: {
        kind: "subscription",
        ...meta,
        config_version: planConfigVersion(input.plan),
      },
      subscription_data: { metadata: meta },
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
