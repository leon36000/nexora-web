import Stripe from "stripe";

/**
 * Aides de test : événements Stripe construits à la main et signés avec la fonction officielle du
 * SDK (`generateTestHeaderString`), pour exercer le webhook sans Stripe et sans réseau.
 */
export const TEST_WEBHOOK_SECRET = "whsec_test_secret_for_unit_tests_only";

let counter = 0;

export function buildEvent<T extends object>(
  type: string,
  object: T,
  options: { id?: string; created?: number } = {},
): Stripe.Event {
  counter += 1;
  return {
    id: options.id ?? `evt_test_${Date.now()}_${counter}`,
    object: "event",
    api_version: "2026-09-30.endive",
    created: options.created ?? Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
    data: { object },
  } as unknown as Stripe.Event;
}

/** Corps brut et en-tête `stripe-signature` valides pour l'événement. */
export function signEvent(
  event: Stripe.Event,
  secret: string = TEST_WEBHOOK_SECRET,
): { payload: string; signature: string } {
  const payload = JSON.stringify(event);
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
  });
  return { payload, signature };
}

export function webhookRequest(
  event: Stripe.Event,
  options: { secret?: string; signature?: string; url?: string } = {},
): Request {
  const signed = signEvent(event, options.secret);
  return new Request(
    options.url ?? "http://localhost:3500/api/stripe/webhook",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": options.signature ?? signed.signature,
      },
      body: signed.payload,
    },
  );
}
