import { credit, eq, usageEvents } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApiKey } from "./keys";
import {
  type GatewayDeps,
  handleChatCompletions,
  handleEmbeddings,
  handleRerank,
} from "./proxy";
import {
  newOrganization,
  publishTestCatalog,
  testPrivacyRouter,
} from "./test-support";

const MASTER = "sk-master-litellm-key-1234567890";
let t: TestDatabase;
let counter = 0;
interface Call {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}
let calls: Call[];
let upstream: () => Response | Promise<Response>;

const rerankOk = (tokens: number | null = 120) =>
  Response.json({
    id: "rr-1",
    results: [
      { index: 2, relevance_score: 0.93 },
      { index: 0, relevance_score: 0.41 },
    ],
    meta:
      tokens === null
        ? {}
        : {
            tokens: { input_tokens: tokens },
            billed_units: { search_units: 1 },
          },
    provider: "DeepInfra",
  });

const deps = (): GatewayDeps => ({
  db: () => t.db,
  fetch: (async (input, init) => {
    calls.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body ?? "{}")),
    });
    return upstream();
  }) as typeof fetch,
  litellm: () => ({
    baseUrl: "http://litellm.internal:4000",
    masterKey: MASTER,
  }),
  log: createLogger({ name: "test", sink: () => undefined }),
  now: () => new Date(),
  privacy: testPrivacyRouter(t.db),
  requestId: () => `req_rr_${++counter}`,
  limits: {
    defaultRpm: 1000,
    defaultTpm: 10_000_000,
    maxBodyBytes: 1_000_000,
    upstreamTimeoutMs: 10_000,
    streamTimeoutMs: 10_000,
    defaultMaxOutputTokens: 1000,
  },
});

const post = (key: string, body: unknown, path = "rerank") =>
  new Request(`http://localhost/v1/${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

async function client(creditMicro = 5_000_000n) {
  const org = await newOrganization(t.db);
  if (creditMicro > 0n)
    await credit(t.db, {
      organizationId: org,
      amountMicro: creditMicro,
      idempotencyKey: `fund:${org}`,
      configVersion: "t",
      source: "test",
    });
  const { key } = await createApiKey(t.db, { organizationId: org, name: "k" });
  return { org, key };
}

beforeAll(async () => {
  t = await createTestDatabase();
  await publishTestCatalog(t.db, [
    {
      publicId: "nexora/test-rerank",
      kind: "rerank",
      sellInput: 1_000_000n,
      sellOutput: 0n,
    },
    {
      publicId: "nexora/test-embed",
      kind: "embedding",
      sellInput: 200_000n,
      sellOutput: 0n,
    },
    { publicId: "nexora/test-chat" },
  ]);
});
afterAll(async () => {
  await t.drop();
});
beforeEach(() => {
  calls = [];
  upstream = () => rerankOk();
});

const body = (extra: Record<string, unknown> = {}) => ({
  model: "nexora/test-rerank",
  query: "Quelle est la capitale de la France ?",
  documents: [
    "Berlin est la capitale de l'Allemagne.",
    "Le Louvre est un musée.",
    "Paris est la capitale de la France.",
  ],
  ...extra,
});

describe("POST /v1/rerank", () => {
  it("reclasse, relaie le format Cohere sans fournisseur ni document, et facture les jetons rapportés par l'amont", async () => {
    const c = await client();
    const res = await handleRerank(post(c.key, body({ top_n: 2 })), deps());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.model).toBe("nexora/test-rerank");
    expect(json.results).toEqual([
      { index: 2, relevance_score: 0.93 },
      { index: 0, relevance_score: 0.41 },
    ]);
    expect(JSON.stringify(json)).not.toContain("DeepInfra");
    expect(JSON.stringify(json)).not.toContain("Paris est la capitale");
    expect(json.usage).toMatchObject({ prompt_tokens: 120, total_tokens: 120 });
    // Appel amont : LiteLLM, clé maîtresse, aucune clé du client, corps minimal.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://litellm.internal:4000/v1/rerank");
    expect(calls[0]?.headers.get("authorization")).toBe(`Bearer ${MASTER}`);
    expect(calls[0]?.body).toMatchObject({
      model: "nexora/test-rerank",
      top_n: 2,
    });
    expect(calls[0]?.body.return_documents).not.toBe(true);
    // Débit : 120 jetons à 1 $ le million = 120 micro-CAD ; ligne d'usage « rerank ».
    const [event] = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, c.org));
    expect(event).toMatchObject({
      endpoint: "rerank",
      modelPublicId: "nexora/test-rerank",
      promptTokens: 120,
      completionTokens: 0,
      status: "ok",
    });
    expect(event?.costMicro).toBe(120n);
    expect(res.headers.get("x-nexora-cost-micro")).toBe("120");
  });

  it("renvoie les documents seulement si le client le demande", async () => {
    const c = await client();
    const res = await handleRerank(
      post(c.key, body({ return_documents: true })),
      deps(),
    );
    const json = await res.json();
    expect(json.results[0]).toMatchObject({
      index: 2,
      document: { text: "Paris est la capitale de la France." },
    });
  });

  it("accepte des documents sous forme { text } et refuse le reste", async () => {
    const c = await client();
    const ok = await handleRerank(
      post(
        c.key,
        body({
          documents: [{ text: "un" }, { text: "deux" }, { text: "trois" }],
        }),
      ),
      deps(),
    );
    expect(ok.status).toBe(200);
    for (const bad of [
      { documents: [] },
      { documents: "x" },
      { documents: [1, 2] },
      { documents: [""] },
      { query: "" },
      { query: 4 },
      { top_n: 0 },
      { top_n: 1.5 },
    ]) {
      const res = await handleRerank(post(c.key, body(bad)), deps());
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
  });

  it("estime les jetons quand l'amont n'en rapporte pas, et les facture", async () => {
    upstream = () => rerankOk(null);
    const c = await client();
    const res = await handleRerank(post(c.key, body()), deps());
    expect(res.status).toBe(200);
    const [event] = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, c.org));
    expect(event?.promptTokens).toBeGreaterThan(0);
    expect(event?.costMicro).toBeGreaterThan(0n);
  });

  it("refuse un modèle d'un autre type, dans les deux sens", async () => {
    const c = await client();
    const chatOnRerank = await handleRerank(
      post(c.key, body({ model: "nexora/test-chat" })),
      deps(),
    );
    expect(chatOnRerank.status).toBe(400);
    expect((await chatOnRerank.json()).error.code).toBe("model_not_supported");
    const rerankOnChat = await handleChatCompletions(
      post(
        c.key,
        {
          model: "nexora/test-rerank",
          messages: [{ role: "user", content: "x" }],
        },
        "chat/completions",
      ),
      deps(),
    );
    expect(rerankOnChat.status).toBe(400);
    const rerankOnEmbed = await handleEmbeddings(
      post(c.key, { model: "nexora/test-rerank", input: "x" }, "embeddings"),
      deps(),
    );
    expect(rerankOnEmbed.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("refuse avec le même 402 que la passerelle quand le solde est nul, sans appel amont", async () => {
    const c = await client(0n);
    const res = await handleRerank(post(c.key, body()), deps());
    expect(res.status).toBe(402);
    expect((await res.json()).error.code).toBe("insufficient_quota");
    expect(calls).toHaveLength(0);
  });

  it("masque les renseignements personnels (Privacy Router) avant l'appel amont", async () => {
    const c = await client();
    await handleRerank(
      post(
        c.key,
        body({
          query: "écrire à jean.tremblay@exemple.ca",
          documents: ["contact : jean.tremblay@exemple.ca", "autre"],
        }),
      ),
      deps(),
    );
    const sent = JSON.stringify(calls[0]?.body);
    expect(sent).not.toContain("jean.tremblay@exemple.ca");
    expect(sent).toContain("[COURRIEL]");
  });

  it("répond 502 sans rien facturer quand l'amont renvoie une forme incohérente", async () => {
    upstream = () =>
      Response.json({ results: [{ index: 99, relevance_score: 1 }] });
    const c = await client();
    const res = await handleRerank(post(c.key, body()), deps());
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("invalid_upstream_response");
    const [event] = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, c.org));
    expect(event?.costMicro).toBe(0n);
    expect(event?.status).toBe("error");
  });

  it("une clé dont allowedModels n'inclut pas le modèle ne le trouve pas", async () => {
    const org = await newOrganization(t.db);
    await credit(t.db, {
      organizationId: org,
      amountMicro: 1_000_000n,
      idempotencyKey: `f:${org}`,
      configVersion: "t",
      source: "test",
    });
    const { key } = await createApiKey(t.db, {
      organizationId: org,
      name: "k",
      allowedModels: ["nexora/test-embed"],
    });
    const res = await handleRerank(post(key, body()), deps());
    expect(res.status).toBe(404);
  });
});
