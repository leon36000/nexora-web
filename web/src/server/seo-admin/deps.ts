import "server-only";
import { getDb } from "../db";
import { log } from "../log";
import type { SeoAdminDeps } from "./handlers";

export function seoAdminDeps(): SeoAdminDeps {
  return {
    db: getDb,
    adminToken: process.env.NEXORA_APP_ADMIN_TOKEN,
    log,
    now: () => new Date(),
    env: process.env,
  };
}
