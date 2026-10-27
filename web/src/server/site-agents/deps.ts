import "server-only";
import { loadKeyring } from "@nexora/vault/crypto";
import { getDb } from "../db";
import { log } from "../log";
import type { SiteAgentsAdminDeps } from "./handlers";

/** Dépendances de production, lues dans l'environnement à chaque requête. */
export function siteAgentsAdminDeps(): SiteAgentsAdminDeps {
  return {
    db: getDb,
    adminToken: process.env.NEXORA_APP_ADMIN_TOKEN,
    keyring: () => loadKeyring(process.env),
    log,
    now: () => new Date(),
  };
}
