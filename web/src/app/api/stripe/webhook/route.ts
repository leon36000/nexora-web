import { webhookRouteDeps } from "@/server/billing/deps";
import { handleStripeWebhook } from "@/server/stripe/webhook-route";

// Corps lu brut (signature) : ne jamais le passer par un analyseur avant la vérification.
export async function POST(request: Request) {
  return handleStripeWebhook(request, webhookRouteDeps());
}
