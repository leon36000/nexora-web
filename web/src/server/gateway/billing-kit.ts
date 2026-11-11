import { credit, eq, usageEvents } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { createApiKey } from "./keys";
import type { PerMillion } from "./pricing";
import type { GatewayDeps } from "./proxy";
import {
  newOrganization,
  publishTestCatalog,
  testPrivacyRouter,
} from "./test-support";

/**
 * Banc d'essai de la facturation exacte : vrai `handleChatCompletions`, vrai grand livre, base PostgreSQL jetable,
 * amont (LiteLLM) simulé. Utilisé par les essais de reproduction de l'audit de précision (S1…S14) devenus des tests de
 * non-régression. Les prix sont des prix d'essai (3 / 15 CAD par million, cache 0,30, écriture de cache 3,75).
 */

export const M = 1_000_000n;
export const MODEL = "nexora/audit-chat";
export const EMBED_MODEL = "nexora/audit-embed";
export const PRICE: PerMillion = {
  input: 3_000_000n,
  output: 15_000_000n,
  cache: 300_000n,
  cacheWrite: 3_750_000n,
};

export interface KitCall {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}
export type KitUpstream = (
  call: KitCall,
  signal: AbortSignal | null | undefined,
) => Response | Promise<Response>;

export interface Kit {
  t: TestDatabase;
  calls: KitCall[];
  lines: string[];
  upstream: KitUpstream;
  counter: number;
  deps(over?: Partial<GatewayDeps>): GatewayDeps;
}

export async function createKit(): Promise<Kit> {
  const t = await createTestDatabase();
  await publishTestCatalog(t.db, [
    {
      publicId: MODEL,
      sellInput: PRICE.input,
      sellOutput: PRICE.output,
      sellCache: PRICE.cache,
      sellCacheWrite: PRICE.cacheWrite ?? undefined,
      maxOutputTokens: 32_000,
      contextMax: 200_000,
    },
    {
      publicId: EMBED_MODEL,
      kind: "embedding",
      sellInput: 200_000n,
      sellOutput: 0n,
      contextMax: 8_000,
    },
  ]);
  const kit: Kit = {
    t,
    calls: [],
    lines: [],
    counter: 0,
    upstream: () => completion({ prompt_tokens: 10, completion_tokens: 5 }),
    deps(over = {}) {
      return {
        db: () => t.db,
        fetch: (async (input, init) => {
          const call: KitCall = {
            url: String(input),
            headers: new Headers(init?.headers),
            body: JSON.parse(String(init?.body ?? "{}")),
          };
          kit.calls.push(call);
          return kit.upstream(call, init?.signal);
        }) as typeof fetch,
        litellm: () => ({
          baseUrl: "http://litellm.internal:4000",
          masterKey: "sk-master-0123456789abcdef",
        }),
        log: createLogger({ name: "kit", sink: (l) => kit.lines.push(l) }),
        now: () => new Date(),
        privacy: testPrivacyRouter(t.db),
        requestId: () => `req_kit_${++kit.counter}`,
        limits: {
          defaultRpm: 100_000,
          defaultTpm: 1_000_000_000,
          maxBodyBytes: 8_000_000,
          upstreamTimeoutMs: 30_000,
          streamTimeoutMs: 30_000,
          defaultMaxOutputTokens: 4096,
        },
        ...over,
      };
    },
  };
  return kit;
}

export const post = (key: string, body: unknown, signal?: AbortSignal) =>
  new Request("http://localhost/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
export const chat = (content: string, extra: Record<string, unknown> = {}) => ({
  model: MODEL,
  messages: [{ role: "user", content }],
  ...extra,
});

export async function client(
  t: TestDatabase,
  balanceMicro: bigint,
  keyOptions: Partial<Parameters<typeof createApiKey>[1]> = {},
) {
  const org = await newOrganization(t.db);
  if (balanceMicro > 0n)
    await credit(t.db, {
      organizationId: org,
      amountMicro: balanceMicro,
      idempotencyKey: `fund:${org}`,
      configVersion: "t",
      source: "purchase",
    });
  const { key, record } = await createApiKey(t.db, {
    organizationId: org,
    name: "audit",
    ...keyOptions,
  });
  return { org, key, keyId: record.id };
}

export const eventsOf = (t: TestDatabase, org: string) =>
  t.db.select().from(usageEvents).where(eq(usageEvents.organizationId, org));

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const enc = new TextEncoder();
export const ev = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
export const chunk = (content: string, id = "gen-1") =>
  ev({
    id,
    object: "chat.completion.chunk",
    model: MODEL,
    choices: [{ index: 0, delta: { content }, finish_reason: null }],
  });
export const usageChunk = (u: Record<string, unknown>, id = "gen-1") =>
  ev({
    id,
    object: "chat.completion.chunk",
    model: MODEL,
    choices: [],
    usage: u,
  });
export const completion = (
  usage: Record<string, unknown> | undefined,
  content = "Bonjour !",
  headers: Record<string, string> = {},
  id = "gen-1",
) =>
  Response.json(
    {
      id,
      object: "chat.completion",
      model: MODEL,
      choices: [
        {
          index: 0,
          finish_reason: "stop",
          message: { role: "assistant", content },
        },
      ],
      ...(usage ? { usage } : {}),
    },
    { headers },
  );
/** Flux : envoie les morceaux puis, selon `end`, se ferme ou reste ouvert (l'amont « continue à produire »). */
export const stream = (
  parts: string[],
  end: "close" | "hang",
  headers: Record<string, string> = {},
) =>
  new Response(
    new ReadableStream({
      async start(c) {
        for (const p of parts) {
          c.enqueue(enc.encode(p));
          await sleep(3);
        }
        if (end === "close") c.close();
        else await sleep(60_000).catch(() => undefined);
      },
    }),
    { headers: { "content-type": "text/event-stream", ...headers } },
  );
/** L'amont ne répond jamais ; il rejette à l'annulation du signal (comme fetch). */
export const hangingUpstream: KitUpstream = (_c, signal) =>
  new Promise<Response>((_res, rej) =>
    signal?.addEventListener("abort", () =>
      rej(new DOMException("annulé", "AbortError")),
    ),
  );
