import "server-only";
import { revalidateTag } from "next/cache";
import { getStripe } from "../billing/deps";
import { getDb } from "../db";
import { loadBillingConfig } from "../ledger/config";
import { log } from "../log";
import { getSecret } from "../vault";
import type { VpsAdminDeps } from "./admin-handlers";
import type { VpsCustomerDeps } from "./customer-handlers";
import { VPS_CATALOG_TAG } from "./read";

const intFromEnv = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
};

export function vpsAdminDeps(): VpsAdminDeps {
  return {
    db: getDb,
    adminToken: process.env.NEXORA_APP_ADMIN_TOKEN,
    getSecret: (ref) => getSecret(ref),
    stripe: () => getStripe(),
    log,
    now: () => new Date(),
    onPublished: () => revalidateTag(VPS_CATALOG_TAG, { expire: 0 }),
  };
}

/** Routes clientes : session Better Auth confrontée aux adhésions. */
export async function vpsCustomerDeps(): Promise<VpsCustomerDeps> {
  const { getSessionContext } = await import("../auth/session");
  const { SITE_URL } = await import("@/lib/site");
  return {
    db: getDb,
    siteUrl: SITE_URL,
    getContext: async (headers) => {
      const ctx = await getSessionContext(headers);
      return ctx
        ? {
            userId: ctx.userId,
            email: ctx.email,
            organizationId: ctx.organizationId,
            role: ctx.role,
          }
        : null;
    },
    stripe: () => getStripe(),
    config: loadBillingConfig(),
    log,
    now: () => new Date(),
    maxPerOrganization: intFromEnv("VPS_MAX_PER_ORG", 5),
  };
}
