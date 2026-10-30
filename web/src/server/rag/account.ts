import {
  and,
  apiKeys,
  type Database,
  desc,
  eq,
  isNotNull,
  type OrgRole,
} from "@nexora/db";
import { z } from "zod";
import { isSameOriginRequest } from "../auth/origin";
import { consumeRateLimit } from "../billing/rate-limit";
import { revokeApiKey } from "../gateway/keys";
import {
  createBaseWithKey,
  createRagKey,
  deleteBase,
  getBase,
  listBases,
} from "./bases";
import {
  addDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  resolveBillingKey,
} from "./documents";
import { F, failureResponse, type RagFailure } from "./failure";
import {
  baseJson,
  documentJson,
  readDocumentInput,
  readJsonBody,
} from "./http";
import { searchBase } from "./search";
import { connectionSnippets } from "./snippets";
import type { RagDeps } from "./types";

/**
 * RAG de l'espace client (panneau) : `/api/account/rag/*`. L'organisation vient de la session confrontée aux adhésions,
 * jamais du corps. Lire est permis à tout membre ; créer, supprimer, ajouter des documents et gérer les clés est réservé
 * au propriétaire (ces gestes dépensent des crédits et de l'espace). Contrôle d'origine (CSRF) sur toute écriture.
 * Les appels au modèle sont facturés à une clé active de la base (voir `resolveBillingKey`).
 */
export interface RagAccountContext {
  userId: string;
  organizationId: string;
  role: OrgRole;
}
export type RagAccountDeps = RagDeps & {
  siteUrl: string;
  getContext: (headers: Headers) => Promise<RagAccountContext | null>;
};

const createBody = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    embedding_model: z.string().optional(),
    rerank: z.boolean().optional(),
    chunk_chars: z.number().int().optional(),
    chunk_overlap: z.number().int().optional(),
  })
  .strict();
const keyBody = z
  .object({ name: z.string(), mode: z.enum(["read", "write"]) })
  .strict();
const queryBody = z
  .object({
    query: z.string(),
    top_k: z.number().int().optional(),
    rerank: z.boolean().optional(),
    min_score: z.number().optional(),
  })
  .strict();

const NO_STORE = { "cache-control": "no-store" };
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: NO_STORE });
const error = (status: number, code: string) => json({ error: code }, status);

function keyJson(k: typeof apiKeys.$inferSelect) {
  return {
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    mode: k.ragAccess?.mode ?? "read",
    bases: k.ragAccess?.bases ?? [],
    created_at: k.createdAt.toISOString(),
    last_used_at: k.lastUsedAt?.toISOString() ?? null,
    expires_at: k.expiresAt?.toISOString() ?? null,
    revoked: k.revokedAt !== null,
  };
}

async function keysOfBase(
  db: Database,
  organizationId: string,
  baseId: string,
) {
  const rows = await db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.organizationId, organizationId),
        isNotNull(apiKeys.ragAccess),
      ),
    )
    .orderBy(desc(apiKeys.createdAt));
  return rows.filter((k) => k.ragAccess?.bases.includes(baseId));
}

export async function handleAccountRag(
  request: Request,
  deps: RagAccountDeps,
): Promise<Response> {
  try {
    const method = request.method.toUpperCase();
    const mutating = method !== "GET" && method !== "HEAD";
    if (mutating && !isSameOriginRequest(request, deps.siteUrl))
      return error(403, "invalid_origin");
    const ctx = await deps.getContext(request.headers);
    if (!ctx) return error(401, "unauthenticated");
    if (mutating && ctx.role !== "owner") return error(403, "forbidden");
    const limit = await consumeRateLimit(deps.db(), `acct-rag:${ctx.userId}`, {
      limit: 120,
      windowSeconds: 60,
      now: deps.now(),
    });
    if (!limit.allowed)
      return Response.json(
        { error: "rate_limited" },
        {
          status: 429,
          headers: {
            ...NO_STORE,
            "retry-after": String(limit.retryAfterSeconds),
          },
        },
      );

    const org = ctx.organizationId;
    const parts = new URL(request.url).pathname
      .replace(/^\/api\/account\/rag\/?/, "")
      .split("/")
      .filter(Boolean);
    const fail = (f: RagFailure) => failureResponse(f);
    const endpoints = {
      api: `${deps.siteUrl.replace(/\/+$/, "")}/v1/rag`,
      mcp: `${deps.siteUrl.replace(/\/+$/, "")}/v1/rag/mcp`,
    };

    // /api/account/rag
    if (parts.length === 0) {
      if (method === "GET") {
        const bases = await listBases(deps, org);
        return json({
          object: "list",
          data: bases.map(baseJson),
          storage: { used_bytes: await deps.storage.used(org) },
          limits: {
            max_bases: deps.config.maxBasesPerOrg,
            max_file_bytes: deps.config.maxFileBytes,
            max_documents_per_base: deps.config.maxDocsPerBase,
          },
          endpoints,
        });
      }
      if (method === "POST") {
        const body = await readJsonBody(request, 16 * 1024, createBody);
        if (!body.ok)
          return json(
            { error: "invalid_request", message: body.failure.message },
            422,
          );
        const b = body.value;
        const made = await createBaseWithKey(deps, {
          organizationId: org,
          userId: ctx.userId,
          name: b.name,
          description: b.description,
          embeddingModel: b.embedding_model,
          rerankModel: b.rerank === false ? null : undefined,
          chunkChars: b.chunk_chars,
          chunkOverlap: b.chunk_overlap,
        });
        if (!made.ok)
          return made.failure.status === 400
            ? json(
                { error: "invalid_request", message: made.failure.message },
                422,
              )
            : fail(made.failure);
        const view = await getBase(deps, org, made.value.base.id);
        if (!view.ok) return fail(view.failure);
        deps.log.info("rag : base créée", {
          baseId: made.value.base.id,
          organizationId: org,
        });
        return json(
          {
            base: baseJson(view.value),
            // Seule occasion de voir la valeur de la clé : seule son empreinte est conservée.
            key: {
              id: made.value.keyId,
              value: made.value.key,
              prefix: made.value.keyPrefix,
              mode: "write",
            },
            endpoints,
            snippets: connectionSnippets({
              siteUrl: deps.siteUrl,
              baseName: made.value.base.name,
              baseId: made.value.base.id,
              key: made.value.key,
            }),
          },
          201,
        );
      }
      return error(405, "method_not_allowed");
    }

    const baseId = parts[0] as string;
    const section = parts[1];

    if (!section) {
      if (method === "GET") {
        const base = await getBase(deps, org, baseId);
        if (!base.ok) return fail(base.failure);
        return json({
          ...baseJson(base.value),
          endpoints,
          snippets: connectionSnippets({
            siteUrl: deps.siteUrl,
            baseName: base.value.name,
            baseId,
          }),
        });
      }
      if (method === "DELETE") {
        const gone = await deleteBase(deps, org, baseId);
        if (!gone.ok) return fail(gone.failure);
        deps.log.info("rag : base supprimée", { baseId, organizationId: org });
        return json({
          object: "base",
          id: baseId,
          deleted: true,
          released_bytes: gone.value.releasedBytes,
        });
      }
      return error(405, "method_not_allowed");
    }

    if (section === "keys") {
      if (!(await getBase(deps, org, baseId)).ok) return fail(F.baseNotFound());
      if (parts.length === 2) {
        if (method === "GET")
          return json({
            object: "list",
            data: (await keysOfBase(deps.db(), org, baseId)).map(keyJson),
          });
        if (method === "POST") {
          const body = await readJsonBody(request, 4 * 1024, keyBody);
          if (!body.ok)
            return json(
              { error: "invalid_request", message: body.failure.message },
              422,
            );
          const created = await createRagKey(deps, {
            organizationId: org,
            baseIds: [baseId],
            mode: body.value.mode,
            name: body.value.name,
            createdBy: ctx.userId,
          });
          if (!created.ok) return fail(created.failure);
          const base = await getBase(deps, org, baseId);
          return json(
            {
              key: {
                id: created.value.id,
                value: created.value.key,
                prefix: created.value.prefix,
              },
              mode: body.value.mode,
              endpoints,
              snippets: connectionSnippets({
                siteUrl: deps.siteUrl,
                baseName: base.ok ? base.value.name : "",
                baseId,
                key: created.value.key,
              }),
            },
            201,
          );
        }
        return error(405, "method_not_allowed");
      }
      if (parts.length === 3 && method === "DELETE") {
        const keyId = parts[2] as string;
        const own = (await keysOfBase(deps.db(), org, baseId)).find(
          (k) => k.id === keyId,
        );
        if (!own) return error(404, "key_not_found");
        await revokeApiKey(deps.db(), org, keyId, deps.now());
        return json({ object: "key", id: keyId, revoked: true });
      }
      return error(405, "method_not_allowed");
    }

    if (section === "query" && parts.length === 2) {
      if (method !== "POST") return error(405, "method_not_allowed");
      if (!(await getBase(deps, org, baseId)).ok) return fail(F.baseNotFound());
      const key = await resolveBillingKey(deps, org, baseId);
      if (!key) return fail(F.noKey());
      const body = await readJsonBody(
        request,
        deps.config.maxBodyBytes,
        queryBody,
      );
      if (!body.ok)
        return json(
          { error: "invalid_request", message: body.failure.message },
          422,
        );
      const res = await searchBase(
        deps,
        { organizationId: org, key },
        {
          baseId,
          query: body.value.query,
          topK: body.value.top_k,
          rerank: body.value.rerank,
          minScore: body.value.min_score,
        },
      );
      return res.ok ? json(res.value) : fail(res.failure);
    }

    if (section === "documents") {
      if (parts.length === 2) {
        if (method === "GET") {
          const url = new URL(request.url);
          const limitParam = url.searchParams.get("limit");
          const list = await listDocuments(deps, org, baseId, {
            limit: limitParam ? Number(limitParam) : undefined,
            cursor: url.searchParams.get("cursor") ?? undefined,
          });
          return list.ok
            ? json({
                object: "list",
                data: list.value.data.map((d) => documentJson(d)),
                next: list.value.next,
              })
            : fail(list.failure);
        }
        if (method === "POST") {
          if (!(await getBase(deps, org, baseId)).ok)
            return fail(F.baseNotFound());
          const key = await resolveBillingKey(deps, org, baseId);
          if (!key) return fail(F.noKey());
          const input = await readDocumentInput(request, deps, baseId);
          if (!input.ok) return fail(input.failure);
          const added = await addDocument(
            deps,
            { organizationId: org, key },
            input.input,
          );
          if (!added.ok) return fail(added.failure);
          const { document, duplicate } = added.value;
          return json(
            documentJson(document, duplicate),
            duplicate ? 200 : document.status === "ready" ? 201 : 202,
          );
        }
        return error(405, "method_not_allowed");
      }
      if (parts.length === 3) {
        const docId = parts[2] as string;
        if (method === "GET") {
          const doc = await getDocument(deps, org, baseId, docId);
          return doc.ok ? json(documentJson(doc.value)) : fail(doc.failure);
        }
        if (method === "DELETE") {
          const gone = await deleteDocument(deps, org, baseId, docId);
          return gone.ok
            ? json({ object: "document", id: docId, deleted: true })
            : fail(gone.failure);
        }
        return error(405, "method_not_allowed");
      }
    }
    return error(404, "not_found");
  } catch (e) {
    deps.log.error("rag : erreur interne (compte)", {
      errorName: e instanceof Error ? e.name : typeof e,
    });
    return error(500, "internal_error");
  }
}
