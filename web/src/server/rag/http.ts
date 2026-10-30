import { readLimitedBytes } from "@nexora/net";
import { z } from "zod";
import {
  authenticateRag,
  type RagContext,
  scopeCheck,
  writeCheck,
} from "./auth";
import { type BaseView, getBase, listBases } from "./bases";
import {
  type AddInput,
  addDocument,
  type DocumentView,
  deleteDocument,
  getDocument,
  listDocuments,
} from "./documents";
import { F, failureResponse, type RagFailure } from "./failure";
import { searchBase } from "./search";
import type { RagDeps } from "./types";

export type RagHttpDeps = RagDeps & {
  /** Origines de navigateur admises pour le serveur MCP (en plus de l'absence d'origine, qui est le cas des clients). */
  allowedOrigins: string[];
};

export const baseJson = (b: BaseView) => ({
  object: "base" as const,
  id: b.id,
  name: b.name,
  description: b.description,
  embedding_model: b.embeddingModel,
  rerank_model: b.rerankModel,
  chunk_chars: b.chunkChars,
  chunk_overlap: b.chunkOverlap,
  created_at: b.createdAt.toISOString(),
  documents: b.stats.documents,
  ready: b.stats.ready,
  pending: b.stats.pending,
  failed: b.stats.failed,
  chunks: b.stats.chunks,
  bytes: b.stats.bytes,
});

const NO_STORE = { "cache-control": "no-store" };
const json = (body: unknown, status: number, headers: Record<string, string>) =>
  Response.json(body, { status, headers: { ...NO_STORE, ...headers } });

const queryBody = z
  .object({
    query: z.string(),
    top_k: z.number().int().optional(),
    rerank: z.boolean().optional(),
    min_score: z.number().optional(),
  })
  .strict();
const documentBody = z
  .object({
    title: z.string().optional(),
    text: z.string(),
    source: z.string().optional(),
    metadata: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional(),
  })
  .strict();

function zodFailure(error: z.ZodError): RagFailure {
  const issue = error.issues[0];
  const path = issue?.path.join(".") || null;
  return F.invalid(
    `Requête invalide${path ? ` (« ${path} »)` : ""} : ${issue?.message ?? "format inattendu"}.`,
    path,
  );
}

export async function readJsonBody<T>(
  request: Request,
  max: number,
  schema: z.ZodType<T>,
): Promise<{ ok: true; value: T } | { ok: false; failure: RagFailure }> {
  const read = await readLimitedBytes(request, max);
  if (!read.ok)
    return {
      ok: false,
      failure: F.tooLarge("Corps de requête trop volumineux."),
    };
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(read.bytes));
  } catch {
    return {
      ok: false,
      failure: F.invalid("Le corps doit être un JSON valide."),
    };
  }
  const parsed = schema.safeParse(raw);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, failure: zodFailure(parsed.error) };
}

/** Corps d'un ajout de document : JSON (`text`) ou formulaire (`file`), toujours borné avant d'être lu. */
export async function readDocumentInput(
  request: Request,
  deps: RagDeps,
  baseId: string,
): Promise<{ ok: true; input: AddInput } | { ok: false; failure: RagFailure }> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("multipart/form-data")) {
    const body = await readJsonBody(
      request,
      deps.config.maxBodyBytes,
      documentBody,
    );
    if (!body.ok) return body;
    return {
      ok: true,
      input: {
        baseId,
        title: body.value.title,
        text: body.value.text,
        source: body.value.source,
        metadata: body.value.metadata,
      },
    };
  }
  const read = await readLimitedBytes(
    request,
    deps.config.maxFileBytes + 64 * 1024,
  );
  if (!read.ok)
    return {
      ok: false,
      failure: F.tooLarge(
        `Ce fichier dépasse la taille maximale de ${Math.round(deps.config.maxFileBytes / (1024 * 1024))} Mo.`,
      ),
    };
  let form: FormData;
  try {
    form = await new Response(read.bytes as unknown as BodyInit, {
      headers: { "content-type": type },
    }).formData();
  } catch {
    return { ok: false, failure: F.invalid("Formulaire illisible.") };
  }
  const file = form.get("file");
  if (!(file instanceof File))
    return {
      ok: false,
      failure: F.invalid("Joignez le fichier dans le champ « file ».", "file"),
    };
  let metadata: AddInput["metadata"];
  const rawMeta = form.get("metadata");
  if (typeof rawMeta === "string" && rawMeta.length > 0) {
    try {
      metadata = JSON.parse(rawMeta);
    } catch {
      return {
        ok: false,
        failure: F.invalid(
          "« metadata » doit être un JSON valide.",
          "metadata",
        ),
      };
    }
  }
  const title = form.get("title");
  const source = form.get("source");
  return {
    ok: true,
    input: {
      baseId,
      title: typeof title === "string" ? title : undefined,
      source: typeof source === "string" ? source : undefined,
      filename: file.name,
      contentType: file.type || undefined,
      bytes: new Uint8Array(await file.arrayBuffer()),
      metadata,
    },
  };
}

export const documentJson = (d: DocumentView, duplicate = false) => ({
  object: "document" as const,
  ...d,
  duplicate,
});

const METHODS = (allowed: string[]) => ({ allow: allowed.join(", ") });
const notAllowed = (allowed: string[], headers: Record<string, string>) =>
  Response.json(
    {
      error: {
        message: `Méthode non permise ici. Méthodes permises : ${allowed.join(", ")}.`,
        type: "invalid_request_error",
        param: null,
        code: "method_not_allowed",
      },
    },
    { status: 405, headers: { ...NO_STORE, ...headers, ...METHODS(allowed) } },
  );

/** Routeur de `/v1/rag/*` (sauf `/mcp`) : clé `nxk_` avec permission RAG, base dans la portée de la clé. */
export async function handleRag(
  request: Request,
  deps: RagHttpDeps,
): Promise<Response> {
  try {
    const auth = await authenticateRag(request, deps);
    if (!auth.ok) return auth.response;
    const { ctx } = auth;
    const url = new URL(request.url);
    const parts = url.pathname
      .replace(/^\/v1\/rag\/?/, "")
      .split("/")
      .filter(Boolean);
    const method = request.method.toUpperCase();
    const fail = (f: RagFailure) => failureResponse(f, ctx.headers);
    const ok = (
      body: unknown,
      status = 200,
      extra: Record<string, string> = {},
    ) => json(body, status, { ...ctx.headers, ...extra });
    const caller = { organizationId: ctx.organizationId, key: ctx.key };

    if (parts[0] !== "bases")
      return json(
        {
          error: {
            message:
              "Adresse inconnue. Adresses : /v1/rag/bases, /v1/rag/bases/{id}/documents, /v1/rag/bases/{id}/query, /v1/rag/mcp.",
            type: "invalid_request_error",
            param: null,
            code: "unknown_url",
          },
        },
        404,
        ctx.headers,
      );

    if (parts.length === 1) {
      if (method !== "GET") return notAllowed(["GET"], ctx.headers);
      const all = await listBases(deps, ctx.organizationId);
      return ok({
        object: "list",
        data: all.filter((b) => ctx.baseIds.includes(b.id)).map(baseJson),
      });
    }
    const baseId = parts[1] as string;
    const outOfScope = scopeCheck(ctx, baseId);
    const section = parts[2];

    if (!section) {
      if (method !== "GET") return notAllowed(["GET"], ctx.headers);
      if (outOfScope) return fail(outOfScope);
      const base = await getBase(deps, ctx.organizationId, baseId);
      return base.ok ? ok(baseJson(base.value)) : fail(base.failure);
    }

    if (section === "query" && parts.length === 3) {
      if (method !== "POST") return notAllowed(["POST"], ctx.headers);
      if (outOfScope) return fail(outOfScope);
      const body = await readJsonBody(
        request,
        deps.config.maxBodyBytes,
        queryBody,
      );
      if (!body.ok) return fail(body.failure);
      const res = await searchBase(deps, caller, {
        baseId,
        query: body.value.query,
        topK: body.value.top_k,
        rerank: body.value.rerank,
        minScore: body.value.min_score,
      });
      if (!res.ok) return fail(res.failure);
      return ok(res.value, 200, {
        "x-nexora-cost-micro": res.value.usage.cost_micro,
      });
    }

    if (section === "documents") {
      if (parts.length === 3) {
        if (method === "GET") {
          if (outOfScope) return fail(outOfScope);
          const limit = url.searchParams.get("limit");
          const list = await listDocuments(deps, ctx.organizationId, baseId, {
            limit: limit ? Number(limit) : undefined,
            cursor: url.searchParams.get("cursor") ?? undefined,
          });
          if (!list.ok) return fail(list.failure);
          return ok({
            object: "list",
            data: list.value.data.map((d) => documentJson(d)),
            next: list.value.next,
          });
        }
        if (method === "POST") {
          const denied = outOfScope ?? writeCheck(ctx);
          if (denied) return fail(denied);
          const input = await readDocumentInput(request, deps, baseId);
          if (!input.ok) return fail(input.failure);
          const added = await addDocument(deps, caller, input.input);
          if (!added.ok) return fail(added.failure);
          const { document, duplicate } = added.value;
          const status = duplicate
            ? 200
            : document.status === "ready"
              ? 201
              : 202;
          return ok(documentJson(document, duplicate), status);
        }
        return notAllowed(["GET", "POST"], ctx.headers);
      }
      if (parts.length === 4) {
        const docId = parts[3] as string;
        if (method === "GET") {
          if (outOfScope) return fail(outOfScope);
          const doc = await getDocument(
            deps,
            ctx.organizationId,
            baseId,
            docId,
          );
          return doc.ok ? ok(documentJson(doc.value)) : fail(doc.failure);
        }
        if (method === "DELETE") {
          const denied = outOfScope ?? writeCheck(ctx);
          if (denied) return fail(denied);
          const gone = await deleteDocument(
            deps,
            ctx.organizationId,
            baseId,
            docId,
          );
          return gone.ok
            ? ok({ object: "document", id: docId, deleted: true })
            : fail(gone.failure);
        }
        return notAllowed(["GET", "DELETE"], ctx.headers);
      }
    }
    return json(
      {
        error: {
          message: "Adresse inconnue.",
          type: "invalid_request_error",
          param: null,
          code: "unknown_url",
        },
      },
      404,
      ctx.headers,
    );
  } catch (error) {
    deps.log.error("rag : erreur interne", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return failureResponse(F.internal());
  }
}

export type { RagContext };
