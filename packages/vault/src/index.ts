import type { Database } from "@nexora/db";
import { type Keyring, loadKeyring } from "./crypto.ts";
import { readSecret } from "./store.ts";

export { VaultError } from "./crypto.ts";

/**
 * Lecture d'un secret du Coffre depuis un processus qui n'est pas le site (le worker). Même chiffrement, même clé
 * maîtresse (`NEXORA_VAULT_MASTER_KEY`) que le site : le code est PARTAGÉ (ce paquet), pas dupliqué.
 * Ne jamais journaliser, renvoyer au navigateur ni écrire dans Directus la valeur obtenue.
 */
export async function readVaultSecret(
  db: Database,
  ref: string,
  keyring: Keyring = loadKeyring(process.env),
): Promise<string> {
  return readSecret(db, keyring, ref);
}
