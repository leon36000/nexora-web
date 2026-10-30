import type { Database } from "@nexora/db";
import {
  loadOrgEntitlements,
  recordStorageUsageIn,
} from "../billing/entitlements";
import type { RagStoragePort } from "./types";

/**
 * Compteur d'espace du RAG sur le contrat du module des offres (`billing/entitlements.ts`) : `recordStorageUsage(org,
 * "rag", delta)` refuse (`quota_exceeded`) un ajout qui dépasserait l'espace de l'offre et des Go supplémentaires, et
 * accepte toujours une libération ; `byProduct.rag` donne l'espace déjà compté.
 */
export function entitlementsStorage(db: () => Database): RagStoragePort {
  return {
    record: (organizationId, deltaBytes) =>
      recordStorageUsageIn(db(), organizationId, "rag", deltaBytes),
    used: async (organizationId) =>
      (await loadOrgEntitlements(db(), organizationId)).storage.byProduct.rag,
  };
}
