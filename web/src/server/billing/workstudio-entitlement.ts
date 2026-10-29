import { accessLevel, type Database, eq, subscriptions } from "@nexora/db";
import { billingModeOf } from "../gateway/house";

/**
 * Droit d'ouvrir WorkStudio, côté serveur (la même règle que le bouton du panneau, `hasWorkstudioAccess`) :
 * l'organisation « maison » (accès gratuit) OU un abonnement lié à une offre du catalogue (`planCode`), actif, en
 * essai ou en délai de grâce. Un abonnement de VPS (sans offre), résilié ou impayé n'ouvre rien.
 */
export async function hasWorkstudioEntitlement(
  db: Database,
  organizationId: string,
  now: Date = new Date(),
): Promise<boolean> {
  if ((await billingModeOf(db, organizationId)) === "house") return true;
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId));
  return rows.some((s) => {
    if (s.planCode === null) return false;
    const level = accessLevel(
      { status: s.status, graceEndsAt: s.graceEndsAt },
      now,
    );
    return level === "full" || level === "grace";
  });
}
