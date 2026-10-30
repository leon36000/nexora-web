import { eq, ragDocuments } from "@nexora/db";
import { z } from "zod";
import { checkAdminAuth } from "../auth";
import { abandonDocument, indexSlice, resolveBillingKey } from "./documents";
import type { RagDeps } from "./types";

const body = z
  .object({
    documentId: z.uuid(),
    budgetMs: z.number().int().min(0).max(120_000).optional(),
  })
  .strict();

/**
 * `POST /api/admin/rag/index` : appelé par le worker (tâche `rag.index`) avec le jeton d'administration. Indexe UNE tranche
 * du document, facturée à la clé de la base (celle qui a ajouté le document si elle est encore valable). Le worker
 * relance la tranche suivante tant que la réponse est `partial`.
 */
export async function handleIndexJob(
  request: Request,
  deps: RagDeps & { adminToken: string | undefined },
): Promise<Response> {
  const headers = { "cache-control": "no-store" };
  const auth = checkAdminAuth(request, deps.adminToken);
  if (auth === "not_configured")
    return Response.json(
      { error: "admin_not_configured" },
      { status: 503, headers },
    );
  if (auth !== "ok")
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  let parsed: z.infer<typeof body>;
  try {
    const result = body.safeParse(await request.json());
    if (!result.success)
      return Response.json(
        { error: "invalid_request" },
        { status: 422, headers },
      );
    parsed = result.data;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 422, headers });
  }
  const db = deps.db();
  const [doc] = await db
    .select()
    .from(ragDocuments)
    .where(eq(ragDocuments.id, parsed.documentId));
  if (!doc || (doc.status !== "queued" && doc.status !== "indexing"))
    return Response.json({ state: "gone" }, { headers });
  const key = await resolveBillingKey(
    deps,
    doc.organizationId,
    doc.baseId,
    doc.createdByKey,
  );
  if (!key) {
    await abandonDocument(deps, doc.id, "no_active_key");
    return Response.json(
      { state: "failed", error: "no_active_key" },
      { headers },
    );
  }
  const out = await indexSlice(deps, key, doc.id, {
    budgetMs: parsed.budgetMs ?? deps.config.sliceMs,
  });
  switch (out.state) {
    case "retry":
      return Response.json(
        {
          state: "retry",
          afterSeconds: out.afterSeconds,
          error: out.failure.code,
        },
        { headers },
      );
    case "failed":
      return Response.json(
        { state: "failed", error: out.failure.code },
        { headers },
      );
    case "ready":
      return Response.json({ state: "ready" }, { headers });
    default:
      return Response.json({ state: out.state }, { headers });
  }
}
