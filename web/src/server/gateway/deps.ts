import "server-only";
import { randomUUID } from "node:crypto";
import { revalidateTag } from "next/cache";
import { getDb } from "../db";
import { log } from "../log";
import { getSecret } from "../vault";
import type { CatalogAdminDeps } from "./admin-handlers";
import { createLitellmClient } from "./litellm";
import type { GatewayDeps } from "./proxy";

/** Étiquette de cache du catalogue public (pages /modeles et fiches). */
export const CATALOG_TAG = "model-catalog";

function litellmConfig(): { baseUrl: string; masterKey: string } | null {
  const masterKey = process.env.LITELLM_MASTER_KEY;
  if (!masterKey || masterKey.length < 16) return null;
  return {
    baseUrl: process.env.LITELLM_BASE_URL ?? "http://127.0.0.1:4400",
    masterKey,
  };
}

function intFromEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}

/** Dépendances de production de la couche /v1 : lues dans l'environnement à chaque requête. */
export function gatewayDeps(): GatewayDeps {
  return {
    db: getDb,
    fetch,
    litellm: litellmConfig,
    // Clé d'espace WorkStudio des agents hébergés : lue du coffre à chaque appel (jamais en cache ni en variable).
    getSecret: (ref) => getSecret(ref),
    log,
    now: () => new Date(),
    requestId: () => `req_${randomUUID().replaceAll("-", "")}`,
    limits: {
      defaultRpm: intFromEnv("GATEWAY_DEFAULT_RPM", 120),
      defaultTpm: intFromEnv("GATEWAY_DEFAULT_TPM", 400_000),
      maxBodyBytes: intFromEnv("GATEWAY_MAX_BODY_BYTES", 8_000_000),
      upstreamTimeoutMs: intFromEnv("GATEWAY_UPSTREAM_TIMEOUT_MS", 300_000),
      streamTimeoutMs: intFromEnv("GATEWAY_STREAM_TIMEOUT_MS", 900_000),
      defaultMaxOutputTokens: intFromEnv(
        "GATEWAY_DEFAULT_MAX_OUTPUT_TOKENS",
        4096,
      ),
    },
  };
}

export function catalogAdminDeps(): CatalogAdminDeps {
  return {
    db: getDb,
    adminToken: process.env.NEXORA_APP_ADMIN_TOKEN,
    litellm: () => {
      const config = litellmConfig();
      return config ? createLitellmClient(config) : null;
    },
    getSecret: (ref) => getSecret(ref),
    fetch,
    log,
    now: () => new Date(),
    onPublished: () => revalidateTag(CATALOG_TAG, { expire: 0 }),
  };
}

/** Clés API de l'espace client : session Better Auth confrontée aux adhésions. */
export async function accountKeysDeps(): Promise<
  import("./account-handlers").AccountKeysDeps
> {
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
            organizationId: ctx.organizationId,
            role: ctx.role,
          }
        : null;
    },
    log,
    now: () => new Date(),
  };
}
