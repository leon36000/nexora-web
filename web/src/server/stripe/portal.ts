import type Stripe from "stripe";

/**
 * Configuration RESTREINTE du portail client Stripe (Ruling du 28/10).
 *
 * La configuration par défaut du portail permet de changer d'offre et de résilier tout de suite avec un prorata : un client
 * qui passait d'une offre à une moins chère gardait les crédits de l'ancienne tout en étant remboursé de la différence. Le
 * portail de Nexora n'offre donc que : moyens de paiement, historique des factures, coordonnées (pas le courriel, qui sert
 * au contrôle des essais) et résiliation EN FIN DE PÉRIODE, sans prorata. Changer d'offre = résilier puis souscrire à la
 * nouvelle. La configuration est créée une fois (repérée par sa métadonnée) ; si elle ne peut être ni lue ni créée, le portail
 * n'est pas ouvert (jamais la configuration par défaut).
 */
export const PORTAL_CONFIG_MARK = "portal-v1";

const cache = new WeakMap<object, Promise<string>>();

export function portalConfigurationId(
  stripe: Pick<Stripe, "billingPortal">,
): Promise<string> {
  const key = stripe.billingPortal;
  const cached = cache.get(key);
  if (cached) return cached;
  const pending = (async () => {
    const list = await stripe.billingPortal.configurations.list({
      limit: 100,
    });
    const found = list.data.find(
      (c) => c.metadata?.nexora === PORTAL_CONFIG_MARK,
    );
    if (found) return found.id;
    const created = await stripe.billingPortal.configurations.create(
      {
        business_profile: { headline: "Nexora AI" },
        metadata: { nexora: PORTAL_CONFIG_MARK },
        features: {
          customer_update: {
            enabled: true,
            allowed_updates: ["name", "address", "phone", "tax_id"],
          },
          invoice_history: { enabled: true },
          payment_method_update: { enabled: true },
          subscription_cancel: {
            enabled: true,
            mode: "at_period_end",
            proration_behavior: "none",
          },
          subscription_update: { enabled: false },
        },
      },
      { idempotencyKey: `nexora-${PORTAL_CONFIG_MARK}` },
    );
    return created.id;
  })();
  cache.set(key, pending);
  // Un échec n'est pas gardé : l'appel suivant recommence.
  pending.catch(() => {
    if (cache.get(key) === pending) cache.delete(key);
  });
  return pending;
}
