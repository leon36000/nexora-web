import "server-only";
import { SITE_URL } from "@/lib/site";
import { orgCanUseModels } from "../billing/entitlements";
import { getDb } from "../db";
import { log } from "../log";
import { loadKeyring } from "../vault/crypto";
import { getAuth } from "./instance";
import {
  requireCreditsFromEnv,
  type WorkstudioAccessDeps,
} from "./workstudio-access";
import {
  createWorkstudioIntrospector,
  resolveWorkstudioOidc,
} from "./workstudio-oidc";

/** Modèle par défaut de WorkStudio intégré (identifiant public du catalogue), si WORKSTUDIO_DEFAULT_MODEL est absent. */
export const DEFAULT_WORKSTUDIO_MODEL = "nexora/deepseek-v4.1-flash-1017";

/**
 * Dépendances de production de `GET /api/oauth/workstudio-access`, lues dans l'environnement à chaque requête :
 * WORKSTUDIO_OIDC_* et WORKSTUDIO_PUBLIC_URL (fournisseur OIDC ; sans eux la route répond 404),
 * WORKSTUDIO_GATEWAY_URL (terminée par /v1 ; sans elle : 503) et WORKSTUDIO_DEFAULT_MODEL.
 */
export function workstudioAccessDeps(): WorkstudioAccessDeps {
  const allowLoopback = process.env.NODE_ENV !== "production";
  const { config } = resolveWorkstudioOidc(process.env, { allowLoopback });
  return {
    db: getDb,
    keyring: () => loadKeyring(process.env),
    introspect: config
      ? createWorkstudioIntrospector(getAuth(), config, SITE_URL)
      : null,
    clientId: config?.clientId ?? null,
    gateway: () => {
      const url = process.env.WORKSTUDIO_GATEWAY_URL?.trim();
      if (!url) return null;
      return {
        url,
        model:
          process.env.WORKSTUDIO_DEFAULT_MODEL?.trim() ||
          DEFAULT_WORKSTUDIO_MODEL,
      };
    },
    allowLoopback,
    requireCredits: requireCreditsFromEnv(process.env),
    canUseModels: orgCanUseModels,
    log,
    now: () => new Date(),
  };
}
