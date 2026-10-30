import { credit, eq, usageEvents } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiKey } from "./keys";
import { type GatewayDeps, handleEmbeddings } from "./proxy";
import {
  newOrganization,
  publishTestCatalog,
  testPrivacyRouter,
} from "./test-support";

let t: TestDatabase;
let counter = 0;
let upstreamCalls: string[] = [];

const deps = (over: Partial<GatewayDeps> = {}): GatewayDeps => ({
  db: () => t.db,
  fetch: (async (input: unknown) => {
    upstreamCalls.push(String(input));
    return Response.json({
      object: "list",
      data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2] }],
      model: "nexora/test-embed",
      usage: { prompt_tokens: 10, total_tokens: 10 },
    });
  }) as typeof fetch,
  litellm: () => ({
    baseUrl: "http://litellm.internal:4000",
    masterKey: "sk-master-litellm-key-1234567890",
  }),
  log: createLogger({ name: "test", sink: () => undefined }),
  now: () => new Date(),
  privacy: testPrivacyRouter(t.db),
  requestId: () => `req_auth_${++counter}`,
  limits: {
    defaultRpm: 1000,
    defaultTpm: 10_000_000,
    maxBodyBytes: 1_000_000,
    upstreamTimeoutMs: 10_000,
    streamTimeoutMs: 10_000,
    defaultMaxOutputTokens: 1000,
  },
  ...over,
});

beforeAll(async () => {
  t = await createTestDatabase();
  await publishTestCatalog(t.db, [
    {
      publicId: "nexora/test-embed",
      kind: "embedding",
      sellInput: 200_000n,
      sellOutput: 0n,
    },
  ]);
});
afterAll(async () => {
  await t.drop();
});

async function funded() {
  const org = await newOrganization(t.db);
  await credit(t.db, {
    organizationId: org,
    amountMicro: 5_000_000n,
    idempotencyKey: `fund:${org}`,
    configVersion: "t",
    source: "test",
  });
  const { record } = await createApiKey(t.db, {
    organizationId: org,
    name: "interne",
  });
  const row = await t.db.query.apiKeys.findFirst({
    where: (k, { eq: e }) => e(k.id, record.id),
  });
  if (!row) throw new Error("clé introuvable");
  return { org, row };
}

const bare = () =>
  new Request("http://localhost/v1/embeddings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "nexora/test-embed", input: "bonjour" }),
  });

describe("authentification fournie par l'appelant (appels internes comme le RAG)", () => {
  it("sert une requête sans en-tête Authorization avec la clé fournie et la facture à cette clé", async () => {
    upstreamCalls = [];
    const { org, row } = await funded();
    const res = await handleEmbeddings(
      bare(),
      deps({ authenticate: async () => ({ ok: true, key: row }) }),
    );
    expect(res.status).toBe(200);
    expect(upstreamCalls).toHaveLength(1);
    const [event] = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, org));
    expect(event?.apiKeyId).toBe(row.id);
    expect(event?.endpoint).toBe("embeddings");
    expect(event?.costMicro).toBeGreaterThan(0n);
  });

  it("reste fermé : sans fonction fournie, une requête sans clé est refusée comme avant", async () => {
    upstreamCalls = [];
    const res = await handleEmbeddings(bare(), deps());
    expect(res.status).toBe(401);
    expect(upstreamCalls).toHaveLength(0);
  });

  it("relaie le refus de la fonction fournie (clé révoquée, expirée) en 401 sans appel amont", async () => {
    upstreamCalls = [];
    const res = await handleEmbeddings(
      bare(),
      deps({
        authenticate: async () => ({ ok: false, code: "api_key_revoked" }),
      }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("api_key_revoked");
    expect(upstreamCalls).toHaveLength(0);
  });
});
