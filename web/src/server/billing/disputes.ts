import {
  and,
  type DisputeStatus,
  type Executor,
  eq,
  inArray,
  paymentDisputes,
} from "@nexora/db";

/**
 * Litiges de paiement par organisation (Ruling du 28/10, « achat dépensé puis contesté ») : le solde négatif d'une reprise
 * reste une dette qui bloque l'API (grand livre, inchangé) ; en plus, une organisation dont un litige est ouvert ou perdu ne
 * reçoit plus d'essai gratuit ni de rabais (un compte jetable qui dépense puis conteste ne se rejoue pas). Un litige gagné
 * lève la restriction.
 */
export async function recordDisputeOpened(
  tx: Executor,
  input: { id: string; organizationId: string; amountCents: number },
): Promise<void> {
  await tx
    .insert(paymentDisputes)
    .values({
      id: input.id,
      organizationId: input.organizationId,
      amountCents: input.amountCents,
    })
    .onConflictDoNothing();
}

export async function recordDisputeClosed(
  tx: Executor,
  input: {
    id: string;
    organizationId: string;
    amountCents: number;
    status: "won" | "lost";
    at: Date;
  },
): Promise<void> {
  // Le litige peut être clos sans qu'on ait vu son ouverture (événements désordonnés) : on l'inscrit alors directement.
  await tx
    .insert(paymentDisputes)
    .values({
      id: input.id,
      organizationId: input.organizationId,
      amountCents: input.amountCents,
      status: input.status,
      closedAt: input.at,
    })
    .onConflictDoUpdate({
      target: paymentDisputes.id,
      set: { status: input.status as DisputeStatus, closedAt: input.at },
    });
}

/** Un litige ouvert ou perdu restreint-il cette organisation ? */
export async function hasDisputeRestriction(
  db: Executor,
  organizationId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: paymentDisputes.id })
    .from(paymentDisputes)
    .where(
      and(
        eq(paymentDisputes.organizationId, organizationId),
        inArray(paymentDisputes.status, ["open", "lost"]),
      ),
    )
    .limit(1);
  return Boolean(row);
}
