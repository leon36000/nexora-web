import { type Database, enqueue } from "@nexora/db";
import type { Logger } from "@nexora/log";
import type { HandlerRegistry } from "../registry.ts";

/**
 * Tâche `rag.index` : indexe un document RAG par tranches. L'embedding passe par la passerelle du site (débit en
 * crédits, Privacy Router, Activité) : le worker n'appelle jamais un modèle lui-même, il déclenche une tranche sur le
 * site (`POST /api/admin/rag/index`, jeton d'administration) puis relance la suivante tant qu'il en reste. L'état est en
 * base : un arrêt du worker ne perd rien et ne facture jamais deux fois le même lot.
 */
export const INDEX_JOB = "rag.index";
const MAX_SLICES = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface IndexReply {
  state: "ready" | "partial" | "retry" | "failed" | "busy" | "gone";
  afterSeconds?: number;
  error?: string;
}
export interface IndexClient {
  run(documentId: string): Promise<IndexReply>;
}

/** Client du site : adresse interne et jeton d'administration (32 caractères au moins) ; `null` si l'un manque. */
export function indexClientFromEnv(
  env: Record<string, string | undefined>,
  doFetch: typeof fetch = fetch,
): IndexClient | null {
  const base = env.NEXORA_APP_INTERNAL_URL?.trim().replace(/\/+$/, "");
  const token = env.NEXORA_APP_ADMIN_TOKEN?.trim();
  if (!base || !token || token.length < 32) return null;
  return {
    async run(documentId) {
      const res = await doFetch(`${base}/api/admin/rag/index`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ documentId }),
        redirect: "error",
        signal: AbortSignal.timeout(150_000),
      });
      if (!res.ok)
        throw new Error(`rag.index : le site a répondu ${res.status}`);
      return (await res.json()) as IndexReply;
    },
  };
}

export function registerRagHandlers(
  registry: HandlerRegistry,
  deps: {
    db: Database;
    log: Logger;
    index: IndexClient | null;
    now?: () => Date;
  },
): HandlerRegistry {
  const now = deps.now ?? (() => new Date());
  registry.register(INDEX_JOB, async (job, ctx) => {
    const documentId = String(job.payload.documentId ?? "");
    const slice = Number(job.payload.slice ?? 0);
    if (!UUID.test(documentId)) {
      ctx.log.error(
        "rag : tâche d'indexation sans identifiant de document valide",
      );
      return;
    }
    if (!deps.index)
      throw new Error(
        "rag.index : NEXORA_APP_INTERNAL_URL et NEXORA_APP_ADMIN_TOKEN (32 caractères au moins) sont requis",
      );
    if (slice >= MAX_SLICES) {
      ctx.log.error("rag : trop de tranches pour un document, abandon", {
        documentId,
      });
      return;
    }
    const reply = await deps.index.run(documentId);
    const next = (delaySeconds: number) =>
      enqueue(deps.db, {
        type: INDEX_JOB,
        payload: { documentId, slice: slice + 1 },
        idempotencyKey: `rag-index:${documentId}:${slice + 1}`,
        availableAt: new Date(now().getTime() + delaySeconds * 1000),
      });
    switch (reply.state) {
      case "partial":
        await next(0);
        break;
      case "retry":
        await next(
          Math.min(Math.max(Number(reply.afterSeconds) || 30, 5), 3600),
        );
        break;
      case "busy":
        // Une autre tranche travaille : on revient vérifier après l'échéance de sa réservation.
        await next(70);
        break;
      case "failed":
        ctx.log.warn("rag : indexation abandonnée", {
          documentId,
          error: reply.error ?? "inconnue",
        });
        break;
      default:
        break;
    }
  });
  return registry;
}
