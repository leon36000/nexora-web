import {
  and,
  type Database,
  eq,
  osTemplates,
  proxmoxServers,
} from "@nexora/db";
import type { GuardOptions } from "./catalog.ts";

/**
 * Options de la garde de publication lues de la base : un plan n'est publiable que si un gabarit
 * prêt de son code existe sur un serveur prêt de sa région. Les plans de développement ne sont
 * publiables qu'hors production.
 */
export async function guardOptions(
  db: Database,
  env: Record<string, string | undefined> = process.env,
): Promise<GuardOptions> {
  const rows = await db
    .select({ code: osTemplates.code, region: proxmoxServers.region })
    .from(osTemplates)
    .innerJoin(proxmoxServers, eq(proxmoxServers.id, osTemplates.serverId))
    .where(
      and(eq(osTemplates.state, "ready"), eq(proxmoxServers.state, "ready")),
    );
  const ready = new Set(rows.map((r) => `${r.region}:${r.code}`));
  return {
    allowDevSamples: env.NODE_ENV !== "production",
    templateReady: (code, region) => ready.has(`${region}:${code}`),
  };
}
