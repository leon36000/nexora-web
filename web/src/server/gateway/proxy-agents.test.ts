import {
  credit,
  creditReservations,
  eq,
  getAccount,
  usageEvents,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { updateAgent, updateInstance } from "../agents/catalog";
import { publishTestAgent } from "../agents/test-support";
import { createApiKey, revokeApiKey } from "./keys";
import { requestCost } from "./pricing";
import { type GatewayDeps, handleChatCompletions, handleModels } from "./proxy";
import { newOrganization, publishTestCatalog } from "./test-support";

const MASTER = "sk-master-litellm-key-1234567890";
const WS_KEY = "sk-nexora-CLE-WORKSTUDIO-SECRETE-0123456789abcdef";
const PROMPT_MARKER = "CONTENU-SECRET-DU-CLIENT-À-NE-JAMAIS-JOURNALISER";
const M = 1_000_000n;
const PRICE = { input: 1_000_000n, output: 3_000_000n, cache: null };
const RUN_FEE = 50_000n;

let t: TestDatabase;
let lines: string[];
let counter = 0;
let vault: Map<string, string>;

interface UpstreamCall {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}
let calls: UpstreamCall[];
let upstream: (
  call: UpstreamCall,
  signal: AbortSignal | null | undefined,
) => Response | Promise<Response>;

const wsOk = (
  usage: Record<string, unknown> | null = {
    prompt_tokens: 165,
    completion_tokens: 41,
    total_tokens: 206,
  },
  content = "Je suis l'assistant interne de l'entreprise.",
) =>
  Response.json({
    id: "chatcmpl-ws-1",
    object: "chat.completion",
    created: 1,
    model: "agent:Assistant général",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    ...(usage ? { usage } : {}),
  });

const enc = new TextEncoder();
function sse(events: string[]): Response {
  return new Response(
    new ReadableStream({
      async start(c) {
        for (const e of events) {
          c.enqueue(enc.encode(e));
          await new Promise((r) => setTimeout(r, 3));
        }
        c.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}
const ev = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
const chunk = (delta: Record<string, unknown>, finish: string | null = null) =>
  ev({
    id: "c1",
    object: "chat.completion.chunk",
    created: 1,
    model: "agent:Assistant général",
    choices: [{ index: 0, delta, finish_reason: finish }],
  });
const usageChunk = (u: Record<string, unknown> | null) =>
  ev({
    id: "c1",
    object: "chat.completion.chunk",
    created: 1,
    model: "agent:Assistant général",
    choices: [],
    ...(u ? { usage: u } : {}),
  });

const deps = (over: Partial<GatewayDeps> = {}): GatewayDeps => ({
  db: () => t.db,
  fetch: (async (input, init) => {
    const call = {
      url: String(input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body ?? "{}")),
    };
    calls.push(call);
    return upstream(call, init?.signal);
  }) as typeof fetch,
  litellm: () => ({
    baseUrl: "http://litellm.internal:4000",
    masterKey: MASTER,
  }),
  getSecret: async (ref) => {
    const v = vault.get(ref);
    if (v === undefined) throw new Error(`secret ${ref} introuvable`);
    return v;
  },
  log: createLogger({ name: "test", sink: (l) => lines.push(l) }),
  now: () => new Date(),
  requestId: () => `req_agent_${++counter}`,
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

const post = (key: string, body: unknown) =>
  new Request("http://localhost/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
const ask = (slug: string, extra: Record<string, unknown> = {}) => ({
  model: `agent/${slug}`,
  messages: [{ role: "user", content: `Bonjour ${PROMPT_MARKER}` }],
  ...extra,
});

async function client(
  creditCad = 10n,
  keyOptions: Partial<Parameters<typeof createApiKey>[1]> = {},
) {
  const org = await newOrganization(t.db);
  if (creditCad > 0n)
    await credit(t.db, {
      organizationId: org,
      amountMicro: creditCad * M,
      idempotencyKey: `fund:${org}`,
      configVersion: "t",
      source: "test",
    });
  const { key, record } = await createApiKey(t.db, {
    organizationId: org,
    name: "test",
    ...keyOptions,
  });
  return { org, key, record };
}

let slugN = 0;
async function agent(spec: Parameters<typeof publishTestAgent>[1] = {}) {
  slugN += 1;
  const slug = spec.slug ?? `essai-${slugN}`;
  const a = await publishTestAgent(t.db, { ...spec, slug });
  vault.set(`workstudio.${slug}`, WS_KEY);
  return a;
}

beforeAll(async () => {
  t = await createTestDatabase();
  await publishTestCatalog(t.db, [{ publicId: "nexora/test-chat" }]);
});
afterAll(async () => {
  await t.drop();
});
beforeEach(() => {
  lines = [];
  calls = [];
  vault = new Map();
  upstream = () => wsOk();
});

const costOf = (prompt: number, completion: number) =>
  requestCost({ prompt, completion, cached: 0 }, PRICE) + RUN_FEE;

describe("appel non diffusé d'un agent", () => {
  it("débite exactement le coût réel (jetons + exécution), écrit l'usage et ne révèle rien de l'amont", async () => {
    const a = await agent();
    const c = await client();
    const res = await handleChatCompletions(post(c.key, ask(a.slug)), deps());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.model).toBe(`agent/${a.slug}`);
    expect(json.choices[0].message.content).toContain("assistant interne");
    expect(json.usage).toMatchObject({
      prompt_tokens: 165,
      completion_tokens: 41,
    });
    expect(JSON.stringify(json)).not.toContain("agent:Assistant");
    expect(res.headers.get("x-nexora-residency")).toBe("quebec");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();

    const expected = costOf(165, 41);
    expect(res.headers.get("x-nexora-cost-micro")).toBe(String(expected));
    expect(await getAccount(t.db, c.org)).toMatchObject({
      balanceMicro: 10n * M - expected,
      heldMicro: 0n,
    });
    const [row] = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, c.org));
    expect(row).toMatchObject({
      modelPublicId: `agent/${a.slug}`,
      endpoint: "chat.completions",
      status: "ok",
      httpStatus: 200,
      stream: false,
      promptTokens: 165,
      completionTokens: 41,
      costMicro: expected,
      runFeeMicro: RUN_FEE,
    });
    expect(row?.configVersion).toMatch(/^agent_price_/);
  });

  it("appelle WorkStudio avec la clé du coffre, l'identifiant amont, et sans les messages system", async () => {
    const a = await agent();
    const c = await client();
    const res = await handleChatCompletions(
      post(
        c.key,
        ask(a.slug, {
          temperature: 0.1,
          tools: [{ type: "function" }],
          messages: [
            { role: "system", content: "CONSIGNE-IGNOREE" },
            { role: "developer", content: "AUSSI-IGNOREE" },
            { role: "user", content: "Première question" },
            { role: "assistant", content: "Première réponse" },
            { role: "user", content: "Seconde question" },
          ],
        }),
      ),
      deps(),
    );
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.url).toBe("http://ws.internal:3200/v1/chat/completions");
    expect(call?.headers.get("authorization")).toBe(`Bearer ${WS_KEY}`);
    expect(call?.body.model).toBe("agent:Assistant général");
    expect(call?.body.stream).toBeUndefined();
    expect(call?.body.temperature).toBeUndefined();
    expect(call?.body.tools).toBeUndefined();
    expect(JSON.stringify(call?.body)).not.toContain("IGNOREE");
    expect(call?.body.messages).toEqual([
      { role: "user", content: "Première question" },
      { role: "assistant", content: "Première réponse" },
      { role: "user", content: "Seconde question" },
    ]);
    // La clé du client et la clé maîtresse ne partent jamais vers WorkStudio.
    expect(call?.headers.get("authorization")).not.toContain(c.key);
    expect(call?.headers.get("authorization")).not.toContain(MASTER);
  });

  it("refuse une requête sans message de l'utilisateur, avant toute réservation", async () => {
    const a = await agent();
    const c = await client();
    for (const messages of [
      [{ role: "system", content: "seulement une consigne" }],
      [{ role: "user", content: "   " }],
      [],
    ]) {
      const res = await handleChatCompletions(
        post(c.key, ask(a.slug, { messages })),
        deps(),
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("invalid_messages");
    }
    expect(calls).toHaveLength(0);
    expect(await getAccount(t.db, c.org)).toMatchObject({
      balanceMicro: 10n * M,
      heldMicro: 0n,
    });
  });

  it("réserve avant l'appel : exécution + plafond de jetons au prix le plus élevé", async () => {
    const a = await agent({ runTokenCap: 10_000 });
    const c = await client();
    let held = -1n;
    upstream = async () => {
      held = (await getAccount(t.db, c.org)).heldMicro;
      return wsOk();
    };
    await handleChatCompletions(post(c.key, ask(a.slug)), deps());
    // 10 000 jetons × 3 $/M (le plus élevé des deux prix) = 30 000 µ$ + exécution 50 000
    expect(held).toBe(RUN_FEE + 30_000n);
    const [r] = await t.db
      .select()
      .from(creditReservations)
      .where(eq(creditReservations.organizationId, c.org));
    expect(r).toMatchObject({
      status: "settled",
      amountMicro: RUN_FEE + 30_000n,
    });
  });

  it("règle au coût RÉEL au-delà du plafond d'exécution : le dépassement est facturé (S7 : plus absorbé par Nexora)", async () => {
    const a = await agent({ runTokenCap: 1000 });
    const c = await client();
    upstream = () =>
      wsOk({
        prompt_tokens: 40_000,
        completion_tokens: 9000,
        total_tokens: 49_000,
      });
    const res = await handleChatCompletions(post(c.key, ask(a.slug)), deps());
    expect(res.status).toBe(200);
    const real =
      RUN_FEE +
      requestCost({ prompt: 40_000, completion: 9000, cached: 0 }, PRICE);
    expect(real).toBeGreaterThan(RUN_FEE + 3_000n);
    expect(await getAccount(t.db, c.org)).toMatchObject({
      balanceMicro: 10n * M - real,
      heldMicro: 0n,
    });
  });

  it("refuse en 402 sans crédit, sans appeler WorkStudio", async () => {
    const a = await agent();
    const c = await client(0n);
    const res = await handleChatCompletions(post(c.key, ask(a.slug)), deps());
    expect(res.status).toBe(402);
    expect((await res.json()).error).toMatchObject({
      code: "insufficient_quota",
      type: "insufficient_quota",
    });
    expect(calls).toHaveLength(0);
    const rows = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, c.org));
    expect(rows).toHaveLength(0);
  });

  it("respecte le plafond de dépense de la clé", async () => {
    const a = await agent();
    const c = await client(10n, { spendCapMicro: 10_000n });
    const res = await handleChatCompletions(post(c.key, ask(a.slug)), deps());
    expect(res.status).toBe(402);
    expect((await res.json()).error.code).toBe("api_key_spend_cap_reached");
    expect(calls).toHaveLength(0);
  });

  it("rejette une requête dont l'entrée dépasse le plafond de l'agent", async () => {
    const a = await agent({ runTokenCap: 50 });
    const c = await client();
    const res = await handleChatCompletions(
      post(
        c.key,
        ask(a.slug, {
          messages: [{ role: "user", content: "x".repeat(2000) }],
        }),
      ),
      deps(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("context_length_exceeded");
    expect(calls).toHaveLength(0);
  });
});

describe("règle de repli quand l'usage manque", () => {
  it("estime d'après l'entrée et la réponse livrée quand WorkStudio ne renvoie pas d'usage", async () => {
    const a = await agent();
    const c = await client();
    const content = "x".repeat(300);
    upstream = () => wsOk(null, content);
    await handleChatCompletions(post(c.key, ask(a.slug)), deps());
    const [row] = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, c.org));
    expect(row?.status).toBe("ok");
    expect(row?.completionTokens).toBe(100); // 300 caractères / 3 octets par jeton
    expect(row?.promptTokens).toBeGreaterThan(0);
    expect(row?.costMicro).toBe(costOf(row?.promptTokens ?? 0, 100));
  });

  it("traite un usage à zéro avec une réponse livrée comme un usage manquant", async () => {
    const a = await agent();
    const c = await client();
    upstream = () =>
      wsOk(
        { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        "y".repeat(90),
      );
    await handleChatCompletions(post(c.key, ask(a.slug)), deps());
    const [row] = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, c.org));
    expect(row?.completionTokens).toBe(30);
    expect(row?.promptTokens).toBeGreaterThan(0);
  });

  it("ne facture que l'exécution quand la réponse est vide et sans usage", async () => {
    const a = await agent();
    const c = await client();
    upstream = () =>
      wsOk({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, "");
    await handleChatCompletions(post(c.key, ask(a.slug)), deps());
    const [row] = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, c.org));
    expect(row).toMatchObject({
      status: "ok",
      promptTokens: 0,
      completionTokens: 0,
      costMicro: RUN_FEE,
    });
  });
});

describe("flux d'un agent", () => {
  const events = [
    chunk({ role: "assistant", content: "Bon" }),
    chunk({ content: "jour" }),
    chunk({}, "stop"),
    usageChunk({
      prompt_tokens: 165,
      completion_tokens: 41,
      total_tokens: 206,
    }),
    "data: [DONE]\n\n",
  ];

  it("transmet le flux et règle avant [DONE] sur l'usage réel de WorkStudio", async () => {
    const a = await agent();
    const c = await client();
    upstream = () => sse(events);
    const res = await handleChatCompletions(
      post(c.key, ask(a.slug, { stream: true })),
      deps(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    const body = await res.text();
    expect(body).toContain('"content":"Bon"');
    expect(body).toContain(`"model":"agent/${a.slug}"`);
    expect(body).toContain("data: [DONE]");
    expect(body).not.toContain('"usage"'); // non demandé par le client
    expect(calls[0]?.body.stream).toBe(true);
    const expected = costOf(165, 41);
    expect(await getAccount(t.db, c.org)).toMatchObject({
      balanceMicro: 10n * M - expected,
      heldMicro: 0n,
    });
    const [row] = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, c.org));
    expect(row).toMatchObject({
      stream: true,
      status: "ok",
      costMicro: expected,
      runFeeMicro: RUN_FEE,
    });
  });

  it("garde l'usage dans le flux quand le client l'a demandé", async () => {
    const a = await agent();
    const c = await client();
    upstream = () => sse(events);
    const res = await handleChatCompletions(
      post(
        c.key,
        ask(a.slug, { stream: true, stream_options: { include_usage: true } }),
      ),
      deps(),
    );
    expect(await res.text()).toContain('"prompt_tokens":165');
  });

  it("estime la livraison quand le flux se termine avec un usage à zéro", async () => {
    const a = await agent();
    const c = await client();
    upstream = () =>
      sse([
        chunk({ role: "assistant", content: "z".repeat(60) }),
        chunk({}, "stop"),
        usageChunk({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }),
        "data: [DONE]\n\n",
      ]);
    const res = await handleChatCompletions(
      post(c.key, ask(a.slug, { stream: true })),
      deps(),
    );
    await res.text();
    const [row] = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, c.org));
    expect(row?.completionTokens).toBe(20);
    expect(row?.status).toBe("ok");
  });

  it("libère tout quand l'agent échoue sans rien livrer", async () => {
    const a = await agent();
    const c = await client();
    upstream = () =>
      sse([
        ev({
          error: {
            message: "L'agent a échoué",
            type: "api_error",
            code: "agent_failed",
            param: null,
          },
        }),
        "data: [DONE]\n\n",
      ]);
    const res = await handleChatCompletions(
      post(c.key, ask(a.slug, { stream: true })),
      deps(),
    );
    await res.text();
    expect(await getAccount(t.db, c.org)).toMatchObject({
      balanceMicro: 10n * M,
      heldMicro: 0n,
    });
    const [row] = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, c.org));
    expect(row).toMatchObject({
      status: "error",
      costMicro: 0n,
      runFeeMicro: 0n,
    });
  });
});

describe("accès, révocation, retrait, coffre", () => {
  it("refuse une clé révoquée (401) et une clé inconnue", async () => {
    const a = await agent();
    const c = await client();
    expect(
      (await handleChatCompletions(post(c.key, ask(a.slug)), deps())).status,
    ).toBe(200);
    await revokeApiKey(t.db, c.org, c.record.id);
    const res = await handleChatCompletions(post(c.key, ask(a.slug)), deps());
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("api_key_revoked");
    expect(calls).toHaveLength(1);
  });

  it("répond 404 pour un agent retiré, brouillon ou inconnu, sans appel amont", async () => {
    const retired = await agent();
    const draft = await agent({ published: false });
    const c = await client();
    await updateAgent(t.db, retired.id, { status: "retired" });
    for (const slug of [retired.slug, draft.slug, "inconnu-total"]) {
      const res = await handleChatCompletions(post(c.key, ask(slug)), deps());
      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe("model_not_found");
    }
    expect(calls).toHaveLength(0);
    expect(await getAccount(t.db, c.org)).toMatchObject({
      balanceMicro: 10n * M,
      heldMicro: 0n,
    });
  });

  it("applique la liste de modèles autorisés de la clé et la visibilité privée", async () => {
    const open = await agent();
    const priv = await agent({ visibility: "private" });
    const plain = await client();
    expect(
      (await handleChatCompletions(post(plain.key, ask(priv.slug)), deps()))
        .status,
    ).toBe(404);
    const onlyModels = await client(10n, {
      allowedModels: ["nexora/test-chat"],
    });
    expect(
      (
        await handleChatCompletions(
          post(onlyModels.key, ask(open.slug)),
          deps(),
        )
      ).status,
    ).toBe(404);
    const allowed = await client(10n, {
      allowedModels: [`agent/${priv.slug}`],
    });
    expect(
      (await handleChatCompletions(post(allowed.key, ask(priv.slug)), deps()))
        .status,
    ).toBe(200);
  });

  it("répond par une erreur propre quand la clé WorkStudio manque du coffre, sans réserver ni rien révéler", async () => {
    const a = await agent();
    vault.delete(`workstudio.${a.slug}`);
    const c = await client();
    const res = await handleChatCompletions(post(c.key, ask(a.slug)), deps());
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(JSON.parse(text).error.code).toBe("agent_unavailable");
    expect(text).not.toContain("workstudio.");
    expect(text).not.toContain("sk-nexora");
    expect(text).not.toContain("introuvable");
    expect(calls).toHaveLength(0);
    expect(await getAccount(t.db, c.org)).toMatchObject({
      balanceMicro: 10n * M,
      heldMicro: 0n,
    });
    expect(lines.join("\n")).not.toContain(`workstudio.${a.slug}`);
  });

  it("répond de même quand l'instance a perdu sa référence de coffre après la publication", async () => {
    const a = await agent();
    await updateInstance(t.db, a.instanceId, { secretRef: null });
    const c = await client();
    const res = await handleChatCompletions(post(c.key, ask(a.slug)), deps());
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("agent_unavailable");
    expect(calls).toHaveLength(0);
    expect(await getAccount(t.db, c.org)).toMatchObject({
      balanceMicro: 10n * M,
      heldMicro: 0n,
    });
  });
});

describe("échecs de WorkStudio", () => {
  it("libère tout si WorkStudio répond par une erreur ou est injoignable", async () => {
    const a = await agent();
    const c = await client();
    upstream = () =>
      Response.json(
        { error: { message: "interne", code: "x" } },
        { status: 500 },
      );
    const res = await handleChatCompletions(post(c.key, ask(a.slug)), deps());
    expect(res.status).toBe(502);
    upstream = () => {
      throw new Error("ECONNREFUSED");
    };
    const res2 = await handleChatCompletions(post(c.key, ask(a.slug)), deps());
    expect(res2.status).toBe(502);
    expect(await getAccount(t.db, c.org)).toMatchObject({
      balanceMicro: 10n * M,
      heldMicro: 0n,
    });
    const rows = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, c.org));
    expect(rows.every((r) => r.status === "error" && r.costMicro === 0n)).toBe(
      true,
    );
  });

  it("n'expose pas un refus de la clé WorkStudio (403) comme une faute du client", async () => {
    const a = await agent();
    const c = await client();
    upstream = () =>
      Response.json(
        {
          error: {
            message: "model_not_allowed pour cette clé",
            code: "model_not_allowed",
          },
        },
        { status: 403 },
      );
    const res = await handleChatCompletions(post(c.key, ask(a.slug)), deps());
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).not.toContain("model_not_allowed");
    expect(await getAccount(t.db, c.org)).toMatchObject({
      balanceMicro: 10n * M,
      heldMicro: 0n,
    });
  });
});

describe("liste des modèles et confidentialité", () => {
  it("liste les agents publiés accessibles à la clé, avec leur prix d'essai, sans fuite", async () => {
    const open = await agent();
    const priv = await agent({ visibility: "private" });
    const gone = await agent();
    await updateAgent(t.db, gone.id, { status: "retired" });
    const c = await client();
    const res = await handleModels(
      new Request("http://localhost/v1/models", {
        headers: { authorization: `Bearer ${c.key}` },
      }),
      deps(),
    );
    const json = await res.json();
    const ids: string[] = json.data.map((m: { id: string }) => m.id);
    expect(ids).toContain(`agent/${open.slug}`);
    expect(ids).not.toContain(`agent/${priv.slug}`);
    expect(ids).not.toContain(`agent/${gone.slug}`);
    const entry = json.data.find(
      (m: { id: string }) => m.id === `agent/${open.slug}`,
    );
    expect(entry).toMatchObject({
      object: "model",
      type: "agent",
      residency: "quebec",
      pricing: {
        currency: "CAD",
        unit: "per_million_tokens",
        input: "1",
        output: "3",
        per_run: "0.05",
        trial: true,
      },
    });
    expect(JSON.stringify(json)).not.toContain("ws.internal");
    expect(JSON.stringify(json)).not.toContain("workstudio.");
    expect(JSON.stringify(json)).not.toContain("agent:Assistant");

    const scoped = await client(10n, { allowedModels: [`agent/${priv.slug}`] });
    const res2 = await handleModels(
      new Request("http://localhost/v1/models", {
        headers: { authorization: `Bearer ${scoped.key}` },
      }),
      deps(),
    );
    const ids2: string[] = (await res2.json()).data.map(
      (m: { id: string }) => m.id,
    );
    expect(ids2).toEqual([`agent/${priv.slug}`]);
  });

  it("ne laisse aucune trace du contenu, des clés ni de l'adresse de l'instance dans les journaux", async () => {
    const a = await agent();
    const c = await client();
    await handleChatCompletions(post(c.key, ask(a.slug)), deps());
    await handleChatCompletions(
      post(c.key, ask(a.slug, { stream: true })),
      deps(),
    );
    const logs = lines.join("\n");
    expect(logs).toContain("requête réglée");
    for (const secret of [PROMPT_MARKER, WS_KEY, c.key, MASTER, "ws.internal"])
      expect(logs).not.toContain(secret);
  });
});
