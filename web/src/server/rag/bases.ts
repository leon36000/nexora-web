import {
  and,
  apiKeys,
  type Database,
  desc,
  eq,
  inArray,
  isNull,
  type RagAccess,
  type RagKeyMode,
  ragBases,
  ragDocuments,
  sql,
} from "@nexora/db";
import { embeddingProfile, SUPPORTED_EMBEDDING_MODELS } from "@nexora/rag";
import { getPublishedCatalog } from "../gateway/catalog";
import {
  ApiKeyInputError,
  ApiKeyLimitError,
  createApiKey,
  MAX_ACTIVE_KEYS_PER_ORGANIZATION,
} from "../gateway/keys";
import { F, type RagFailure } from "./failure";
import { bad, good, type Result } from "./result";
import type { RagDeps } from "./types";

export type BaseRow = typeof ragBases.$inferSelect;

export interface BaseStats {
  documents: number;
  ready: number;
  pending: number;
  failed: number;
  chunks: number;
  bytes: number;
}
export type BaseView = BaseRow & { stats: BaseStats };

const EMPTY_STATS: BaseStats = {
  documents: 0,
  ready: 0,
  pending: 0,
  failed: 0,
  chunks: 0,
  bytes: 0,
};

export interface CreateBaseInput {
  organizationId: string;
  userId: string | null;
  name: string;
  description?: string | null;
  embeddingModel?: string;
  /** `undefined` : modèle par défaut s'il est disponible ; `null` : aucun reclassement. */
  rerankModel?: string | null;
  chunkChars?: number;
  chunkOverlap?: number;
}

const isUniqueViolation = (e: unknown): boolean => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
};

/** Modèles « appelables » du catalogue publié (identifiant → type). */
async function liveModels(db: Database): Promise<Map<string, string> | null> {
  const version = await getPublishedCatalog(db);
  if (!version) return null;
  return new Map(
    version.snapshot.models
      .filter((m) => m.availability !== "preview")
      .map((m) => [m.publicId, m.kind]),
  );
}

async function createBaseIn(
  deps: RagDeps,
  db: Database,
  input: CreateBaseInput,
): Promise<Result<BaseRow>> {
  const name = input.name?.trim() ?? "";
  if (name.length < 1 || name.length > 80)
    return bad(F.invalid("Le nom de la base doit compter de 1 à 80 caractères.", "name"));
  const description = input.description?.trim() || null;
  if (description && description.length > 500)
    return bad(F.invalid("La description compte au plus 500 caractères.", "description"));
  const embeddingModel = input.embeddingModel ?? deps.config.defaultEmbeddingModel;
  if (!embeddingProfile(embeddingModel))
    return bad({
      ...F.invalid(
        `Modèle d'embedding non pris en charge. Modèles possibles : ${SUPPORTED_EMBEDDING_MODELS.join(", ")}.`,
        "embedding_model",
      ),
      code: "unsupported_embedding_model",
      status: 422,
    });
  const chunkChars = input.chunkChars ?? 3200;
  const chunkOverlap = input.chunkOverlap ?? 400;
  if (
    !Number.isInteger(chunkChars) ||
    chunkChars < 200 ||
    chunkChars > 8000 ||
    !Number.isInteger(chunkOverlap) ||
    chunkOverlap < 0 ||
    chunkOverlap > chunkChars / 2
  )
    return bad(
      F.invalid(
        "Découpage invalide : la taille des extraits doit être de 200 à 8000 caractères, le chevauchement de 0 à la moitié de cette taille.",
        "chunk_chars",
      ),
    );

  const live = await liveModels(db);
  if (!live)
    return bad(F.unavailable("Le catalogue de modèles n'est pas encore publié : le RAG n'est pas disponible."));
  if (live.get(embeddingModel) !== "embedding")
    return bad(
      F.modelUnavailable(
        "Le modèle d'embedding de cette base n'est pas encore disponible à l'appel. Réessayez plus tard.",
      ),
    );
  let rerankModel: string | null;
  if (input.rerankModel === undefined) {
    const wanted = deps.config.defaultRerankModel;
    rerankModel = wanted && live.get(wanted) === "rerank" ? wanted : null;
  } else if (input.rerankModel === null) rerankModel = null;
  else {
    if (live.get(input.rerankModel) !== "rerank")
      return bad(F.modelUnavailable("Le modèle de reclassement demandé n'est pas disponible."));
    rerankModel = input.rerankModel;
  }

  try {
    return await db.transaction(async (tx) => {
      const d = tx as unknown as Database;
      // Un verrou par organisation : le décompte et l'insertion ne se chevauchent pas.
      await d.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`rag-bases:${input.organizationId}`}))`);
      const [n] = await d
        .select({ n: sql<number>`count(*)::int` })
        .from(ragBases)
        .where(eq(ragBases.organizationId, input.organizationId));
      if ((n?.n ?? 0) >= deps.config.maxBasesPerOrg)
        return bad(
          F.limit(
            "base_limit",
            `Vous avez atteint le maximum de ${deps.config.maxBasesPerOrg} bases. Supprimez une base inutilisée ou contactez-nous pour augmenter la limite.`,
          ),
        );
      const [row] = await d
        .insert(ragBases)
        .values({
          organizationId: input.organizationId,
          name,
          description,
          embeddingModel,
          rerankModel,
          chunkChars,
          chunkOverlap,
          createdBy: input.userId,
        })
        .returning();
      if (!row) throw new Error("base non créée");
      return good(row);
    });
  } catch (error) {
    if (isUniqueViolation(error))
      return bad(F.conflict("base_exists", "Une base porte déjà ce nom dans votre organisation."));
    throw error;
  }
}

export function createBase(deps: RagDeps, input: CreateBaseInput): Promise<Result<BaseRow>> {
  return createBaseIn(deps, deps.db(), input);
}

export interface CreatedKey {
  id: string;
  /** Valeur de la clé : montrée UNE fois, jamais relisible (seule son empreinte est conservée). */
  key: string;
  prefix: string;
}

async function createRagKeyIn(
  deps: RagDeps,
  db: Database,
  input: {
    organizationId: string;
    baseIds: string[];
    mode: RagKeyMode;
    name: string;
    createdBy?: string | null;
    expiresAt?: Date | null;
  },
): Promise<Result<CreatedKey>> {
  const ids = [...new Set(input.baseIds)];
  if (ids.length === 0 || ids.length > 20)
    return bad(F.invalid("Choisissez de 1 à 20 bases pour cette clé.", "bases"));
  const rows = await db
    .select()
    .from(ragBases)
    .where(
      and(
        eq(ragBases.organizationId, input.organizationId),
        inArray(ragBases.id, ids),
      ),
    );
  // Une base d'une autre organisation (ou inexistante) n'est jamais distinguée : même réponse.
  if (rows.length !== ids.length) return bad(F.baseNotFound());
  const models = new Set<string>();
  for (const b of rows) {
    models.add(b.embeddingModel);
    if (b.rerankModel) models.add(b.rerankModel);
  }
  const access: RagAccess = { bases: ids, mode: input.mode };
  try {
    const created = await createApiKey(db, {
      organizationId: input.organizationId,
      name: input.name.trim().slice(0, 80) || "Clé RAG",
      ragAccess: access,
      // La clé ne sert qu'aux modèles de ses bases : elle ne peut pas appeler un modèle de conversation.
      allowedModels: [...models],
      rpmLimit: deps.config.keyRpm,
      tpmLimit: deps.config.keyTpm,
      expiresAt: input.expiresAt ?? null,
      createdBy: input.createdBy ?? null,
      maxActiveKeys: MAX_ACTIVE_KEYS_PER_ORGANIZATION,
    });
    return good({ id: created.record.id, key: created.key, prefix: created.record.prefix });
  } catch (error) {
    if (error instanceof ApiKeyLimitError)
      return bad(
        F.limit(
          "key_limit",
          `Vous avez atteint le maximum de ${error.limit} clés actives. Révoquez une clé inutilisée.`,
        ),
      );
    if (error instanceof ApiKeyInputError)
      return bad(F.invalid("Clé invalide.", error.field));
    throw error;
  }
}

export function createRagKey(
  deps: RagDeps,
  input: {
    organizationId: string;
    baseIds: string[];
    mode: RagKeyMode;
    name: string;
    createdBy?: string | null;
    expiresAt?: Date | null;
  },
): Promise<Result<CreatedKey>> {
  return createRagKeyIn(deps, deps.db(), input);
}

/** Sert à annuler la transaction de `createBaseWithKey` en gardant l'échec précis de la clé. */
class KeyRefused extends Error {
  readonly failure: RagFailure;
  constructor(failure: RagFailure) {
    super("clé refusée");
    this.failure = failure;
  }
}

/** « En un clic » : la base ET sa clé dédiée (lecture et écriture, limitée à cette base), dans une seule transaction. */
export async function createBaseWithKey(
  deps: RagDeps,
  input: CreateBaseInput & { keyName?: string },
): Promise<Result<{ base: BaseRow; key: string; keyId: string; keyPrefix: string }>> {
  try {
    return await deps.db().transaction(async (tx) => {
      const d = tx as unknown as Database;
      const base = await createBaseIn(deps, d, input);
      if (!base.ok) return base;
      const key = await createRagKeyIn(deps, d, {
        organizationId: input.organizationId,
        baseIds: [base.value.id],
        mode: "write",
        name: input.keyName ?? `RAG · ${base.value.name}`,
        createdBy: input.userId,
      });
      if (!key.ok) throw new KeyRefused(key.failure);
      return good({
        base: base.value,
        key: key.value.key,
        keyId: key.value.id,
        keyPrefix: key.value.prefix,
      });
    });
  } catch (error) {
    if (error instanceof KeyRefused) return bad(error.failure);
    throw error;
  }
}

async function statsFor(db: Database, organizationId: string, baseIds?: string[]): Promise<Map<string, BaseStats>> {
  const rows = await db.execute<{
    base_id: string;
    documents: number;
    ready: number;
    pending: number;
    failed: number;
    chunks: number;
    bytes: string;
  }>(sql`
    SELECT base_id,
      count(*)::int AS documents,
      (count(*) FILTER (WHERE status = 'ready'))::int AS ready,
      (count(*) FILTER (WHERE status IN ('queued', 'indexing')))::int AS pending,
      (count(*) FILTER (WHERE status = 'failed'))::int AS failed,
      COALESCE(sum(chunks_done), 0)::int AS chunks,
      COALESCE(sum(stored_bytes), 0)::bigint AS bytes
    FROM rag_documents
    WHERE organization_id = ${organizationId}
    ${baseIds ? sql`AND base_id IN (${sql.join(baseIds.map((b) => sql`${b}`), sql`, `)})` : sql``}
    GROUP BY base_id`);
  return new Map(
    [...rows].map((r) => [
      r.base_id,
      {
        documents: r.documents,
        ready: r.ready,
        pending: r.pending,
        failed: r.failed,
        chunks: r.chunks,
        bytes: Number(r.bytes),
      },
    ]),
  );
}

export async function listBases(deps: RagDeps, organizationId: string): Promise<BaseView[]> {
  const db = deps.db();
  const rows = await db
    .select()
    .from(ragBases)
    .where(eq(ragBases.organizationId, organizationId))
    .orderBy(desc(ragBases.createdAt));
  if (rows.length === 0) return [];
  const stats = await statsFor(db, organizationId);
  return rows.map((b) => ({ ...b, stats: stats.get(b.id) ?? EMPTY_STATS }));
}

/** Base de l'organisation, ou `base_not_found` — même réponse qu'elle n'existe pas ou qu'elle soit à quelqu'un d'autre. */
export async function loadBase(db: Database, organizationId: string, baseId: string): Promise<BaseRow | null> {
  if (!/^[0-9a-f-]{36}$/.test(baseId)) return null;
  const [row] = await db
    .select()
    .from(ragBases)
    .where(and(eq(ragBases.id, baseId), eq(ragBases.organizationId, organizationId)));
  return row ?? null;
}

export async function getBase(deps: RagDeps, organizationId: string, baseId: string): Promise<Result<BaseView>> {
  const db = deps.db();
  const base = await loadBase(db, organizationId, baseId);
  if (!base) return bad(F.baseNotFound());
  const stats = await statsFor(db, organizationId, [base.id]);
  return good({ ...base, stats: stats.get(base.id) ?? EMPTY_STATS });
}

export async function deleteBase(
  deps: RagDeps,
  organizationId: string,
  baseId: string,
): Promise<Result<{ releasedBytes: number }>> {
  const db = deps.db();
  const released = await db.transaction(async (tx): Promise<number | null> => {
    const d = tx as unknown as Database;
    const base = await loadBase(d, organizationId, baseId);
    if (!base) return null;
    const [sum] = await d
      .select({ bytes: sql<string>`COALESCE(sum(${ragDocuments.storedBytes}), 0)::bigint` })
      .from(ragDocuments)
      .where(and(eq(ragDocuments.baseId, baseId), eq(ragDocuments.organizationId, organizationId)));
    await d
      .delete(ragBases)
      .where(and(eq(ragBases.id, baseId), eq(ragBases.organizationId, organizationId)));
    // Les clés qui nommaient cette base ne la nomment plus ; sans base restante, elles sont révoquées.
    const keys = await d
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.organizationId, organizationId), isNull(apiKeys.revokedAt)));
    for (const k of keys) {
      if (!k.ragAccess?.bases.includes(baseId)) continue;
      const left = k.ragAccess.bases.filter((b) => b !== baseId);
      await d
        .update(apiKeys)
        .set(
          left.length === 0
            ? { revokedAt: deps.now(), ragAccess: { ...k.ragAccess, bases: [] } }
            : { ragAccess: { ...k.ragAccess, bases: left } },
        )
        .where(eq(apiKeys.id, k.id));
    }
    return Number(sum?.bytes ?? 0);
  });
  if (released === null) return bad(F.baseNotFound());
  if (released > 0) await deps.storage.record(organizationId, -released);
  return good({ releasedBytes: released });
}
