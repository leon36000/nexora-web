import {
  BILLING_MODES,
  type BillingMode,
  type Database,
  eq,
  organizationBilling,
} from "@nexora/db";

/**
 * Organisation « maison » (G9) : accès gratuit du fondateur et de l'équipe. Une organisation sans ligne est
 * `standard`. Le mode ne change jamais ce qui est compté (jetons, valeur offerte, coût amont réel) : seulement
 * si le grand livre est débité.
 */
export async function billingModeOf(
  db: Database,
  organizationId: string,
): Promise<BillingMode> {
  const [row] = await db
    .select({ mode: organizationBilling.mode })
    .from(organizationBilling)
    .where(eq(organizationBilling.organizationId, organizationId));
  return row?.mode ?? "standard";
}

export async function setBillingMode(
  db: Database,
  organizationId: string,
  mode: BillingMode,
  setBy?: string,
): Promise<void> {
  if (!BILLING_MODES.includes(mode))
    throw new RangeError(`mode de facturation inconnu : ${String(mode)}`);
  await db
    .insert(organizationBilling)
    .values({ organizationId, mode, setBy: setBy ?? null })
    .onConflictDoUpdate({
      target: organizationBilling.organizationId,
      set: { mode, setBy: setBy ?? null, updatedAt: new Date() },
    });
}
