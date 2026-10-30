import "server-only";
import { resolveCodeHosting } from "@nexora/code";
import { eq, staffAccounts, users } from "@nexora/db";
import { SITE_URL } from "@/lib/site";
import { getSessionContext } from "../auth/session";
import { getDb } from "../db";
import { log } from "../log";
import { productSwitchOn } from "../products/registry";
import { loadKeyring } from "../vault/crypto";
import { ticketSecret } from "./ticket";
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
    dedicated: dedicatedFromEnv(env),
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

/** Origine dédiée de l'interface web : `NEXORA_CODE_HOST_SUFFIX` (ex. `code.nexora.example`, joker DNS et TLS) et un secret de billets. */
export function dedicatedFromEnv(
  env: Record<string, string | undefined> = process.env,
): ProxyDeps["dedicated"] {
  const suffix = env.NEXORA_CODE_HOST_SUFFIX?.trim().toLowerCase();
  if (!suffix || !/^[a-z0-9]([a-z0-9.-]{0,120}[a-z0-9])?$/.test(suffix))
    return null;
  const secret = ticketSecret(env);
  if (!secret) return null;
  return {
    suffix,
    secret,
    loadUser: async (userId) => {
      const db = getDb();
      const [user] = await db
        .select({
          emailVerified: users.emailVerified,
          twoFactorEnabled: users.twoFactorEnabled,
        })
        .from(users)
        .where(eq(users.id, userId));
      if (!user) return null;
      const [staff] = await db
        .select({
          userId: staffAccounts.userId,
          revokedAt: staffAccounts.revokedAt,
        })
        .from(staffAccounts)
        .where(eq(staffAccounts.userId, userId));
      return {
        emailVerified: user.emailVerified,
        isStaff: Boolean(staff && !staff.revokedAt),
        twoFactorEnabled: Boolean(user.twoFactorEnabled),
      };
    },
  };
}
