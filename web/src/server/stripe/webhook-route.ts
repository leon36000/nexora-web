import type { Logger } from "@nexora/log";
import { readLimitedBytes } from "@nexora/net";
import Stripe from "stripe";
import { processStripeEvent, type WebhookDeps } from "../billing/webhook";

export interface WebhookRouteDeps {
  /** Secret de signature (coffre ou, en développement, variable d'environnement). */
  webhookSecret: () => Promise<string>;
  process: WebhookDeps;
  log: Logger;
  /** Paiements réels autorisés par le fondateur (réglage de l'admin) ? Absent ou en échec : non. */
  liveAllowed?: () => Promise<boolean>;
}

const MAX_BODY_BYTES = 1_000_000;
const NO_STORE = { "cache-control": "no-store" };
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: NO_STORE });

async function liveAllowed(deps: WebhookRouteDeps): Promise<boolean> {
  if (!deps.liveAllowed) return false;
  try {
    return (await deps.liveAllowed()) === true;
  } catch {
    return false;
  }
}

/**
 * POST /api/stripe/webhook. La signature est vérifiée sur le corps BRUT (avant tout JSON.parse) avec
 * la fonction officielle du SDK (HMAC-SHA256, tolérance de 5 minutes contre le rejeu de captures).
 * Réponses : 400 signature absente ou invalide ; 503 secret non configuré ; 500 échec de
 * traitement (Stripe renvoie l'événement) ; 200 sinon, y compris pour un rejeu ou un type ignoré.
 */
export async function handleStripeWebhook(
  request: Request,
  deps: WebhookRouteDeps,
): Promise<Response> {
  if (request.method !== "POST")
    return json({ error: "method_not_allowed" }, 405);

  const signature = request.headers.get("stripe-signature");
  if (!signature) return json({ error: "missing_signature" }, 400);

  let secret: string;
  try {
    secret = await deps.webhookSecret();
  } catch {
    deps.log.error("stripe : secret de webhook non configuré");
    return json({ error: "webhook_not_configured" }, 503);
  }

  // Corps annoncé trop gros : refusé sans lecture ; sinon lu par morceaux, interrompu au-delà de la limite.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES)
    return json({ error: "payload_too_large" }, 413);
  const read = await readLimitedBytes(request, MAX_BODY_BYTES);
  if (!read.ok) return json({ error: "payload_too_large" }, 413);
  const raw = new TextDecoder().decode(read.bytes);

  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(raw, signature, secret);
  } catch {
    return json({ error: "invalid_signature" }, 400);
  }

  // Les paiements réels exigent l'accord explicite du fondateur : un événement de production est refusé tant
  // que le réglage n'est pas levé (en cas de doute, par exemple base illisible, il reste refusé).
  if (event.livemode && !(await liveAllowed(deps))) {
    deps.log.error("stripe : événement livemode refusé", { eventId: event.id });
    return json({ error: "livemode_refused" }, 400);
  }

  try {
    const outcome = await processStripeEvent(deps.process, event);
    return json({ received: true, status: outcome.status });
  } catch (error) {
    // Nom d'erreur seulement : un message pourrait citer des données du client.
    deps.log.error("stripe : échec du traitement d'un événement", {
      eventId: event.id,
      type: event.type,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return json({ error: "processing_failed" }, 500);
  }
}
