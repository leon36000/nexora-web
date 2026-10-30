import { and, type Database, eq, ragDocuments, sql } from "@nexora/db";
import type { RagStoragePort } from "./types";

/**
 * Compteur d'espace PROVISOIRE : calculé sur les documents enregistrés, avec un quota unique par organisation
 * (`RAG_PROVISIONAL_QUOTA_BYTES`, 1 Gio par défaut). À remplacer par `recordStorageUsage(orgId, "rag", delta)` du module
 * des offres (`billing/entitlements.ts`, contrat de la conception du 30/10/2026) dès sa fusion : voir `deps.ts`.
 *
 * Le document est inséré AVANT la réservation d'espace : `used` le contient déjà quand `record(+n)` est appelé, d'où la
 * comparaison directe au quota.
 */
export function provisionalStorage(
  db: () => Database,
  quotaBytes: number,
): RagStoragePort {
  const used = async (organizationId: string): Promise<number> => {
    const [row] = await db()
      .select({
        bytes: sql<string>`COALESCE(sum(${ragDocuments.storedBytes}), 0)::bigint`,
      })
      .from(ragDocuments)
      .where(and(eq(ragDocuments.organizationId, organizationId)));
    return Number(row?.bytes ?? 0);
  };
  return {
    used,
    record: async (organizationId, deltaBytes) => {
      if (deltaBytes <= 0) return { ok: true };
      return (await used(organizationId)) > quotaBytes
        ? { ok: false, reason: "quota_exceeded" }
        : { ok: true };
    },
  };
}

export function provisionalQuotaBytes(
  env: Record<string, string | undefined> = process.env,
): number {
  const n = Number(env.RAG_PROVISIONAL_QUOTA_BYTES);
  return Number.isSafeInteger(n) && n > 0 ? n : 1024 ** 3;
}
