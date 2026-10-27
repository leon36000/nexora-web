import type { Database, VaultKind } from "@nexora/db";
import type { Keyring } from "../vault/crypto";
import { listSecrets, putSecret, readSecret } from "../vault/store";

/** Ce que le module Paiements fait du Coffre : lire, écrire, et savoir ce qui existe (jamais une valeur dans une liste). */
export interface PaymentVault {
  /** Valeur d'un secret, ou `null` s'il est absent ou révoqué. Ne jamais journaliser le résultat. */
  get(ref: string): Promise<string | null>;
  put(ref: string, value: string, kind: VaultKind): Promise<void>;
  /** Résumé non secret d'une référence : présence et 4 derniers caractères. */
  summary(ref: string): Promise<{ present: boolean; last4: string | null }>;
}

export function dbVault(db: Database, keyring: Keyring): PaymentVault {
  return {
    async get(ref) {
      try {
        return await readSecret(db, keyring, ref);
      } catch {
        return null;
      }
    },
    async put(ref, value, kind) {
      await putSecret(db, keyring, { ref, value, kind });
    },
    async summary(ref) {
      const row = (await listSecrets(db)).find((s) => s.ref === ref);
      if (!row || row.revokedAt) return { present: false, last4: null };
      return { present: true, last4: row.last4 };
    },
  };
}
