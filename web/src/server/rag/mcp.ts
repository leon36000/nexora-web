import { readLimitedBytes } from "@nexora/net";
import {
  authenticateRag,
  type RagContext,
  scopeCheck,
  writeCheck,
} from "./auth";
import { listBases } from "./bases";
import { addDocument, listDocuments } from "./documents";
import { F, failureResponse, type RagFailure } from "./failure";
import type { RagHttpDeps } from "./http";
import { searchBase } from "./search";

/**
 * Serveur MCP (transport « HTTP en flux », sans état) de `/v1/rag/mcp`. Une requête POST porte un message JSON-RPC (ou
 * un lot) et reçoit un `application/json`. Pas de flux serveur ni de session : GET répond 405, ce que la spécification
 * permet. Authentification : la clé `nxk_` du RAG en `Authorization: Bearer`. Trois outils : `rag_search`,
 * `rag_list_documents`, `rag_add_document`. Une erreur d'exploitation (solde, quota, droits) est un RÉSULTAT d'outil
 * (`isError`), pas une erreur de protocole, pour que l'agent la lise et agisse.
 */

const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"] as const;

interface RpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

const baseProperty = {
  type: "string",
  description:
    "Nom ou identifiant de la base. Facultatif si votre clé ne couvre qu'une base.",
};

const TOOLS = [
  {
    name: "rag_search",
    description:
      "Cherche dans la base de connaissances Nexora RAG les passages les plus pertinents pour une question (recherche sémantique et plein texte, reclassement). Rend les extraits avec leur document source, leur section et leur page.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "La question ou les mots à chercher.",
        },
        base: baseProperty,
        top_k: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          description: "Nombre d'extraits à rendre (défaut 5).",
        },
        rerank: {
          type: "boolean",
          description:
            "Reclasser les candidats (défaut oui ; coûte des jetons de reclassement).",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "rag_list_documents",
    description:
      "Liste les documents d'une base de connaissances Nexora RAG (titre, état, taille), du plus récent au plus ancien.",
    inputSchema: {
      type: "object",
      properties: {
        base: baseProperty,
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Nombre de documents (défaut 25).",
        },
        cursor: {
          type: "string",
          description: "Curseur rendu par un appel précédent.",
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "rag_add_document",
    description:
      "Ajoute un document texte (ou Markdown) à la base de connaissances Nexora RAG. Il est découpé, vectorisé et devient cherchable ; l'embedding est facturé en crédits et le texte compte dans l'espace de l'offre. Exige une clé avec le droit d'écriture.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Titre du document." },
        text: {
          type: "string",
          description: "Texte du document (Markdown accepté).",
        },
        base: baseProperty,
        source: {
          type: "string",
          description: "Origine du document (nom de fichier, adresse).",
        },
        metadata: {
          type: "object",
          description:
            "Champs simples (texte, nombre, booléen) à garder avec le document.",
        },
      },
      required: ["title", "text"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
] as const;

const rpcResult = (id: RpcMessage["id"], result: unknown) => ({
  jsonrpc: "2.0" as const,
  id: id ?? null,
  result,
});
const rpcError = (id: RpcMessage["id"], code: number, message: string) => ({
  jsonrpc: "2.0" as const,
  id: id ?? null,
  error: { code, message },
});
const toolError = (id: RpcMessage["id"], message: string) =>
  rpcResult(id, { isError: true, content: [{ type: "text", text: message }] });

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Base visée : `base` (nom exact ou identifiant), sinon l'unique base de la portée de la clé. */
async function resolveBase(
  deps: RagHttpDeps,
  ctx: RagContext,
  wanted: unknown,
): Promise<{ ok: true; baseId: string } | { ok: false; message: string }> {
  const bases = await listBases(deps, ctx.organizationId);
  const inScope = bases.filter((b) => ctx.baseIds.includes(b.id));
  if (typeof wanted === "string" && wanted.trim()) {
    const w = wanted.trim();
    const found =
      inScope.find((b) => b.id === w) ??
      inScope.find((b) => b.name === w) ??
      inScope.find((b) => b.name.toLowerCase() === w.toLowerCase());
    if (!found)
      return {
        ok: false,
        message: `Base introuvable : « ${w.slice(0, 80)} ». Bases accessibles avec cette clé : ${inScope.map((b) => `« ${b.name} »`).join(", ") || "aucune"}.`,
      };
    return { ok: true, baseId: found.id };
  }
  if (inScope.length === 1)
    return { ok: true, baseId: (inScope[0] as { id: string }).id };
  return {
    ok: false,
    message: `Précisez la base (paramètre « base »). Bases accessibles : ${inScope.map((b) => `« ${b.name} »`).join(", ") || "aucune"}.`,
  };
}

const formatFailure = (f: RagFailure) => f.message;

async function callTool(
  deps: RagHttpDeps,
  ctx: RagContext,
  id: RpcMessage["id"],
  name: string,
  args: Record<string, unknown>,
) {
  const caller = { organizationId: ctx.organizationId, key: ctx.key };
  const resolved = await resolveBase(deps, ctx, args.base);
  if (!resolved.ok) return toolError(id, resolved.message);
  const baseId = resolved.baseId;
  const outOfScope = scopeCheck(ctx, baseId);
  if (outOfScope) return toolError(id, formatFailure(outOfScope));

  if (name === "rag_search") {
    if (typeof args.query !== "string")
      return toolError(id, "Le paramètre « query » (texte) est obligatoire.");
    const res = await searchBase(deps, caller, {
      baseId,
      query: args.query,
      topK: typeof args.top_k === "number" ? args.top_k : undefined,
      rerank: typeof args.rerank === "boolean" ? args.rerank : undefined,
    });
    if (!res.ok) return toolError(id, formatFailure(res.failure));
    const { data } = res.value;
    const text =
      data.length === 0
        ? "Aucun passage trouvé dans cette base."
        : data
            .map((h, i) => {
              const where = [h.heading, h.page ? `p. ${h.page}` : null]
                .filter(Boolean)
                .join(", ");
              return `[${i + 1}] « ${h.document_title} »${where ? ` (${where})` : ""}${h.source ? ` — ${h.source}` : ""} — pertinence ${h.score.toFixed(3)}\n${h.text}`;
            })
            .join("\n\n---\n\n");
    return rpcResult(id, {
      content: [{ type: "text", text }],
      structuredContent: {
        results: data,
        rerank: res.value.rerank,
        usage: res.value.usage,
      },
    });
  }

  if (name === "rag_list_documents") {
    const list = await listDocuments(deps, ctx.organizationId, baseId, {
      limit: typeof args.limit === "number" ? args.limit : 25,
      cursor: typeof args.cursor === "string" ? args.cursor : undefined,
    });
    if (!list.ok) return toolError(id, formatFailure(list.failure));
    const text =
      list.value.data.length === 0
        ? "Cette base ne contient aucun document."
        : list.value.data
            .map(
              (d) =>
                `- « ${d.title} » — ${d.status}${d.status === "ready" ? `, ${d.chunks} extraits` : ""} (id ${d.id})`,
            )
            .join("\n") +
          (list.value.next ? `\n\nSuite : cursor = ${list.value.next}` : "");
    return rpcResult(id, {
      content: [{ type: "text", text }],
      structuredContent: { documents: list.value.data, next: list.value.next },
    });
  }

  // rag_add_document
  const denied = writeCheck(ctx);
  if (denied) return toolError(id, formatFailure(denied));
  if (typeof args.text !== "string" || typeof args.title !== "string")
    return toolError(
      id,
      "Les paramètres « title » et « text » (textes) sont obligatoires.",
    );
  const added = await addDocument(deps, caller, {
    baseId,
    title: args.title,
    text: args.text,
    source: typeof args.source === "string" ? args.source : undefined,
    metadata: isObject(args.metadata)
      ? (args.metadata as Record<string, string | number | boolean>)
      : undefined,
  });
  if (!added.ok) return toolError(id, formatFailure(added.failure));
  const { document, duplicate } = added.value;
  const text = duplicate
    ? `Ce contenu est déjà dans la base : « ${document.title} » (id ${document.id}). Rien n'a été facturé.`
    : document.status === "ready"
      ? `Document « ${document.title} » ajouté et cherchable (id ${document.id}, ${document.chunks} extraits).`
      : `Document « ${document.title} » reçu (id ${document.id}) : l'indexation se poursuit en arrière-plan.`;
  return rpcResult(id, {
    content: [{ type: "text", text }],
    structuredContent: { document, duplicate },
  });
}

async function handleMessage(
  deps: RagHttpDeps,
  ctx: RagContext,
  message: RpcMessage,
): Promise<ReturnType<typeof rpcResult> | ReturnType<typeof rpcError> | null> {
  const { id, method } = message;
  if (message.jsonrpc !== "2.0" || typeof method !== "string")
    return rpcError(id, -32600, "Requête JSON-RPC invalide.");
  // Une notification (sans id) n'appelle pas de réponse.
  if (id === undefined) return null;
  const params = isObject(message.params) ? message.params : {};
  switch (method) {
    case "initialize": {
      const asked =
        typeof params.protocolVersion === "string"
          ? params.protocolVersion
          : "";
      const version = (SUPPORTED_VERSIONS as readonly string[]).includes(asked)
        ? asked
        : SUPPORTED_VERSIONS[0];
      return rpcResult(id, {
        protocolVersion: version,
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: "nexora-rag",
          title: "Nexora RAG",
          version: "1.0.0",
        },
        instructions:
          "Base de connaissances Nexora RAG. Utilisez rag_search pour retrouver des passages dans les documents du client, rag_list_documents pour voir ce qui est indexé et rag_add_document pour ajouter un texte. Citez le document source de chaque extrait.",
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: TOOLS });
    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      if (!TOOLS.some((t) => t.name === name))
        return rpcError(id, -32602, `Outil inconnu : ${name.slice(0, 60)}.`);
      const args = isObject(params.arguments) ? params.arguments : {};
      try {
        return await callTool(deps, ctx, id, name, args);
      } catch (error) {
        deps.log.error("rag : erreur d'outil MCP", {
          tool: name,
          errorName: error instanceof Error ? error.name : typeof error,
        });
        return toolError(id, F.internal().message);
      }
    }
    default:
      return rpcError(id, -32601, `Méthode inconnue : ${method.slice(0, 60)}.`);
  }
}

export async function handleMcp(
  request: Request,
  deps: RagHttpDeps,
): Promise<Response> {
  const noStore = { "cache-control": "no-store" };
  if (request.method !== "POST")
    return Response.json(
      {
        error: {
          message: "Ce serveur MCP n'ouvre pas de flux : utilisez POST.",
          type: "invalid_request_error",
          param: null,
          code: "method_not_allowed",
        },
      },
      { status: 405, headers: { ...noStore, allow: "POST" } },
    );
  // Contre le rebond DNS : une requête de navigateur n'est admise que depuis une origine approuvée.
  const origin = request.headers.get("origin");
  if (origin && !deps.allowedOrigins.includes(origin))
    return failureResponse({
      status: 403,
      code: "forbidden_origin",
      message: "Origine non approuvée.",
      type: "permission_error",
      param: null,
      transient: false,
    });
  try {
    const auth = await authenticateRag(request, deps);
    if (!auth.ok) return auth.response;
    const { ctx } = auth;
    const read = await readLimitedBytes(request, deps.config.maxBodyBytes);
    if (!read.ok)
      return Response.json(rpcError(null, -32600, "Message trop volumineux."), {
        status: 413,
        headers: { ...noStore, ...ctx.headers },
      });
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(read.bytes));
    } catch {
      return Response.json(rpcError(null, -32700, "JSON invalide."), {
        status: 400,
        headers: { ...noStore, ...ctx.headers },
      });
    }
    const respond = (payload: unknown) =>
      Response.json(payload, { headers: { ...noStore, ...ctx.headers } });
    if (Array.isArray(body)) {
      if (body.length === 0 || body.length > 20)
        return respond(rpcError(null, -32600, "Lot vide ou trop long."));
      const out = [];
      for (const m of body) {
        const r = await handleMessage(deps, ctx, isObject(m) ? m : {});
        if (r) out.push(r);
      }
      return out.length === 0
        ? new Response(null, { status: 202, headers: ctx.headers })
        : respond(out);
    }
    const reply = await handleMessage(deps, ctx, isObject(body) ? body : {});
    return reply
      ? respond(reply)
      : new Response(null, { status: 202, headers: ctx.headers });
  } catch (error) {
    deps.log.error("rag : erreur MCP", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return Response.json(rpcError(null, -32603, "Erreur interne."), {
      status: 500,
      headers: noStore,
    });
  }
}
