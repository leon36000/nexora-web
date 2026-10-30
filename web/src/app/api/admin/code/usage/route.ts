import { connection } from "next/server";
import { recordStorageUsageIn } from "@/server/billing/entitlements";
import { handleCodeUsage } from "@/server/code/usage";
import { getDb } from "@/server/db";
import { log } from "@/server/log";

// Appelé par le worker (tâche code.sweep) : { organizationId, deltaBytes } → { ok, overQuota }.
// Authentification : Authorization: Bearer <NEXORA_APP_ADMIN_TOKEN> (temps constant). docs/nexora-code.md.
export const POST = async (request: Request) => {
  await connection();
  return handleCodeUsage(request, {
    db: getDb,
    adminToken: process.env.NEXORA_APP_ADMIN_TOKEN,
    record: (organizationId, deltaBytes) =>
      recordStorageUsageIn(getDb(), organizationId, "code", deltaBytes),
    log,
  });
};
