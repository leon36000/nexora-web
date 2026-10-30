import "server-only";
import { randomUUID } from "node:crypto";
import { enqueue } from "@nexora/db";
import { getDb } from "../db";
import { gatewayDeps } from "../gateway/deps";
import { handleEmbeddings, handleRerank } from "../gateway/proxy";
import { log } from "../log";
import type { RagAccountDeps } from "./account";
import { ragConfig } from "./config";
import type { RagHttpDeps } from "./http";
import { entitlementsStorage } from "./storage";
import type { RagDeps } from "./types";

/**
 * Dépendances de production du RAG, lues dans l'environnement à chaque requête. Les appels de modèle passent par la
 * passerelle (`handleEmbeddings`, `handleRerank`) avec la clé déjà authentifiée : mêmes limites, même Privacy Router,
 * même débit en crédits et même Activité que `/v1`.
 *
 * Espace : `recordStorageUsage(org, "rag", delta)` du module des offres (`billing/entitlements.ts`).
 */
export function ragDeps(): RagDeps {
  const gw = gatewayDeps();
  return {
    db: getDb,
    log,
    now: () => new Date(),
    requestId: () => `rag_${randomUUID().replaceAll("-", "")}`,
    config: ragConfig(),
    gateway: {
      embeddings: (request, key) =>
        handleEmbeddings(request, {
          ...gw,
          authenticate: async () => ({ ok: true, key }),
        }),
      rerank: (request, key) =>
        handleRerank(request, {
          ...gw,
          authenticate: async () => ({ ok: true, key }),
        }),
    },
    storage: entitlementsStorage(getDb),
    enqueue: async (job) => {
      await enqueue(getDb(), job);
    },
  };
}

/** Origines de navigateur admises pour le serveur MCP : l'adresse du site (les clients MCP n'envoient pas d'origine). */
export async function ragHttpDeps(): Promise<RagHttpDeps> {
  const { SITE_URL } = await import("@/lib/site");
  const extra = (process.env.RAG_MCP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return { ...ragDeps(), allowedOrigins: [new URL(SITE_URL).origin, ...extra] };
}

export async function ragAccountDeps(): Promise<RagAccountDeps> {
  const { getSessionContext } = await import("../auth/session");
  const { SITE_URL } = await import("@/lib/site");
  return {
    ...ragDeps(),
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
  };
}
