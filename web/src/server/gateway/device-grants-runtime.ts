import "server-only";
import { SITE_URL } from "@/lib/site";
import { getSessionContext } from "@/server/auth/session";
import { getDb } from "@/server/db";
import type { DeviceGrantsHttpDeps } from "@/server/gateway/device-grants-http";
import { log } from "@/server/log";

export function getDeviceGrantsHttpDeps(): DeviceGrantsHttpDeps {
  return {
    db: getDb,
    siteUrl: SITE_URL,
    now: () => new Date(),
    log,
    getSessionContext: async (headers) => {
      const ctx = await getSessionContext(headers);
      if (!ctx) return null;
      return {
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        role: ctx.role,
      };
    },
  };
}
