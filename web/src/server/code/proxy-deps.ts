import "server-only";
import { resolveCodeHosting } from "@nexora/code";
import { SITE_URL } from "@/lib/site";
import { getSessionContext } from "../auth/session";
import { getDb } from "../db";
import { log } from "../log";
import { productSwitchOn } from "../products/registry";
import { loadKeyring } from "../vault/crypto";
import type { ProxyDeps } from "./workspace-proxy";

/**
 * Dépendances de production du mandataire (`/code/ws/…`) et de `/api/code/ws-auth` ; `null` si Nexora Code hébergé n'est
 * pas allumé et configuré (`NEXORA_PRODUCT_CODE`, `NEXORA_CODE_DRIVER`) : les routes répondent alors 404.
 */
export function workspaceProxyDeps(
  env: Record<string, string | undefined> = process.env,
): ProxyDeps | null {
  if (!productSwitchOn(env.NEXORA_PRODUCT_CODE)) return null;
  const resolved = resolveCodeHosting(env, SITE_URL);
  if (!resolved.ok) return null;
  return {
    db: getDb,
    keyring: () => loadKeyring(env),
    siteUrl: SITE_URL,
    now: () => new Date(),
    log,
    upstreamHost: resolved.config.upstreamHost,
    allowSameOriginUi: productSwitchOn(env.NEXORA_CODE_ALLOW_SAME_ORIGIN_UI),
    fetch,
    getContext: async (headers) => {
      const ctx = await getSessionContext(headers);
      return ctx
        ? {
            userId: ctx.userId,
            organizationId: ctx.organizationId,
            emailVerified: ctx.emailVerified,
            isStaff: ctx.isStaff,
            twoFactorEnabled: ctx.twoFactorEnabled,
          }
        : null;
    },
  };
}
