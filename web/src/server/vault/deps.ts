import { getDb } from "../db";
import { log } from "../log";
import { loadKeyring } from "./crypto";
import type { VaultDeps } from "./handlers";

/** Dépendances de production : lues dans l'environnement à chaque requête (jamais au chargement du module). */
export function vaultDeps(): VaultDeps {
  return {
    db: getDb,
    adminToken: process.env.NEXORA_APP_ADMIN_TOKEN,
    keyring: () => loadKeyring(process.env),
    log,
  };
}
