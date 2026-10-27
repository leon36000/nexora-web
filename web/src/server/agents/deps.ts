import "server-only";
import { revalidateTag } from "next/cache";
import { getDb } from "../db";
import { log } from "../log";
import { getSecret } from "../vault";
import type { HostedAgentsAdminDeps } from "./handlers";
import { AGENTS_TAG } from "./tag";

/** Dépendances de production de l'API d'administration des agents hébergés, lues à chaque requête. */
export function hostedAgentsAdminDeps(): HostedAgentsAdminDeps {
  return {
    db: getDb,
    adminToken: process.env.NEXORA_APP_ADMIN_TOKEN,
    getSecret: (ref) => getSecret(ref),
    fetch,
    log,
    now: () => new Date(),
    onChanged: () => {
      revalidateTag(AGENTS_TAG, { expire: 0 });
    },
  };
}
