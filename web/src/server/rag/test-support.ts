import { randomBytes } from "node:crypto";
import { credit } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import {
  type GatewayDeps,
  handleEmbeddings,
  handleRerank,
} from "../gateway/proxy";
import {
  newOrganization,
  publishTestCatalog,
  type TestModelSpec,
  testPrivacyRouter,
} from "../gateway/test-support";
import { ragConfig } from "./config";
import type { RagConfig, RagDeps, RagStoragePort } from "./types";

/** Embedding déterministe d'essai : sac de mots haché sur 1024 dimensions (deux textes qui partagent des mots se ressemblent). */
export function fakeEmbedding(text: string, dims = 1024): number[] {
  const v = new Array<number>(dims).fill(0);
  for (const m of text.toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)) {
    let h = 2166136261;
    for (const ch of m[0])
      h = Math.imul(h ^ (ch.codePointAt(0) ?? 0), 16777619) >>> 0;
    v[h % dims] = (v[h % dims] as number) + 1;
  }
  if (!v.some((x) => x !== 0)) v[0] = 1;
  return v;
}

export interface FakeUpstream {
  /** Textes envoyés au service d'embedding, dans l'ordre. */
  embedInputs: string[];
  embedCalls: number;
  rerankCalls: { query: string; documents: string[] }[];
  /** Longueur des vecteurs renvoyés (4096 simule Qwen3 sans paramètre `dimensions`). */
  embedDims: number;
  /** Fait échouer les appels d'embedding avec ce statut tant que non nul. */
  embedFailStatus: number;
  /** Nombre d'appels d'embedding encore acceptés avant d'échouer (nul = illimité). */
  rerankScores: ((query: string, doc: string) => number) | null;
}

export interface MemoryStorage extends RagStoragePort {
  usedBytes(org: string): number;
  quota: number;
}

export function memoryStorage(quota = Number.POSITIVE_INFINITY): MemoryStorage {
  const used = new Map<string, number>();
  return {
    quota,
    usedBytes: (org) => used.get(org) ?? 0,
    used: async (org) => used.get(org) ?? 0,
    record: async (org, delta) => {
      const current = used.get(org) ?? 0;
      if (delta > 0 && current + delta > quota)
        return { ok: false, reason: "quota_exceeded" };
      used.set(org, Math.max(0, current + delta));
      return { ok: true };
    },
  };
}

export const EMBED_MODEL = "nexora/qwen3-embedding-8b";
export const RERANK_MODEL = "nexora/qwen3-reranker-4b";

export interface RagTestEnv {
  t: TestDatabase;
  deps: RagDeps;
  upstream: FakeUpstream;
  storage: MemoryStorage;
  jobs: {
    type: string;
    payload: Record<string, unknown>;
    availableAt?: Date;
  }[];
  logLines: string[];
  /** Organisation financée (micro-CAD). */
  org: (balanceMicro?: bigint) => Promise<string>;
  close: () => Promise<void>;
}

export async function ragTestEnv(
  options: {
    quota?: number;
    config?: Partial<RagConfig>;
    catalog?: TestModelSpec[];
  } = {},
): Promise<RagTestEnv> {
  const t = await createTestDatabase();
  await publishTestCatalog(
    t.db,
    options.catalog ?? [
      {
        publicId: EMBED_MODEL,
        kind: "embedding",
        sellInput: 1_000_000n,
        sellOutput: 0n,
        contextMax: 32_000,
      },
      {
        publicId: "nexora/bge-m3-multi-8k",
        kind: "embedding",
        sellInput: 1_000_000n,
        sellOutput: 0n,
      },
      {
        publicId: RERANK_MODEL,
        kind: "rerank",
        sellInput: 2_000_000n,
        sellOutput: 0n,
        contextMax: 32_000,
      },
    ],
  );
  const upstream: FakeUpstream = {
    embedInputs: [],
    embedCalls: 0,
    rerankCalls: [],
    embedDims: 1024,
    embedFailStatus: 0,
    rerankScores: null,
  };
  const logLines: string[] = [];
  const log = createLogger({ name: "rag-test", sink: (l) => logLines.push(l) });
  let counter = 0;
  const gatewayDeps = (): GatewayDeps => ({
    db: () => t.db,
    fetch: (async (input, init) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (url.endsWith("/v1/embeddings")) {
        upstream.embedCalls++;
        if (upstream.embedFailStatus)
          return new Response("{}", { status: upstream.embedFailStatus });
        const inputs: string[] = Array.isArray(body.input)
          ? body.input
          : [body.input];
        upstream.embedInputs.push(...inputs);
        return Response.json({
          object: "list",
          model: body.model,
          data: inputs.map((text, index) => ({
            object: "embedding",
            index,
            embedding: fakeEmbedding(text, upstream.embedDims),
          })),
          usage: {
            prompt_tokens: inputs.reduce(
              (s, x) => s + Math.ceil(x.length / 4),
              0,
            ),
            total_tokens: inputs.reduce(
              (s, x) => s + Math.ceil(x.length / 4),
              0,
            ),
          },
        });
      }
      if (url.endsWith("/v1/rerank")) {
        upstream.rerankCalls.push({
          query: body.query,
          documents: body.documents,
        });
        const score =
          upstream.rerankScores ??
          ((q: string, d: string) => {
            const qs = new Set(q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
            const ds = new Set(d.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
            return (
              [...qs].filter((w) => ds.has(w)).length / Math.max(1, qs.size)
            );
          });
        const results = (body.documents as string[])
          .map((d, index) => ({ index, relevance_score: score(body.query, d) }))
          .sort((a, b) => b.relevance_score - a.relevance_score);
        return Response.json({
          id: "rr",
          results,
          meta: {
            tokens: {
              input_tokens: (body.documents as string[]).reduce(
                (s, d) => s + Math.ceil((d.length + body.query.length) / 4),
                0,
              ),
            },
          },
        });
      }
      return new Response("{}", { status: 404 });
    }) as typeof fetch,
    litellm: () => ({
      baseUrl: "http://litellm.internal:4000",
      masterKey: "sk-master-litellm-key-1234567890",
    }),
    log: createLogger({ name: "gw-test", sink: () => undefined }),
    now: () => new Date(),
    privacy: testPrivacyRouter(t.db),
    requestId: () => `req_rag_${++counter}_${randomBytes(3).toString("hex")}`,
    limits: {
      defaultRpm: 100_000,
      defaultTpm: 100_000_000,
      maxBodyBytes: 20_000_000,
      upstreamTimeoutMs: 10_000,
      streamTimeoutMs: 10_000,
      defaultMaxOutputTokens: 1000,
    },
  });
  const storage = memoryStorage(options.quota);
  const jobs: RagTestEnv["jobs"] = [];
  const deps: RagDeps = {
    db: () => t.db,
    log,
    now: () => new Date(),
    requestId: () => `rag_${++counter}`,
    config: { ...ragConfig({}), ...options.config },
    gateway: {
      embeddings: (request, key) =>
        handleEmbeddings(request, {
          ...gatewayDeps(),
          authenticate: async () => ({ ok: true, key }),
        }),
      rerank: (request, key) =>
        handleRerank(request, {
          ...gatewayDeps(),
          authenticate: async () => ({ ok: true, key }),
        }),
    },
    storage,
    enqueue: async (job) => {
      jobs.push(job);
    },
  };
  return {
    t,
    deps,
    upstream,
    storage,
    jobs,
    logLines,
    org: async (balanceMicro = 50_000_000n) => {
      const id = await newOrganization(t.db);
      if (balanceMicro > 0n)
        await credit(t.db, {
          organizationId: id,
          amountMicro: balanceMicro,
          idempotencyKey: `fund:${id}`,
          configVersion: "t",
          source: "test",
        });
      return id;
    },
    close: () => t.drop(),
  };
}
