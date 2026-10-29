import {
  apiKeys,
  credit,
  deriveBalance,
  eq,
  privacyEvents,
  usageEvents,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { savePolicy } from "../privacy/store";
import {
  type OutboundIntent,
  type PrivacyRouter,
  PrivacyRouterUnavailableError,
} from "../privacy/types";
import { createApiKey } from "./keys";
import {
  type GatewayDeps,
  handleChatCompletions,
  handleEmbeddings,
} from "./proxy";
import {
  newOrganization,
  publishTestCatalog,
  testPrivacyRouter,
} from "./test-support";

const MASTER = "sk-master-litellm-key-1234567890";
const M = 1_000_000n;
const EMAIL = "jean.tremblay@exemple.qc.ca";
const PHONE = "514-555-0199";

let t: TestDatabase;
let lines: string[];
let counter = 0;
let calls: { url: string; body: Record<string, any> }[];

const upstreamChat = () =>
  Response.json({
    id: "gen-1",
    object: "chat.completion",
    created: 1,
    model: "nexora/test-chat",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: { role: "assistant", content: "Bonjour !" },
      },
    ],
    usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
  });
const upstreamEmbedding = () =>
  Response.json({
    object: "list",
    data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2] }],
    model: "nexora/test-embed",
    usage: { prompt_tokens: 8, total_tokens: 8 },
  });
const upstreamStream = () => {
  const enc = new TextEncoder();
  const events = [
    `data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "Salut" }, finish_reason: null }] })}\n\n`,
    `data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", choices: [], usage: { prompt_tokens: 20, completion_tokens: 2, total_tokens: 22 } })}\n\n`,
    "data: [DONE]\n\n",
  ];
  return new Response(
    new ReadableStream({
      start(c) {
        for (const e of events) c.enqueue(enc.encode(e));
        c.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
};

let respond: (url: string) => Response;

const deps = (privacy?: PrivacyRouter): GatewayDeps => ({
  db: () => t.db,
  fetch: (async (input, init) => {
    calls.push({
      url: String(input),
      body: JSON.parse(String(init?.body ?? "{}")),
    });
    return respond(String(input));
  }) as typeof fetch,
  litellm: () => ({
    baseUrl: "http://litellm.internal:4000",
    masterKey: MASTER,
  }),
  log: createLogger({ name: "test", sink: (l) => lines.push(l) }),
  now: () => new Date(),
  requestId: () => `req_priv_${++counter}`,
  privacy: privacy ?? testPrivacyRouter(t.db),
  limits: {
    defaultRpm: 1000,
    defaultTpm: 10_000_000,
    maxBodyBytes: 1_000_000,
    upstreamTimeoutMs: 10_000,
    streamTimeoutMs: 10_000,
    defaultMaxOutputTokens: 1000,
  },
});

const post = (key: string, body: unknown, path = "chat/completions") =>
  new Request(`http://localhost/v1/${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

async function client() {
  const org = await newOrganization(t.db);
  await credit(t.db, {
    organizationId: org,
    amountMicro: 10n * M,
    idempotencyKey: `fund:${org}`,
    configVersion: "t",
    source: "test",
  });
  const { key, record } = await createApiKey(t.db, {
    organizationId: org,
    name: "test",
  });
  return { org, key, keyId: record.id };
}

const balanceOf = async (org: string) => deriveBalance(t.db, org);

beforeAll(async () => {
  t = await createTestDatabase();
  await publishTestCatalog(t.db, [
    { publicId: "nexora/test-chat" },
    { publicId: "nexora/test-embed", kind: "embedding", sellOutput: 0n },
  ]);
});
afterAll(async () => {
  await t.drop();
});
beforeEach(() => {
  lines = [];
  calls = [];
  respond = (url) =>
    url.endsWith("/embeddings") ? upstreamEmbedding() : upstreamChat();
});

describe("/v1/chat/completions : masquage (politique standard par défaut)", () => {
  it("masque courriel et téléphone d'un message texte avant l'appel amont", async () => {
    const c = await client();
    const res = await handleChatCompletions(
      post(c.key, {
        model: "nexora/test-chat",
        max_tokens: 100,
        messages: [
          { role: "system", content: "Tu aides les clients." },
          { role: "user", content: `Écris à ${EMAIL} ou appelle ${PHONE}.` },
        ],
      }),
      deps(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-nexora-privacy-decision")).toBe("mask");
    expect(calls).toHaveLength(1);
    const sent = JSON.stringify(calls[0]?.body);
    expect(sent).not.toContain("tremblay");
    expect(sent).not.toContain("555-0199");
    expect(calls[0]?.body.messages).toEqual([
      { role: "system", content: "Tu aides les clients." },
      { role: "user", content: "Écris à [COURRIEL] ou appelle [TÉLÉPHONE]." },
    ]);
    // Le client reçoit sa réponse normale, facturée.
    expect((await res.json()).choices[0].message.content).toBe("Bonjour !");
    const [usage] = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, c.org));
    expect(usage?.status).toBe("ok");
    // Journal : décision, genres, aucun contenu.
    const events = await t.db
      .select()
      .from(privacyEvents)
      .where(eq(privacyEvents.organizationId, c.org));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      product: "gateway",
      operation: "chat",
      decision: "mask",
      destination: "nexora/test-chat",
      apiKeyId: c.keyId,
      maskedCount: 2,
    });
    expect([...(events[0]?.detected ?? [])].sort()).toEqual(["email", "phone"]);
    expect(JSON.stringify(events)).not.toContain("tremblay");
    expect(lines.join("\n")).not.toContain("tremblay");
  });

  it("masque les parties texte d'un message à contenu structuré, sans toucher images ni outils", async () => {
    const c = await client();
    const image = {
      type: "image_url",
      image_url: { url: "data:image/png;base64,AAAA" },
    };
    const toolCall = {
      id: "call_1",
      type: "function",
      function: { name: "chercher", arguments: '{"q":"x"}' },
    };
    const tools = [
      { type: "function", function: { name: "chercher", parameters: {} } },
    ];
    const res = await handleChatCompletions(
      post(c.key, {
        model: "nexora/test-chat",
        max_tokens: 100,
        tools,
        tool_choice: "auto",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: `Mon courriel : ${EMAIL}` },
              image,
              { type: "text", text: "Rien ici" },
            ],
          },
          { role: "assistant", content: null, tool_calls: [toolCall] },
          { role: "tool", tool_call_id: "call_1", content: `Tel ${PHONE}` },
        ],
      }),
      deps(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-nexora-privacy-decision")).toBe("mask");
    expect(calls[0]?.body.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "Mon courriel : [COURRIEL]" },
          image,
          { type: "text", text: "Rien ici" },
        ],
      },
      { role: "assistant", content: null, tool_calls: [toolCall] },
      { role: "tool", tool_call_id: "call_1", content: "Tel [TÉLÉPHONE]" },
    ]);
    expect(calls[0]?.body.tools).toEqual(tools);
    expect(calls[0]?.body.tool_choice).toBe("auto");
  });

  it("n'altère pas une requête sans renseignement évident (décision allow)", async () => {
    const c = await client();
    const res = await handleChatCompletions(
      post(c.key, {
        model: "nexora/test-chat",
        max_tokens: 100,
        messages: [{ role: "user", content: "Résume ce paragraphe." }],
      }),
      deps(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-nexora-privacy-decision")).toBe("allow");
    expect(calls[0]?.body.messages).toEqual([
      { role: "user", content: "Résume ce paragraphe." },
    ]);
  });

  it("garde le flux (SSE) et masque la requête", async () => {
    const c = await client();
    respond = () => upstreamStream();
    const res = await handleChatCompletions(
      post(c.key, {
        model: "nexora/test-chat",
        stream: true,
        max_tokens: 100,
        messages: [
          { role: "user", content: `Mon NAS : 130 692 544 et ${EMAIL}` },
        ],
      }),
      deps(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("x-nexora-privacy-decision")).toBe("mask");
    const text = await res.text();
    expect(text).toContain("[DONE]");
    expect(calls[0]?.body.messages[0].content).toBe(
      "Mon NAS : [NAS] et [COURRIEL]",
    );
    expect(calls[0]?.body.stream).toBe(true);
  });

  it("un secret collé dans l'invite est masqué", async () => {
    const c = await client();
    await handleChatCompletions(
      post(c.key, {
        model: "nexora/test-chat",
        max_tokens: 100,
        messages: [
          {
            role: "user",
            content: `Voici ma clé nxk_${"A".repeat(43)} et sk-proj-${"b".repeat(30)}`,
          },
        ],
      }),
      deps(),
    );
    expect(calls[0]?.body.messages[0].content).toBe(
      "Voici ma clé [SECRET] et [SECRET]",
    );
  });
});

describe("/v1/embeddings", () => {
  it("masque une chaîne et chaque élément d'une liste, laisse passer les jetons", async () => {
    const c = await client();
    const res = await handleEmbeddings(
      post(
        c.key,
        {
          model: "nexora/test-embed",
          input: [`Contact ${EMAIL}`, "texte", [1, 2, 3]],
        },
        "embeddings",
      ),
      deps(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-nexora-privacy-decision")).toBe("mask");
    expect(calls[0]?.body.input).toEqual([
      "Contact [COURRIEL]",
      "texte",
      [1, 2, 3],
    ]);
    const single = await handleEmbeddings(
      post(
        c.key,
        { model: "nexora/test-embed", input: `Tél ${PHONE}` },
        "embeddings",
      ),
      deps(),
    );
    expect(single.status).toBe(200);
    expect(calls[1]?.body.input).toBe("Tél [TÉLÉPHONE]");
    const [ev] = await t.db
      .select()
      .from(privacyEvents)
      .where(eq(privacyEvents.organizationId, c.org));
    expect(ev?.operation).toBe("embeddings");
  });
});

describe("refus par la politique", () => {
  it("403 privacy_policy_denied au format OpenAI : règle nommée, aucun contenu, rien réservé, amont jamais appelé", async () => {
    const c = await client();
    await savePolicy(t.db, {
      organizationId: c.org,
      level: "renforce",
      config: { allowedModels: ["autre-modele"] },
      createdBy: null,
    });
    const before = await balanceOf(c.org);
    const res = await handleChatCompletions(
      post(c.key, {
        model: "nexora/test-chat",
        max_tokens: 100,
        messages: [{ role: "user", content: `Bonjour ${EMAIL}` }],
      }),
      deps(),
    );
    expect(res.status).toBe(403);
    expect(res.headers.get("x-nexora-privacy-decision")).toBe("deny");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.error).toMatchObject({
      code: "privacy_policy_denied",
      type: "permission_error",
      param: "model",
    });
    expect(body.error.message).toContain("model.not_allowed");
    expect(JSON.stringify(body)).not.toContain("tremblay");
    expect(calls).toHaveLength(0);
    expect(await balanceOf(c.org)).toEqual(before);
    expect(
      await t.db
        .select()
        .from(usageEvents)
        .where(eq(usageEvents.organizationId, c.org)),
    ).toHaveLength(0);
    const [ev] = await t.db
      .select()
      .from(privacyEvents)
      .where(eq(privacyEvents.organizationId, c.org));
    expect(ev).toMatchObject({
      decision: "deny",
      denyReason: "model_not_allowed",
    });
  });

  it("souverain sans rien de permis : tout est refusé (échec fermé), embeddings compris", async () => {
    const c = await client();
    await savePolicy(t.db, {
      organizationId: c.org,
      level: "souverain",
      config: {},
      createdBy: null,
    });
    const chatRes = await handleChatCompletions(
      post(c.key, {
        model: "nexora/test-chat",
        max_tokens: 100,
        messages: [{ role: "user", content: "Bonjour" }],
      }),
      deps(),
    );
    expect(chatRes.status).toBe(403);
    expect((await chatRes.json()).error.message).toContain("sovereign.closed");
    const embRes = await handleEmbeddings(
      post(c.key, { model: "nexora/test-embed", input: "x" }, "embeddings"),
      deps(),
    );
    expect(embRes.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it("renforcé bloque les pièces jointes (image), standard les laisse passer", async () => {
    const strict = await client();
    await savePolicy(t.db, {
      organizationId: strict.org,
      level: "renforce",
      config: {},
      createdBy: null,
    });
    const body = {
      model: "nexora/test-chat",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Décris" },
            {
              type: "image_url",
              image_url: { url: "https://exemple.ca/a.png" },
            },
          ],
        },
      ],
    };
    const denied = await handleChatCompletions(post(strict.key, body), deps());
    expect(denied.status).toBe(403);
    expect((await denied.json()).error.message).toContain("attachment.blocked");
    const std = await client();
    const ok = await handleChatCompletions(post(std.key, body), deps());
    expect(ok.status).toBe(200);
  });

  it("genre à refuser (carte) : 403 sensitive_data, la valeur n'est jamais répétée", async () => {
    const c = await client();
    await savePolicy(t.db, {
      organizationId: c.org,
      level: "standard",
      config: { denyCategories: ["credit_card"] },
      createdBy: null,
    });
    const res = await handleChatCompletions(
      post(c.key, {
        model: "nexora/test-chat",
        max_tokens: 100,
        messages: [{ role: "user", content: "Carte 4111 1111 1111 1111" }],
      }),
      deps(),
    );
    expect(res.status).toBe(403);
    const text = JSON.stringify(await res.json());
    expect(text).toContain("deny.credit_card");
    expect(text).not.toContain("4111");
    expect(calls).toHaveLength(0);
  });

  it("un modèle inconnu reste 404 (la politique ne révèle rien du catalogue)", async () => {
    const c = await client();
    const res = await handleChatCompletions(
      post(c.key, {
        model: "nexora/inexistant",
        messages: [{ role: "user", content: "x" }],
      }),
      deps(),
    );
    expect(res.status).toBe(404);
  });
});

describe("échec fermé", () => {
  const broken = (error: unknown): PrivacyRouter => ({
    evaluate: async (_intent: OutboundIntent) => {
      throw error;
    },
  });

  it("couche indisponible : 503 privacy_router_unavailable, rien réservé, amont jamais appelé", async () => {
    const c = await client();
    const before = await balanceOf(c.org);
    const res = await handleChatCompletions(
      post(c.key, {
        model: "nexora/test-chat",
        max_tokens: 100,
        messages: [{ role: "user", content: `Bonjour ${EMAIL}` }],
      }),
      deps(broken(new PrivacyRouterUnavailableError())),
    );
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatchObject({
      code: "privacy_router_unavailable",
      type: "api_error",
    });
    expect(calls).toHaveLength(0);
    expect(await balanceOf(c.org)).toEqual(before);
  });

  it("toute autre erreur du routeur est aussi un refus 503, jamais un passage", async () => {
    const c = await client();
    const res = await handleChatCompletions(
      post(c.key, {
        model: "nexora/test-chat",
        max_tokens: 100,
        messages: [{ role: "user", content: "Bonjour" }],
      }),
      deps(broken(new TypeError(`bug avec ${EMAIL}`))),
    );
    expect(res.status).toBe(503);
    expect(calls).toHaveLength(0);
    expect(lines.join("\n")).not.toContain("tremblay");
  });

  it("une décision de masquage dont le contenu perd des morceaux est refusée (503)", async () => {
    const c = await client();
    const router: PrivacyRouter = {
      evaluate: async () => ({
        decision: "mask",
        policyVersion: "0",
        content: "tout écrasé",
        ruleIds: ["mask.email"],
      }),
    };
    const res = await handleChatCompletions(
      post(c.key, {
        model: "nexora/test-chat",
        max_tokens: 100,
        messages: [
          { role: "user", content: `a ${EMAIL}` },
          { role: "user", content: "b" },
        ],
      }),
      deps(router),
    );
    expect(res.status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it("le routeur est consulté avant la réservation (solde insuffisant : refus de politique d'abord)", async () => {
    const org = await newOrganization(t.db);
    const { key } = await createApiKey(t.db, {
      organizationId: org,
      name: "k",
    });
    await savePolicy(t.db, {
      organizationId: org,
      level: "souverain",
      config: {},
      createdBy: null,
    });
    const res = await handleChatCompletions(
      post(key, {
        model: "nexora/test-chat",
        max_tokens: 100,
        messages: [{ role: "user", content: "Bonjour" }],
      }),
      deps(),
    );
    // Aucun crédit : sans politique ce serait 402 ; la politique répond avant.
    expect(res.status).toBe(403);
    const keys = await t.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.organizationId, org));
    expect(keys).toHaveLength(1);
  });
});
