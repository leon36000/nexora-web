import type { RagConfig } from "./types";

type Env = Record<string, string | undefined>;

function int(env: Env, name: string, fallback: number): number {
  const n = Number(env[name]);
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}

/** Valeurs de départ : des paramètres d'exploitation (variables d'environnement), jamais des prix. */
export function ragConfig(env: Env = process.env): RagConfig {
  const rerank = env.RAG_DEFAULT_RERANK_MODEL?.trim();
  return {
    maxFileBytes: int(env, "RAG_MAX_FILE_BYTES", 10 * 1024 * 1024),
    maxTextChars: int(env, "RAG_MAX_TEXT_CHARS", 5_000_000),
    maxPdfPages: int(env, "RAG_MAX_PDF_PAGES", 500),
    maxBodyBytes: int(env, "RAG_MAX_BODY_BYTES", 12 * 1024 * 1024),
    maxBasesPerOrg: int(env, "RAG_MAX_BASES_PER_ORG", 10),
    maxDocsPerBase: int(env, "RAG_MAX_DOCS_PER_BASE", 2000),
    maxChunksPerBase: int(env, "RAG_MAX_CHUNKS_PER_BASE", 200_000),
    maxChunksPerDoc: int(env, "RAG_MAX_CHUNKS_PER_DOC", 5000),
    inlineMaxChunks: int(env, "RAG_INLINE_MAX_CHUNKS", 48),
    embedBatch: int(env, "RAG_EMBED_BATCH", 32),
    sliceMs: int(env, "RAG_SLICE_MS", 20_000),
    defaultRpm: int(env, "RAG_DEFAULT_RPM", 120),
    keyRpm: int(env, "RAG_KEY_RPM", 600),
    keyTpm: int(env, "RAG_KEY_TPM", 2_000_000),
    topKMax: int(env, "RAG_TOP_K_MAX", 20),
    rerankCandidates: int(env, "RAG_RERANK_CANDIDATES", 30),
    rerankCandidatesMax: int(env, "RAG_RERANK_CANDIDATES_MAX", 50),
    maxMetadataBytes: int(env, "RAG_MAX_METADATA_BYTES", 4096),
    defaultEmbeddingModel:
      env.RAG_DEFAULT_EMBEDDING_MODEL?.trim() || "nexora/qwen3-embedding-8b",
    defaultRerankModel:
      rerank === "" || rerank === "off"
        ? null
        : (rerank ?? "nexora/qwen3-reranker-4b"),
  };
}
