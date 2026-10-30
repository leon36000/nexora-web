import "server-only";
import type { Database } from "@nexora/db";
import { loadOrgEntitlements } from "@/server/billing/entitlements";
import { billingModeOf } from "@/server/gateway/house";
import { type StorageLevel, storageView } from "@/server/products/panel-data";

/**
 * Niveau d'alerte de l'espace de l'organisation (80 % ou 100 %) pour le rappeler sur les pages RAG et Nexora Code.
 * Null s'il n'y a rien à dire, ou si les droits n'ont pas pu être lus : un rappel manquant vaut mieux qu'une page cassée.
 */
export async function storageNotice(
  db: Database,
  organizationId: string,
): Promise<{ level: StorageLevel; percent: number } | null> {
  try {
    const [ent, mode] = await Promise.all([
      loadOrgEntitlements(db, organizationId),
      billingModeOf(db, organizationId),
    ]);
    const view = storageView(ent.storage, mode === "house");
    return view.level === "warning" || view.level === "full"
      ? { level: view.level, percent: view.percent }
      : null;
  } catch {
    return null;
  }
}
