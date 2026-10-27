import "server-only";
import type { Database } from "@nexora/db";
import { getDb } from "../db";
import { type Keyring, loadKeyring } from "./crypto";
import { readSecret } from "./store";

export { VaultError } from "./crypto";

/**
 * Valeur d'un secret du coffre, pour les autres modules serveur (clés de fournisseurs, jeton
 * Proxmox, clés de paiement…). Lève VaultError (not_found, revoked, decrypt_failed).
 * Ne jamais journaliser, renvoyer au navigateur ni écrire dans Directus la valeur obtenue.
 */
export async function getSecret(
  ref: string,
  deps: { db: () => Database; keyring: () => Keyring } = {
    db: getDb,
    keyring: () => loadKeyring(process.env),
  },
): Promise<string> {
  return readSecret(deps.db(), deps.keyring(), ref);
}
