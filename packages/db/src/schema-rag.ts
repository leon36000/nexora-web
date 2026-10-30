import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  check,
  customType,
  halfvec,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./schema-auth.ts";
import { apiKeys } from "./schema-gateway.ts";

const ts = (name: string) => timestamp(name, { withTimezone: true });

/**
 * Nexora RAG managé : bases de connaissances par organisation, documents et extraits vectorisés (PostgreSQL +
 * pgvector). Approvisionnement LOGIQUE : une base est un espace de noms isolé par `organization_id` dans des tables
 * partagées (la phase 2 pourra isoler physiquement). Ces tables portent des identifiants clients et le contenu des
 * documents : elles vivent dans la base `app`, jamais dans Directus (D4). Les montants, le solde et le grand livre
 * sont ceux de la passerelle (embeddings et reclassement facturés en jetons).
 */

/** Dimension unique des vecteurs stockés : voir `packages/rag/src/vector.ts`. */
export const RAG_VECTOR_DIMS = 1024;

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

const inList = (values: readonly string[]) =>
  sql.raw(values.map((v) => `'${v}'`).join(", "));

export const RAG_DOCUMENT_STATUSES = [
  "queued",
  "indexing",
  "ready",
  "failed",
] as const;
export type RagDocumentStatus = (typeof RAG_DOCUMENT_STATUSES)[number];

/** Droits d'une clé RAG : `read` (rechercher, lister) ou `write` (en plus : ajouter et supprimer des documents). */
export const RAG_KEY_MODES = ["read", "write"] as const;
export type RagKeyMode = (typeof RAG_KEY_MODES)[number];
export type RagAccess = { bases: string[]; mode: RagKeyMode };

export const ragBases = pgTable(
  "rag_bases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description"),
    /** Identifiants publics du catalogue (`nexora/qwen3-embedding-8b`) ; le reclassement est facultatif. */
    embeddingModel: text("embedding_model").notNull(),
    rerankModel: text("rerank_model"),
    /** Découpage appliqué aux documents de cette base. */
    chunkChars: integer("chunk_chars").notNull().default(3200),
    chunkOverlap: integer("chunk_overlap").notNull().default(400),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("rag_bases_org_name_unique").on(t.organizationId, t.name),
    index("rag_bases_org_idx").on(t.organizationId, t.createdAt),
    check(
      "rag_bases_chunk_check",
      sql`${t.chunkChars} BETWEEN 200 AND 8000 AND ${t.chunkOverlap} BETWEEN 0 AND ${t.chunkChars} / 2`,
    ),
  ],
);

export const ragDocuments = pgTable(
  "rag_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    baseId: uuid("base_id")
      .notNull()
      .references(() => ragBases.id, { onDelete: "cascade" }),
    /** Copie de l'organisation de la base : toute requête filtre aussi sur elle (défense en profondeur). */
    organizationId: text("organization_id").notNull(),
    title: text("title").notNull(),
    /** Nom du fichier ou adresse d'origine, tel que fourni. */
    source: text("source"),
    contentType: text("content_type"),
    status: text("status").$type<RagDocumentStatus>().notNull(),
    /** Code d'erreur (jamais de contenu) quand l'indexation a échoué. */
    errorCode: text("error_code"),
    textChars: integer("text_chars").notNull().default(0),
    chunksTotal: integer("chunks_total").notNull().default(0),
    chunksDone: integer("chunks_done").notNull().default(0),
    /** Texte à indexer, conservé seulement tant que le document n'est pas prêt (puis effacé). */
    pendingText: text("pending_text"),
    /** Début de chaque page (PDF), pour citer la page d'un extrait pendant l'indexation. */
    pendingPages: jsonb("pending_pages").$type<number[] | null>(),
    metadata: jsonb("metadata")
      .$type<Record<string, string | number | boolean>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    contentHash: text("content_hash").notNull(),
    /** Réservation d'une tranche d'indexation (tâche en cours) : une autre tâche attend son échéance. */
    claimedUntil: ts("claimed_until"),
    /** Octets comptés dans le quota d'espace pour ce document (texte des extraits + vecteurs). */
    storedBytes: bigint("stored_bytes", { mode: "number" })
      .notNull()
      .default(0),
    createdByKey: uuid("created_by_key").references(() => apiKeys.id, {
      onDelete: "set null",
    }),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("rag_documents_hash_unique").on(t.baseId, t.contentHash),
    index("rag_documents_base_idx").on(t.baseId, t.createdAt, t.id),
    index("rag_documents_org_idx").on(t.organizationId),
    index("rag_documents_status_idx").on(t.status),
    check(
      "rag_documents_status_check",
      sql`${t.status} IN (${inList(RAG_DOCUMENT_STATUSES)})`,
    ),
    check("rag_documents_stored_nonneg", sql`${t.storedBytes} >= 0`),
  ],
);

export const ragChunks = pgTable(
  "rag_chunks",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => ragDocuments.id, { onDelete: "cascade" }),
    baseId: uuid("base_id")
      .notNull()
      .references(() => ragBases.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    ord: integer("ord").notNull(),
    content: text("content").notNull(),
    heading: text("heading"),
    startChar: integer("start_char").notNull(),
    endChar: integer("end_char").notNull(),
    page: smallint("page"),
    embedding: halfvec("embedding", { dimensions: RAG_VECTOR_DIMS }).notNull(),
    tsv: tsvector("tsv").generatedAlwaysAs(
      sql`to_tsvector('simple', coalesce("content", ''))`,
    ),
  },
  (t) => [
    uniqueIndex("rag_chunks_doc_ord_unique").on(t.documentId, t.ord),
    index("rag_chunks_base_idx").on(t.baseId),
    index("rag_chunks_org_idx").on(t.organizationId),
    index("rag_chunks_embedding_idx")
      .using("hnsw", t.embedding.op("halfvec_cosine_ops"))
      .with({ m: 16, ef_construction: 64 }),
    index("rag_chunks_tsv_idx").using("gin", t.tsv),
  ],
);
