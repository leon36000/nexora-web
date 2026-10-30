import { createHash } from "node:crypto";
import {
  and,
  apiKeys,
  type Database,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  ragDocuments,
  sql,
} from "@nexora/db";
import {
  type Chunk,
  chunkStorageBytes,
  chunkText,
  embeddingInput,
  ExtractError,
  extractText,
  insertChunksQuery,
  normalizeText,
} from "@nexora/rag";
import type { ApiKeyRow } from "../gateway/keys";
import { loadBase } from "./bases";
import { embedTexts } from "./embed";
import { F, type RagFailure } from "./failure";
import { bad, good, type Result } from "./result";
import type { RagDeps } from "./types";

type DocRow = typeof ragDocuments.$inferSelect;

export interface DocumentView {
  id: string;
  base_id: string;
  title: string;
  source: string | null;
  content_type: string | null;
  status: DocRow["status"];
  error: string | null;
  characters: number;
  chunks: number;
  chunks_total: number;
  bytes: number;
  metadata: Record<string, string | number | boolean>;
  created_at: string;
}

export const toDocumentView = (d: DocRow): DocumentView => ({
  id: d.id,
  base_id: d.baseId,
  title: d.title,
  source: d.source,
  content_type: d.contentType,
  status: d.status,
  error: d.errorCode,
  characters: d.textChars,
  chunks: d.chunksDone,
  chunks_total: d.chunksTotal,
  bytes: d.storedBytes,
  metadata: d.metadata,
  created_at: d.createdAt.toISOString(),
});

export interface AddInput {
  baseId: string;
  title?: string;
  filename?: string;
  contentType?: string;
  bytes?: Uint8Array;
  text?: string;
  source?: string;
  metadata?: Record<string, string | number | boolean>;
}
export interface Caller {
  organizationId: string;
  /** Clé facturée pour l'embedding (celle du client, ou celle de la base pour les appels du compte et du worker). */
  key: ApiKeyRow;
}

const CLAIM_MS = 60_000;
const isUniqueViolation = (e: unknown): boolean => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
};
const isForeignKeyViolation = (e: unknown): boolean => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23503" || err?.cause?.code === "23503";
};

function validMetadata(deps: RagDeps, metadata: unknown): Record<string, string | number | boolean> | RagFailure {
  if (metadata === undefined) return {};
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata))
    return F.invalid("« metadata » doit être un objet de valeurs simples.", "metadata");
  const entries = Object.entries(metadata);
  if (entries.length > 20) return F.invalid("« metadata » compte au plus 20 champs.", "metadata");
  for (const [k, v] of entries)
    if (k.length > 64 || !(typeof v === "string" || typeof v === "number" || typeof v === "boolean") || (typeof v === "number" && !Number.isFinite(v)))
      return F.invalid("« metadata » n'accepte que des textes, nombres et booléens (clés de 64 caractères au plus).", "metadata");
  if (Buffer.byteLength(JSON.stringify(metadata)) > deps.config.maxMetadataBytes)
    return F.invalid(`« metadata » dépasse ${deps.config.maxMetadataBytes} octets.`, "metadata");
  return metadata as Record<string, string | number | boolean>;
}

export async function addDocument(deps: RagDeps, ctx: Caller, input: AddInput): Promise<Result<{ document: DocumentView; duplicate: boolean }>> {
  const db = deps.db();
  const cfg = deps.config;
  const base = await loadBase(db, ctx.organizationId, input.baseId);
  if (!base) return bad(F.baseNotFound());

  // 1. Texte du document.
  let text: string;
  let title: string | null = input.title?.trim() || null;
  let pageStarts: number[] | null = null;
  if (input.bytes) {
    try {
      const out = await extractText(
        { filename: input.filename ?? null, contentType: input.contentType ?? null, bytes: input.bytes },
        { maxBytes: cfg.maxFileBytes, maxChars: cfg.maxTextChars, maxPages: cfg.maxPdfPages },
      );
      text = out.text;
      pageStarts = out.pageStarts;
      title ??= out.title ?? input.filename ?? null;
    } catch (error) {
      if (!(error instanceof ExtractError)) throw error;
      if (error.code === "too_large") return bad(F.tooLarge(error.message));
      if (error.code === "unsupported_type") return bad(F.unsupportedType(error.message));
      return bad(F.unprocessable(error.message, error.code === "empty" ? "empty_document" : "unreadable_document"));
    }
  } else if (typeof input.text === "string") {
    if (input.text.length > cfg.maxTextChars)
      return bad(F.tooLarge(`Le texte dépasse ${cfg.maxTextChars.toLocaleString("fr-CA")} caractères.`));
    text = normalizeText(input.text);
    if (text.trim().length === 0) return bad(F.invalid("Le texte du document est vide.", "text"));
  } else return bad(F.invalid("Fournissez « text » ou un fichier.", "text"));
  title = (title ?? "Sans titre").slice(0, 200);
  const metadata = validMetadata(deps, input.metadata);
  if ("code" in metadata) return bad(metadata);
  const source = (input.source ?? input.filename ?? null)?.slice(0, 500) ?? null;

  // 2. Même contenu déjà dans la base : rien à refaire, rien à payer.
  const hash = createHash("sha256").update(text).digest("hex");
  const [existing] = await db
    .select()
    .from(ragDocuments)
    .where(and(eq(ragDocuments.baseId, base.id), eq(ragDocuments.contentHash, hash)));
  if (existing && existing.status !== "failed") return good({ document: toDocumentView(existing), duplicate: true });
  if (existing)
    await db.delete(ragDocuments).where(eq(ragDocuments.id, existing.id));

  // 3. Découpage, limites, espace estimé (exactement ce qui sera stocké).
  const chunks = chunkText(text, { maxChars: base.chunkChars, overlapChars: base.chunkOverlap });
  if (chunks.length === 0) return bad(F.invalid("Le document ne contient aucun texte utilisable.", "text"));
  if (chunks.length > cfg.maxChunksPerDoc)
    return bad(F.tooLarge(`Ce document donne ${chunks.length} extraits ; la limite est de ${cfg.maxChunksPerDoc}. Découpez-le en plusieurs documents.`));
  const [usage] = await db
    .select({ docs: sql<number>`count(*)::int`, chunks: sql<number>`COALESCE(sum(${ragDocuments.chunksTotal}), 0)::int` })
    .from(ragDocuments)
    .where(eq(ragDocuments.baseId, base.id));
  if ((usage?.docs ?? 0) >= cfg.maxDocsPerBase)
    return bad(F.limit("base_full", `Cette base contient déjà le maximum de ${cfg.maxDocsPerBase} documents.`));
  if ((usage?.chunks ?? 0) + chunks.length > cfg.maxChunksPerBase)
    return bad(F.limit("base_full", `Cette base atteindrait la limite de ${cfg.maxChunksPerBase.toLocaleString("fr-CA")} extraits. Créez une autre base ou supprimez des documents.`));
  const estimate = chunks.reduce((s, c) => s + chunkStorageBytes(c.text), 0);

  // 4. Le document est enregistré (texte en attente), puis l'espace est réservé.
  let row: DocRow | undefined;
  try {
    [row] = await db
      .insert(ragDocuments)
      .values({
        baseId: base.id,
        organizationId: base.organizationId,
        title,
        source,
        contentType: input.contentType?.slice(0, 100) ?? null,
        status: "queued",
        textChars: text.length,
        chunksTotal: chunks.length,
        pendingText: text,
        pendingPages: pageStarts,
        metadata,
        contentHash: hash,
        storedBytes: estimate,
        createdByKey: ctx.key.id,
      })
      .returning();
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const [again] = await db
      .select()
      .from(ragDocuments)
      .where(and(eq(ragDocuments.baseId, base.id), eq(ragDocuments.contentHash, hash)));
    if (again) return good({ document: toDocumentView(again), duplicate: true });
    throw error;
  }
  if (!row) throw new Error("document non créé");
  const reserved = await deps.storage.record(base.organizationId, estimate);
  if (!reserved.ok) {
    await db.delete(ragDocuments).where(eq(ragDocuments.id, row.id));
    return bad(F.quotaExceeded());
  }

  // 5. Indexation : sur-le-champ si c'est court, sinon par le worker.
  const queue = () =>
    deps.enqueue({ type: "rag.index", payload: { documentId: row.id }, idempotencyKey: `rag-index:${row.id}:0` });
  if (chunks.length > cfg.inlineMaxChunks) {
    await queue();
    return good({ document: toDocumentView(row), duplicate: false });
  }
  const outcome = await indexSlice(deps, ctx.key, row.id, { budgetMs: cfg.sliceMs });
  if (outcome.state === "ready") return good({ document: outcome.document, duplicate: false });
  if (outcome.state === "failed") {
    // Rien n'est gardé d'un ajout refusé : la ligne « échouée » ne sert qu'aux indexations faites par le worker.
    await db.delete(ragDocuments).where(eq(ragDocuments.id, row.id));
    return bad(outcome.failure);
  }
  await queue();
  const [current] = await db.select().from(ragDocuments).where(eq(ragDocuments.id, row.id));
  return good({ document: toDocumentView(current ?? row), duplicate: false });
}

export type SliceOutcome =
  | { state: "ready"; document: DocumentView }
  | { state: "partial" }
  | { state: "retry"; afterSeconds: number; failure: RagFailure }
  | { state: "failed"; failure: RagFailure }
  /** Une autre tranche travaille sur ce document. */
  | { state: "busy" }
  /** Document supprimé ou déjà prêt : rien à faire. */
  | { state: "gone" };

const pageOf = (starts: number[] | null, offset: number): number | null => {
  if (!starts || starts.length === 0) return null;
  let page = 1;
  for (let i = 0; i < starts.length; i++) if ((starts[i] ?? 0) <= offset) page = i + 1;
  return page;
};

/** Abandonne définitivement un document : extraits purgés, texte effacé, espace rendu. L'erreur est un code, jamais un contenu. */
async function failDocument(deps: RagDeps, doc: DocRow, code: string): Promise<void> {
  const db = deps.db();
  await db.transaction(async (tx) => {
    await tx.execute(sql`delete from "rag_chunks" where "document_id" = ${doc.id} and "organization_id" = ${doc.organizationId}`);
    await tx
      .update(ragDocuments)
      .set({ status: "failed", errorCode: code, pendingText: null, pendingPages: null, storedBytes: 0, chunksDone: 0, claimedUntil: null, updatedAt: deps.now() })
      .where(eq(ragDocuments.id, doc.id));
  });
  if (doc.storedBytes > 0) await deps.storage.record(doc.organizationId, -doc.storedBytes);
}

/**
 * Indexe une TRANCHE d'un document (reprenable) : plusieurs lots d'extraits embarqués par la passerelle, chacun inséré
 * avec l'avancement dans une seule transaction. Un arrêt entre deux lots ne perd rien et ne facture jamais deux fois
 * le même lot. Une réservation (`claimed_until`) empêche deux tranches simultanées.
 */
export async function indexSlice(
  deps: RagDeps,
  key: ApiKeyRow,
  documentId: string,
  options: { budgetMs: number },
): Promise<SliceOutcome> {
  const db = deps.db();
  const now = deps.now();
  const [doc] = await db
    .update(ragDocuments)
    .set({ status: "indexing", claimedUntil: new Date(now.getTime() + CLAIM_MS), updatedAt: now })
    .where(
      and(
        eq(ragDocuments.id, documentId),
        inArray(ragDocuments.status, ["queued", "indexing"]),
        or(isNull(ragDocuments.claimedUntil), lt(ragDocuments.claimedUntil, now)),
      ),
    )
    .returning();
  if (!doc) {
    const [other] = await db.select({ status: ragDocuments.status }).from(ragDocuments).where(eq(ragDocuments.id, documentId));
    return other && (other.status === "queued" || other.status === "indexing") ? { state: "busy" } : { state: "gone" };
  }
  const release = () =>
    db.update(ragDocuments).set({ status: "queued", claimedUntil: null, updatedAt: deps.now() }).where(eq(ragDocuments.id, doc.id));

  const base = await loadBase(db, doc.organizationId, doc.baseId);
  if (!base) return { state: "gone" };
  if (doc.pendingText === null) {
    await failDocument(deps, doc, "text_lost");
    return { state: "failed", failure: F.internal() };
  }
  const chunks: Chunk[] = chunkText(doc.pendingText, { maxChars: base.chunkChars, overlapChars: base.chunkOverlap });
  if (chunks.length !== doc.chunksTotal) {
    await failDocument(deps, doc, "chunking_changed");
    return { state: "failed", failure: F.internal() };
  }
  const deadline = Date.now() + options.budgetMs;
  let done = doc.chunksDone;
  while (done < chunks.length) {
    const batch = chunks.slice(done, done + deps.config.embedBatch);
    const embedded = await embedTexts(deps, key, base.embeddingModel, batch.map(embeddingInput));
    if (!embedded.ok) {
      const failure = embedded.failure;
      if (failure.transient) {
        await release();
        return { state: "retry", afterSeconds: failure.retryAfterSeconds ?? 30, failure };
      }
      await failDocument(deps, doc, failure.code);
      return { state: "failed", failure };
    }
    try {
      await db.transaction(async (tx) => {
        await tx.execute(
          insertChunksQuery(
            batch.map((c, i) => ({
              documentId: doc.id,
              baseId: base.id,
              organizationId: doc.organizationId,
              ord: c.index,
              content: c.text,
              heading: c.heading,
              startChar: c.start,
              endChar: c.end,
              page: pageOf(doc.pendingPages, c.start),
              vector: embedded.value.vectors[i] as number[],
            })),
          ),
        );
        await tx
          .update(ragDocuments)
          .set({ chunksDone: done + batch.length, claimedUntil: new Date(Date.now() + CLAIM_MS), updatedAt: deps.now() })
          .where(eq(ragDocuments.id, doc.id));
      });
    } catch (error) {
      // Document supprimé pendant l'indexation : rien à garder.
      if (isForeignKeyViolation(error)) return { state: "gone" };
      throw error;
    }
    done += batch.length;
    if (done < chunks.length && Date.now() >= deadline) {
      await release();
      return { state: "partial" };
    }
  }
  const [ready] = await db
    .update(ragDocuments)
    .set({ status: "ready", pendingText: null, pendingPages: null, errorCode: null, claimedUntil: null, updatedAt: deps.now() })
    .where(eq(ragDocuments.id, doc.id))
    .returning();
  if (!ready) return { state: "gone" };
  deps.log.info("rag : document indexé", { documentId: doc.id, baseId: base.id, organizationId: doc.organizationId, chunks: chunks.length });
  return { state: "ready", document: toDocumentView(ready) };
}

export async function getDocument(deps: RagDeps, organizationId: string, baseId: string, documentId: string): Promise<Result<DocumentView>> {
  const db = deps.db();
  if (!(await loadBase(db, organizationId, baseId))) return bad(F.baseNotFound());
  if (!/^[0-9a-f-]{36}$/.test(documentId)) return bad(F.documentNotFound());
  const [row] = await db
    .select()
    .from(ragDocuments)
    .where(and(eq(ragDocuments.id, documentId), eq(ragDocuments.baseId, baseId), eq(ragDocuments.organizationId, organizationId)));
  return row ? good(toDocumentView(row)) : bad(F.documentNotFound());
}

export async function listDocuments(
  deps: RagDeps,
  organizationId: string,
  baseId: string,
  options: { limit?: number; cursor?: string },
): Promise<Result<{ data: DocumentView[]; next: string | null }>> {
  const db = deps.db();
  if (!(await loadBase(db, organizationId, baseId))) return bad(F.baseNotFound());
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  let after: { at: Date; id: string } | null = null;
  if (options.cursor) {
    const [iso, id] = Buffer.from(options.cursor, "base64url").toString("utf8").split("|");
    const at = new Date(iso ?? "");
    if (!id || !/^[0-9a-f-]{36}$/.test(id) || Number.isNaN(at.getTime()))
      return bad(F.invalid("Curseur invalide.", "cursor"));
    after = { at, id };
  }
  const rows = await db
    .select()
    .from(ragDocuments)
    .where(
      and(
        eq(ragDocuments.baseId, baseId),
        eq(ragDocuments.organizationId, organizationId),
        after ? sql`(${ragDocuments.createdAt}, ${ragDocuments.id}) < (${after.at}, ${after.id})` : undefined,
      ),
    )
    .orderBy(desc(ragDocuments.createdAt), desc(ragDocuments.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return good({
    data: page.map(toDocumentView),
    next: rows.length > limit && last ? Buffer.from(`${last.createdAt.toISOString()}|${last.id}`).toString("base64url") : null,
  });
}

export async function deleteDocument(deps: RagDeps, organizationId: string, baseId: string, documentId: string): Promise<Result<{ releasedBytes: number }>> {
  const db = deps.db();
  if (!(await loadBase(db, organizationId, baseId))) return bad(F.baseNotFound());
  if (!/^[0-9a-f-]{36}$/.test(documentId)) return bad(F.documentNotFound());
  const [row] = await db
    .delete(ragDocuments)
    .where(and(eq(ragDocuments.id, documentId), eq(ragDocuments.baseId, baseId), eq(ragDocuments.organizationId, organizationId)))
    .returning({ bytes: ragDocuments.storedBytes });
  if (!row) return bad(F.documentNotFound());
  if (row.bytes > 0) await deps.storage.record(organizationId, -row.bytes);
  return good({ releasedBytes: row.bytes });
}

/**
 * Clé à facturer pour un appel qui n'arrive pas avec la clé du client (compte, worker) : celle qui a ajouté le document
 * si elle est encore valable, sinon la plus récente clé active qui nomme la base. `null` : aucune (409 `no_active_key`).
 */
export async function resolveBillingKey(deps: RagDeps, organizationId: string, baseId: string, preferKeyId?: string | null): Promise<ApiKeyRow | null> {
  const now = deps.now();
  const rows = await deps
    .db()
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.organizationId, organizationId), isNull(apiKeys.revokedAt), or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, now)), isNotNull(apiKeys.ragAccess)))
    .orderBy(desc(apiKeys.createdAt));
  const usable = rows.filter((k) => k.ragAccess?.bases.includes(baseId));
  return usable.find((k) => k.id === preferKeyId) ?? usable[0] ?? null;
}

