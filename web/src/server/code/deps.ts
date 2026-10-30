import "server-only";
import { SITE_URL } from "@/lib/site";
import { getSessionContext } from "../auth/session";
import { DEFAULT_WORKSTUDIO_MODEL } from "../auth/workstudio-access-deps";
import { loadOrgEntitlements } from "../billing/entitlements";
import { getDb } from "../db";
import { log } from "../log";
import type { CreditsDeps } from "./credits";
import type { DeviceDeps } from "./device";

/** Modèle proposé par défaut au CLI à la connexion : `NEXORA_CODE_DEFAULT_MODEL`, sinon celui de WorkStudio, sinon la constante. */
export function codeDefaultModel(
  env: Record<string, string | undefined> = process.env,
): string {
  return (
    env.NEXORA_CODE_DEFAULT_MODEL?.trim() ||
    env.WORKSTUDIO_DEFAULT_MODEL?.trim() ||
    DEFAULT_WORKSTUDIO_MODEL
  );
}

/** Dépendances de production des routes `/api/code/device/*` : session du site, base, journal. */
export function deviceDeps(): DeviceDeps {
  return {
    db: getDb,
    siteUrl: SITE_URL,
    now: () => new Date(),
    log,
    defaultModel: () => codeDefaultModel(),
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

export function creditsDeps(): CreditsDeps {
  return {
    db: getDb,
    now: () => new Date(),
    log,
    entitlements: loadOrgEntitlements,
  };
}
