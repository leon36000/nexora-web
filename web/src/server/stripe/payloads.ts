import { z } from "zod";

/**
 * Lecture défensive des objets Stripe reçus par webhook. Seuls les champs utilisés sont déclarés ;
 * le reste est ignoré. Un objet qui ne correspond pas lève une erreur : l'événement n'est alors pas
 * marqué « traité » et Stripe le renverra.
 *
 * Stripe renvoie une chaîne ou un objet développé pour les références : `idOf` normalise.
 */
const ref = z.union([z.string(), z.object({ id: z.string() })]);
export const idOf = (value: z.infer<typeof ref>): string =>
  typeof value === "string" ? value : value.id;

const metadata = z
  .record(z.string(), z.string())
  .nullish()
  .transform((value) => value ?? {});

export const checkoutSessionSchema = z.object({
  id: z.string(),
  mode: z.enum(["payment", "subscription", "setup"]),
  payment_status: z.string(),
  client_reference_id: z.string().nullish(),
  customer: ref.nullish(),
  payment_intent: ref.nullish(),
  subscription: ref.nullish(),
  amount_subtotal: z.number().int().nullish(),
  amount_total: z.number().int().nullish(),
  currency: z.string().nullish(),
  total_details: z
    .object({
      amount_tax: z.number().int().nullish(),
      amount_discount: z.number().int().nullish(),
    })
    .nullish(),
  metadata,
});
export type CheckoutSessionPayload = z.infer<typeof checkoutSessionSchema>;

const periodSchema = z.object({ start: z.number(), end: z.number() });

export const invoiceSchema = z.object({
  id: z.string(),
  customer: ref.nullish(),
  billing_reason: z.string().nullish(),
  /** Montant réellement encaissé, taxes comprises (0 : facture couverte par un solde ou un rabais). */
  amount_paid: z.number().int().nullish(),
  /** Anciennes versions d'API : la facture porte son paiement (supprimé depuis 2025, voir `invoicePaymentSchema`). */
  payment_intent: ref.nullish(),
  charge: ref.nullish(),
  /** API récente : la facture pointe vers l'abonnement par `parent`. */
  parent: z
    .object({
      subscription_details: z
        .object({
          subscription: ref.nullish(),
          metadata,
        })
        .nullish(),
    })
    .nullish(),
  /** Anciennes versions d'API. */
  subscription: ref.nullish(),
  lines: z
    .object({
      data: z.array(
        z.object({
          period: periodSchema.nullish(),
          pricing: z
            .object({
              price_details: z
                .object({ price: z.string().nullish() })
                .nullish(),
            })
            .nullish(),
        }),
      ),
    })
    .nullish(),
});
export type InvoicePayload = z.infer<typeof invoiceSchema>;

/** `invoice_payment.paid` : relie une facture à son PaymentIntent (ou à sa charge). */
export const invoicePaymentSchema = z.object({
  id: z.string(),
  invoice: ref,
  status: z.string().nullish(),
  payment: z
    .object({
      type: z.string().nullish(),
      payment_intent: ref.nullish(),
      charge: ref.nullish(),
    })
    .nullish(),
});
export type InvoicePaymentPayload = z.infer<typeof invoicePaymentSchema>;

export const subscriptionSchema = z.object({
  id: z.string(),
  customer: ref,
  status: z.string(),
  cancel_at_period_end: z.boolean().nullish(),
  canceled_at: z.number().nullish(),
  metadata,
  items: z
    .object({
      data: z.array(
        z.object({
          current_period_start: z.number().nullish(),
          current_period_end: z.number().nullish(),
          price: z.object({ id: z.string() }).nullish(),
        }),
      ),
    })
    .nullish(),
});
export type SubscriptionPayload = z.infer<typeof subscriptionSchema>;

export const chargeSchema = z.object({
  id: z.string(),
  payment_intent: ref.nullish(),
  amount: z.number().int(),
  amount_refunded: z.number().int(),
  currency: z.string().nullish(),
});
export type ChargePayload = z.infer<typeof chargeSchema>;

export const disputeSchema = z.object({
  id: z.string(),
  charge: ref,
  payment_intent: ref.nullish(),
  amount: z.number().int(),
  status: z.string().nullish(),
});
export type DisputePayload = z.infer<typeof disputeSchema>;

/** Identifiant de l'abonnement d'une facture, quelle que soit la version d'API. */
export function subscriptionIdOfInvoice(inv: InvoicePayload): string | null {
  const ref =
    inv.parent?.subscription_details?.subscription ?? inv.subscription ?? null;
  return ref ? idOf(ref) : null;
}
