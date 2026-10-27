// « Publier vers Stripe » pour une offre d'abonnement : l'app crée ou met à jour le produit et le prix Stripe
// (POST /api/admin/payments/plans/publish), puis CE module écrit les identifiants dans la fiche Directus de l'offre.
// Logique pure (dépendances injectées) : testée sans Directus ni réseau.

export type Relayed = { status: number; body: unknown };

export interface PublishPlanDeps {
  items: {
    readOne(id: string): Promise<Record<string, unknown> | null>;
    updateOne(id: string, data: Record<string, unknown>): Promise<void>;
  };
  /** Appel de l'app (liste fermée, jeton de service) : `POST plans/publish { code }`. */
  publishToApp(code: string): Promise<Relayed>;
  /** Rafraîchit la page Tarifs ; ne bloque jamais. */
  revalidate(id: string): Promise<boolean>;
}

const err = (status: number, code: string, message: string): Relayed => ({
  status,
  body: { errors: [{ message, extensions: { code } }] },
});

export async function publishPlanFlow(
  deps: PublishPlanDeps,
  planId: unknown,
): Promise<Relayed> {
  if (typeof planId !== "string" || !/^[0-9a-fA-F-]{36}$/.test(planId))
    return err(422, "INVALID_PAYLOAD", "Identifiant d’offre invalide.");
  const plan = await deps.items.readOne(planId);
  if (!plan) return err(404, "PAIEMENTS_OFFRE_INCONNUE", "Offre introuvable.");
  if (plan.status !== "published")
    return err(
      409,
      "PAIEMENTS_OFFRE_NON_PUBLIEE",
      "Passez d’abord l’offre au statut « Publié » : seule une offre publiée se pousse vers Stripe.",
    );
  if (
    !Number.isSafeInteger(plan.price_cents) ||
    (plan.price_cents as number) <= 0
  )
    return err(
      422,
      "PAIEMENTS_PRIX_ABSENT",
      "L’offre n’a pas de prix : saisissez-le (ou adoptez le prix suggéré) avant de la pousser vers Stripe.",
    );
  const code = String(plan.code ?? "");
  if (!code)
    return err(422, "PAIEMENTS_OFFRE_SANS_CODE", "L’offre n’a pas de code.");

  const published = await deps.publishToApp(code);
  if (published.status !== 200) return published;
  const r = published.body as {
    stripeProductId?: string;
    stripePriceId?: string;
    appliedAt?: string;
  };
  if (!r.stripeProductId || !r.stripePriceId)
    return err(
      502,
      "PAIEMENTS_REPONSE_INVALIDE",
      "Réponse invalide du service de paiement.",
    );
  try {
    await deps.items.updateOne(planId, {
      stripe_product_id: r.stripeProductId,
      stripe_price_id: r.stripePriceId,
      stripe_synced_at: r.appliedAt ?? new Date().toISOString(),
    });
  } catch {
    // Stripe est à jour mais la fiche ne l'est pas : rejouer l'action est sans danger (idempotente) ; les
    // identifiants (publics, pas des secrets) sont rendus pour une saisie manuelle de dépannage.
    return {
      status: 502,
      body: {
        errors: [
          {
            message:
              "Stripe est à jour, mais les identifiants n’ont pas pu être écrits dans la fiche. Relancez « Publier vers Stripe » (sans danger) ou recopiez-les.",
            extensions: { code: "PAIEMENTS_ECRITURE_FICHE" },
          },
        ],
        stripeProductId: r.stripeProductId,
        stripePriceId: r.stripePriceId,
      },
    };
  }
  const revalidated = await deps.revalidate(planId).catch(() => false);
  return { status: 200, body: { ...r, code, written: true, revalidated } };
}
