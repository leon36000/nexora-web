import { type Executor, eq, organizations } from "@nexora/db";
import { onVpsCheckoutExpired } from "@nexora/vps";
import type { CheckoutSessionPayload } from "../stripe/payloads";

/**
 * Point d'entrée VPS du webhook `checkout.session.expired` : Stripe fait expirer la commande jamais
 * payée (le balayage de 24 h n'est qu'un filet). Appelé dans la transaction du webhook. Une session
 * qui n'est pas celle d'une commande de VPS est ignorée ; l'expiration d'une commande déjà payée,
 * déjà expirée ou dont l'abonnement est relié ne change rien (garde d'état dans `onVpsCheckoutExpired`).
 */
export async function onVpsSessionExpired(
  tx: Executor,
  session: CheckoutSessionPayload,
): Promise<"processed" | "ignored"> {
  const orderId = session.metadata.vps_order_id;
  const orgId = session.client_reference_id ?? session.metadata.organization_id;
  if (session.metadata.kind !== "vps" || !orderId || !orgId) return "ignored";
  const [org] = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  if (!org) return "ignored";
  await onVpsCheckoutExpired(tx, {
    orderId,
    organizationId: orgId,
    sessionId: session.id,
  });
  return "processed";
}
