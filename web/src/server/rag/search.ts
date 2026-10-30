import type { Database } from "@nexora/db";
import {
  ANN_SETTINGS,
  applyRerank,
  lexicalSearchQuery,
  parseRerankResults,
  queryTerms,
  reciprocalRankFusion,
  type SearchRow,
  vectorSearchQuery,
} from "@nexora/rag";
import { loadBase } from "./bases";
import type { Caller } from "./documents";
import { embedTexts } from "./embed";
import { F, gatewayFailure } from "./failure";
import { bad, good, type Result } from "./result";
import type { RagDeps } from "./types";

export interface SearchInput {
  baseId: string;
  query: string;
  topK?: number;
  /** Reclasser les candidats (défaut : oui, si la base a un modèle de reclassement). */
  rerank?: boolean;
  /** Seuil de score du reclassement : écarte ce qui est dessous (les échelles diffèrent d'un modèle à l'autre). */
  minScore?: number;
}

export interface SearchHit {
  document_id: string;
  document_title: string;
  source: string | null;
  chunk_index: number;
  page: number | null;
  heading: string | null;
  text: string;
  /** Score du reclassement s'il a eu lieu, sinon similarité cosinus, sinon score plein texte. */
  score: number;
  scores: { vector: number | null; lexical: number | null; rerank: number | null };
  start: number;
  end: number;
}

export interface SearchResponse {
  object: "list";
  base_id: string;
  data: SearchHit[];
  rerank: { requested: boolean; applied: boolean; model: string | null; reason?: string };
  usage: { embedding_tokens: number; rerank_tokens: number; cost_micro: string };
}

const DEFAULT_TOP_K = 5;

interface Candidate {
  row: SearchRow;
  vector: number | null;
  lexical: number | null;
}

export async function searchBase(deps: RagDeps, ctx: Caller, input: SearchInput): Promise<Result<SearchResponse>> {
  const cfg = deps.config;
  const query = typeof input.query === "string" ? input.query.trim() : "";
  if (query.length === 0 || query.length > 8000)
    return bad(F.invalid("« query » doit être un texte de 1 à 8 000 caractères.", "query"));
  const topK = input.topK ?? DEFAULT_TOP_K;
  if (!Number.isInteger(topK) || topK < 1 || topK > cfg.topKMax)
    return bad(F.invalid(`« top_k » doit être un entier de 1 à ${cfg.topKMax}.`, "top_k"));
  if (input.minScore !== undefined && !Number.isFinite(input.minScore))
    return bad(F.invalid("« min_score » doit être un nombre.", "min_score"));
  const db = deps.db();
  const base = await loadBase(db, ctx.organizationId, input.baseId);
  if (!base) return bad(F.baseNotFound());

  const embedded = await embedTexts(deps, ctx.key, base.embeddingModel, [query], { query: true });
  if (!embedded.ok) return bad(embedded.failure);
  const vector = embedded.value.vectors[0] as number[];
  let costMicro = embedded.value.costMicro;

  const wantRerank = input.rerank ?? true;
  const pool = wantRerank && base.rerankModel ? Math.min(Math.max(topK * 3, cfg.rerankCandidates), cfg.rerankCandidatesMax) : Math.max(topK * 2, topK);
  const terms = queryTerms(query);
  const found = await db.transaction(async (tx) => {
    const d = tx as unknown as Database;
    for (const setting of ANN_SETTINGS) await d.execute(setting);
    const vec = [...(await d.execute<SearchRow>(vectorSearchQuery({ organizationId: ctx.organizationId, baseId: base.id, vector, limit: pool })))];
    const lex = terms.length
      ? [...(await d.execute<SearchRow>(lexicalSearchQuery({ organizationId: ctx.organizationId, baseId: base.id, tsQuery: terms.join(" | "), limit: pool })))]
      : [];
    return { vec, lex };
  });
  const byId = new Map<number, Candidate>();
  for (const r of found.vec) byId.set(Number(r.id), { row: r, vector: 1 - Number(r.distance), lexical: null });
  for (const r of found.lex) {
    const known = byId.get(Number(r.id));
    if (known) known.lexical = Number(r.score);
    else byId.set(Number(r.id), { row: r, vector: null, lexical: Number(r.score) });
  }
  const fused = reciprocalRankFusion([found.vec.map((r) => Number(r.id)), found.lex.map((r) => Number(r.id))]);
  const ordered = fused.slice(0, pool).map((f) => byId.get(f.id) as Candidate);

  const reranked: SearchResponse["rerank"] = { requested: wantRerank, applied: false, model: base.rerankModel };
  let rerankTokens = 0;
  let final: { c: Candidate; rerank: number | null }[] = ordered.slice(0, topK).map((c) => ({ c, rerank: null }));
  if (wantRerank) {
    if (!base.rerankModel) reranked.reason = "no_model";
    else if (ordered.length < 2) reranked.reason = "single_candidate";
    else {
      const documents = ordered.map((c) => (c.row.heading ? `${c.row.heading}\n\n${c.row.content}` : c.row.content));
      let response: Response | null = null;
      try {
        response = await deps.gateway.rerank(
          new Request("http://rag.internal/v1/rerank", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ model: base.rerankModel, query, documents, top_n: topK }),
          }),
          ctx.key,
        );
      } catch {
        reranked.reason = "rerank_unavailable";
      }
      if (response) {
        if (!response.ok) reranked.reason = `rerank_failed:${(await gatewayFailure(response)).code}`;
        else {
          const json = (await response.json().catch(() => null)) as { usage?: { total_tokens?: number } } | null;
          const scores = parseRerankResults(json, documents.length);
          const cost = response.headers.get("x-nexora-cost-micro");
          if (cost && /^\d+$/.test(cost)) costMicro += BigInt(cost);
          rerankTokens = Number(json?.usage?.total_tokens ?? 0) || 0;
          if (!scores) reranked.reason = "rerank_invalid";
          else {
            reranked.applied = true;
            final = applyRerank(ordered, scores, { topN: topK, minScore: input.minScore }).map((r) => ({ c: r.item, rerank: r.rerankScore }));
          }
        }
      }
    }
  }
  const data: SearchHit[] = final.map(({ c, rerank }) => ({
    document_id: c.row.document_id,
    document_title: c.row.title,
    source: c.row.source,
    chunk_index: Number(c.row.ord),
    page: c.row.page === null ? null : Number(c.row.page),
    heading: c.row.heading,
    text: c.row.content,
    score: rerank ?? c.vector ?? c.lexical ?? 0,
    scores: { vector: c.vector, lexical: c.lexical, rerank },
    start: Number(c.row.start_char),
    end: Number(c.row.end_char),
  }));
  deps.log.info("rag : recherche", { baseId: base.id, organizationId: ctx.organizationId, results: data.length, reranked: reranked.applied });
  return good({
    object: "list",
    base_id: base.id,
    data,
    rerank: reranked,
    usage: { embedding_tokens: embedded.value.tokens, rerank_tokens: rerankTokens, cost_micro: String(costMicro) },
  });
}

