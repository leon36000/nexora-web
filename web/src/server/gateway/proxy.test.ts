import {
  apiKeys,
  credit,
  creditReservations,
  debit,
  deriveBalance,
  eq,
  getAccount,
  usageEvents,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { estimateOutputTokens } from "./estimate";
import { setBillingMode } from "./house";
import { createApiKey, revokeApiKey } from "./keys";
import { requestCost } from "./pricing";
import {
  type GatewayDeps,
  handleChatCompletions,
  handleEmbeddings,
  handleModels,
  resetModelsCache,
} from "./proxy";
import {
  newOrganization,
  publishTestCatalog,
  testPrivacyRouter,
} from "./test-support";

const MASTER = "sk-master-litellm-key-1234567890";
const PROMPT_MARKER = "CONTENU-SECRET-DU-CLIENT-À-NE-JAMAIS-JOURNALISER";
const M = 1_000_000n;
// 1 CAD / M en entrée, 3 CAD / M en sortie
const PRICE = { input: 1_000_000n, output: 3_000_000n, cache: null };

let t: TestDatabase;
let lines: string[];
let counter = 0;

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

const usageBody = {
  prompt_tokens: 120,
  completion_tokens: 40,
  total_tokens: 160,
};
const upstreamOk = (usage: Record<string, unknown> = usageBody) =>
  Response.json({
    id: "gen-1",
    object: "chat.completion",
    created: 1,
    model: "nexora/test-chat",
    provider: "Wafer",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: { role: "assistant", content: "Bonjour !" },
      },
    ],
    usage: {
      ...usage,
      cost: 0.123,
      cost_details: { upstream_inference_cost: 0.1 },
      is_byok: false,
    },
  });

function sse(events: string[], splitAt?: number): Response {
  const text = events.join("");
  const enc = new TextEncoder();
  const parts = splitAt
    ? [text.slice(0, splitAt), text.slice(splitAt)]
    : [text];
  return new Response(
    new ReadableStream({
      async start(c) {
        for (const p of parts) {
          c.enqueue(enc.encode(p));
          await new Promise((r) => setTimeout(r, 5));
        }
        c.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}
const ev = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
const chunk = (content: string) =>
  ev({
    id: "g",
    object: "chat.completion.chunk",
    model: "nexora/test-chat",
    provider: "Wafer",
    choices: [{ index: 0, delta: { content }, finish_reason: null }],
  });
const usageChunk = (u = usageBody) =>
  ev({
    id: "g",
    object: "chat.completion.chunk",
    model: "nexora/test-chat",
    choices: [],
    usage: { ...u, cost: 0.5, cost_details: { upstream_inference_cost: 0.4 } },
  });

const deps = (
  over: Partial<GatewayDeps["limits"]> = {},
  now: () => Date = () => new Date(),
): GatewayDeps => ({
  db: () => t.db,
  fetch: (async (input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const call = {
      url: String(input),
      headers: new Headers(init?.headers),
      body,
    };
    calls.push(call);
    return upstream(call, init?.signal);
  }) as typeof fetch,
  litellm: () => ({
    baseUrl: "http://litellm.internal:4000",
    masterKey: MASTER,
  }),
  log: createLogger({ name: "test", sink: (l) => lines.push(l) }),
  now,
  privacy: testPrivacyRouter(t.db),
  requestId: () => `req_test_${++counter}`,
  limits: {
    defaultRpm: 1000,
    defaultTpm: 10_000_000,
    maxBodyBytes: 1_000_000,
    upstreamTimeoutMs: 10_000,
    streamTimeoutMs: 10_000,
    defaultMaxOutputTokens: 1000,
    ...over,
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
const chat = (extra: Record<string, unknown> = {}) => ({
  model: "nexora/test-chat",
  messages: [{ role: "user", content: `Bonjour ${PROMPT_MARKER}` }],
  max_tokens: 200,
  ...extra,
});

async function client(
  creditCad = 10n,
  keyOptions: Parameters<typeof createApiKey>[1] extends infer T
    ? Partial<T>
    : never = {},
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

beforeAll(async () => {
  t = await createTestDatabase();
  await publishTestCatalog(t.db, [
    { publicId: "nexora/test-chat" },
    { publicId: "nexora/test-private", visibility: "private" },
    {
      publicId: "nexora/test-windows",
      windows: [
        {
          label: "creux",
          days: [0, 6],
          startMinute: 0,
          endMinute: 1440,
          upstream: { input: 50_000n, output: 100_000n },
          sell: { input: 400_000n, output: 1_200_000n },
        },
      ],
    },
    {
      publicId: "nexora/test-write",
      sellCache: 200_000n,
      sellCacheWrite: 2_000_000n,
    },
    {
      publicId: "nexora/test-route",
      routes: [{ input: 40_000n, output: 80_000n }],
    },
    {
      publicId: "nexora/test-embed",
      kind: "embedding",
      sellInput: 200_000n,
      sellOutput: 0n,
    },
    { publicId: "nexora/test-apercu", availability: "preview" },
    {
      publicId: "nexora/test-apercu-embed",
      kind: "embedding",
      sellInput: 200_000n,
      sellOutput: 0n,
      availability: "preview",
    },
  ]);
});
afterAll(async () => {
  await t.drop();
});
const reset = () => {
  lines = [];
  calls = [];
  upstream = () => upstreamOk();
};

import { beforeEach } from "vitest";

beforeEach(reset);

describe("authentification de la clé", () => {
  it("refuse une clé inconnue, au format OpenAI, sans appeler l'amont", async () => {
    const res = await handleChatCompletions(
      post(`nxk_${"a".repeat(43)}`, chat()),
      deps(),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatchObject({
      code: "invalid_api_key",
      type: "authentication_error",
    });
    expect(calls).toHaveLength(0);
  });

  it("refuse une clé révoquée", async () => {
    const c = await client();
    expect(
      (await handleChatCompletions(post(c.key, chat()), deps())).status,
    ).toBe(200);
    await revokeApiKey(t.db, c.org, c.record.id);
    const res = await handleChatCompletions(post(c.key, chat()), deps());
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("api_key_revoked");
    expect(calls).toHaveLength(1);
  });

  it("refuse un modèle non autorisé pour la clé, et un modèle privé sans autorisation", async () => {
    const restricted = await client(10n, {
      allowedModels: ["nexora/test-embed"],
    });
    expect(
      (await handleChatCompletions(post(restricted.key, chat()), deps()))
        .status,
    ).toBe(404);
    const open = await client();
    const priv = await handleChatCompletions(
      post(open.key, chat({ model: "nexora/test-private" })),
      deps(),
    );
    expect(priv.status).toBe(404);
    const allowed = await client(10n, {
      allowedModels: ["nexora/test-private"],
    });
    expect(
      (
        await handleChatCompletions(
          post(allowed.key, chat({ model: "nexora/test-private" })),
          deps(),
        )
      ).status,
    ).toBe(200);
  });
});

describe("réservation, règlement et libération", () => {
  it("débite exactement le coût réel et libère le reste de la réservation", async () => {
    const c = await client(10n);
    const res = await handleChatCompletions(post(c.key, chat()), deps());
    expect(res.status).toBe(200);
    const expected = requestCost(
      { prompt: 120, completion: 40, cached: 0 },
      PRICE,
    ); // 120 + 120
    expect(expected).toBe(240n);
    expect(res.headers.get("x-nexora-cost-micro")).toBe("240");
    const acct = await getAccount(t.db, c.org);
    expect(acct.balanceMicro).toBe(10n * M - 240n);
    expect(acct.heldMicro).toBe(0n);
    expect(await deriveBalance(t.db, c.org)).toEqual({
      balanceMicro: acct.balanceMicro,
      heldMicro: 0n,
    });
    const [res1] = await t.db
      .select()
      .from(creditReservations)
      .where(eq(creditReservations.organizationId, c.org));
    expect(res1).toMatchObject({ status: "settled", settledMicro: 240n });

    const [ev] = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, c.org));
    expect(ev).toMatchObject({
      status: "ok",
      endpoint: "chat.completions",
      modelPublicId: "nexora/test-chat",
      promptTokens: 120,
      completionTokens: 40,
      costMicro: 240n,
      priceInputMicro: 1_000_000n,
      priceOutputMicro: 3_000_000n,
      stream: false,
      apiKeyId: c.record.id,
    });
    // 120 × 0,1 + 40 × 0,2 = 20 µUSD
    expect(ev?.upstreamCostUsdMicro).toBe(20n);
    expect(ev?.configVersion).toMatch(/^cat_[0-9a-f]{16}$/);
  });

  it("réserve le coût maximal (entrée estimée + sortie bornée) avant l'appel et borne la sortie", async () => {
    const c = await client(10n);
    let heldDuringCall = 0n;
    upstream = async () => {
      heldDuringCall = (await getAccount(t.db, c.org)).heldMicro;
      return upstreamOk();
    };
    await handleChatCompletions(post(c.key, chat({ max_tokens: 500 })), deps());
    expect(heldDuringCall).toBeGreaterThan(500n * 3n); // au moins 500 jetons de sortie à 3 µ/jeton
    expect(heldDuringCall).toBeLessThan(2000n);
    expect(calls[0]?.body.max_tokens).toBe(500);
    // sans max_tokens : le plafond du modèle est transmis
    await handleChatCompletions(
      post(c.key, {
        model: "nexora/test-chat",
        messages: [{ role: "user", content: "x" }],
      }),
      deps(),
    );
    expect(calls[1]?.body.max_tokens).toBe(1000);
    // au-delà du plafond du modèle : refus clair
    const tooMuch = await handleChatCompletions(
      post(c.key, chat({ max_tokens: 5000 })),
      deps(),
    );
    expect(tooMuch.status).toBe(400);
    expect((await tooMuch.json()).error.code).toBe("invalid_max_tokens");
  });

  it("refuse en 402 (format OpenAI) quand le solde est insuffisant, sans appeler l'amont", async () => {
    const c = await client(0n);
    const res = await handleChatCompletions(post(c.key, chat()), deps());
    expect(res.status).toBe(402);
    const { error } = await res.json();
    expect(error).toMatchObject({
      code: "insufficient_quota",
      type: "insufficient_quota",
    });
    // Aucun crédit : message clair en français avec le chemin vers la recharge et l'abonnement.
    expect(error.message).toMatch(/^Il ne vous reste plus de crédits\./);
    expect(error.message).toContain("/compte/facturation#ajouter-des-fonds");
    expect(error.message).toContain("/tarifs");
    expect(calls).toHaveLength(0);
    expect(
      await t.db
        .select()
        .from(usageEvents)
        .where(eq(usageEvents.organizationId, c.org)),
    ).toHaveLength(0);
  });

  it("refuse un compte au solde négatif (remboursement ou litige)", async () => {
    const c = await client(1n);
    await debit(t.db, {
      organizationId: c.org,
      amountMicro: 2n * M,
      idempotencyKey: `refund:${c.org}`,
      configVersion: "t",
      kind: "refund",
      source: "stripe_refund",
    });
    const res = await handleChatCompletions(post(c.key, chat()), deps());
    expect(res.status).toBe(402);
    expect((await res.json()).error.code).toBe("account_blocked");
  });

  it("libère toute la réservation quand l'amont échoue : rien n'est débité", async () => {
    const c = await client(10n);
    upstream = () =>
      Response.json({ error: { message: "kaboom interne" } }, { status: 500 });
    const res = await handleChatCompletions(post(c.key, chat()), deps());
    expect(res.status).toBe(502);
    const acct = await getAccount(t.db, c.org);
    expect(acct).toMatchObject({ balanceMicro: 10n * M, heldMicro: 0n });
    const [ev] = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, c.org));
    expect(ev).toMatchObject({
      status: "error",
      costMicro: 0n,
      httpStatus: 502,
    });
    const [r] = await t.db
      .select()
      .from(creditReservations)
      .where(eq(creditReservations.organizationId, c.org));
    expect(r?.status).toBe("released");
  });

  it("20 appels concurrents ne dépassent jamais le solde", async () => {
    const c = await client(0n);
    // solde = 5 réservations maximales (≈ 200×3 + entrée estimée), l'amont est lent : les réservations se chevauchent
    const probe = await client(10n);
    let reservedOne = 0n;
    upstream = async () => {
      reservedOne = (await getAccount(t.db, probe.org)).heldMicro;
      return upstreamOk();
    };
    await handleChatCompletions(post(probe.key, chat()), deps());
    expect(reservedOne).toBeGreaterThan(0n);

    const balance = reservedOne * 5n + reservedOne / 2n;
    await credit(t.db, {
      organizationId: c.org,
      amountMicro: balance,
      idempotencyKey: `fund2:${c.org}`,
      configVersion: "t",
      source: "test",
    });
    upstream = async () => {
      await new Promise((r) => setTimeout(r, 400));
      return upstreamOk();
    };
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        handleChatCompletions(post(c.key, chat()), deps()),
      ),
    );
    const statuses = results.map((r) => r.status);
    const ok = statuses.filter((s) => s === 200).length;
    expect(ok).toBe(5); // jamais plus que ce que le solde permet de réserver en même temps
    expect(statuses.filter((s) => s === 402)).toHaveLength(15);
    const acct = await getAccount(t.db, c.org);
    expect(acct.heldMicro).toBe(0n);
    expect(acct.balanceMicro).toBe(balance - 5n * 240n);
    expect(acct.balanceMicro).toBeGreaterThanOrEqual(0n);
    expect(await deriveBalance(t.db, c.org)).toEqual({
      balanceMicro: acct.balanceMicro,
      heldMicro: 0n,
    });
    const events = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, c.org));
    expect(events).toHaveLength(5);
  });

  it("règle au coût RÉEL quand l'amont rapporte plus que la réservation : le dépassement est facturé", async () => {
    const c = await client(10n);
    upstream = () =>
      upstreamOk({
        prompt_tokens: 100,
        completion_tokens: 900_000,
        total_tokens: 900_100,
      });
    const res = await handleChatCompletions(
      post(c.key, chat({ max_tokens: 50 })),
      deps(),
    );
    expect(res.status).toBe(200);
    const [ev] = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, c.org));
    const [r] = await t.db
      .select()
      .from(creditReservations)
      .where(eq(creditReservations.organizationId, c.org));
    const real = requestCost(
      { prompt: 100, completion: 900_000, cached: 0 },
      PRICE,
    );
    expect(real).toBe(2_700_100n);
    expect(r?.amountMicro).toBeLessThan(real);
    expect(ev?.costMicro).toBe(real);
    expect(res.headers.get("x-nexora-cost-micro")).toBe(real.toString());
    expect((await getAccount(t.db, c.org)).balanceMicro).toBe(10n * M - real);
    // Dérive journalisée, sans contenu.
    const warn = lines
      .map((l) => JSON.parse(l))
      .find((l) => l.msg?.includes("très supérieur"));
    expect(warn).toBeDefined();
    expect(warn.costMicro).toBe(real.toString());
    expect(lines.join("\n")).not.toContain(PROMPT_MARKER);
  });

  it("réservation sous-estimée : le solde devient négatif et l'appel suivant répond 402", async () => {
    const c = await client(2n, { spendCapMicro: 20n * M });
    upstream = () =>
      upstreamOk({
        prompt_tokens: 100,
        completion_tokens: 900_000,
        total_tokens: 900_100,
      });
    const first = await handleChatCompletions(
      post(c.key, chat({ max_tokens: 50 })),
      deps(),
    );
    expect(first.status).toBe(200);
    const account = await getAccount(t.db, c.org);
    expect(account.balanceMicro).toBe(2n * M - 2_700_100n);
    expect(account).toMatchObject({ blocked: true, heldMicro: 0n });
    const [k] = await t.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, c.record.id));
    expect(k?.spentMicro).toBe(2_700_100n);
    const calls1 = calls.length;
    const second = await handleChatCompletions(post(c.key, chat()), deps());
    expect(second.status).toBe(402);
    expect((await second.json()).error.code).toBe("account_blocked");
    expect(calls).toHaveLength(calls1); // l'amont n'est pas appelé
  });

  it("des images par adresse avec max_tokens = 1 : la réservation couvre les images, plus l'URL seule", async () => {
    const c = await client(10n);
    const images = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        type: "image_url",
        image_url: { url: `https://img.example/${i}.png` },
      }));
    const res = await handleChatCompletions(
      post(
        c.key,
        chat({
          max_tokens: 1,
          messages: [{ role: "user", content: images(15) }],
        }),
      ),
      deps(),
    );
    expect(res.status).toBe(200);
    const [r] = await t.db
      .select()
      .from(creditReservations)
      .where(eq(creditReservations.organizationId, c.org));
    // 15 images × 1 600 jetons × 1 CAD/M = 24 000 µCAD au minimum (avant : quelques centaines).
    expect(r?.amountMicro).toBeGreaterThanOrEqual(24_000n);
    // 50 images dépassent le contexte du modèle d'essai (32 000 jetons) une fois comptées au forfait.
    const tooMany = await handleChatCompletions(
      post(
        c.key,
        chat({
          max_tokens: 1,
          messages: [{ role: "user", content: images(50) }],
        }),
      ),
      deps(),
    );
    expect(tooMany.status).toBe(400);
    expect((await tooMany.json()).error.code).toBe("context_length_exceeded");
  });

  it("la réservation couvre le texte caché derrière une clé image_url et les paramètres transmis (response_format, tool_choice, stop)", async () => {
    const reservedFor = async (body: Record<string, unknown>) => {
      const c = await client(10n);
      const res = await handleChatCompletions(post(c.key, body), deps());
      expect(res.status).toBe(200);
      const [r] = await t.db
        .select()
        .from(creditReservations)
        .where(eq(creditReservations.organizationId, c.org));
      return r?.amountMicro ?? 0n;
    };
    const hidden = "h".repeat(30_000); // 10 000 jetons = 10 000 µCAD d'entrée
    const base = await reservedFor(chat({ max_tokens: 1 }));
    // 1) objet type:text portant une clé image_url (forfait média de 1 600 jetons au lieu du texte)
    const viaImageKey = await reservedFor(
      chat({
        max_tokens: 1,
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: hidden, image_url: "x" }],
          },
        ],
      }),
    );
    expect(viaImageKey - base).toBeGreaterThanOrEqual(9_000n);
    // 2) texte placé dans response_format, tool_choice et stop (transmis à l'amont, comptés jusqu'ici pour rien)
    const viaResponseFormat = await reservedFor(
      chat({
        max_tokens: 1,
        response_format: {
          type: "json_schema",
          json_schema: { name: "s", schema: { description: hidden } },
        },
      }),
    );
    expect(viaResponseFormat - base).toBeGreaterThanOrEqual(9_000n);
    const viaToolChoice = await reservedFor(
      chat({
        max_tokens: 1,
        tool_choice: { type: "function", function: { name: hidden } },
      }),
    );
    expect(viaToolChoice - base).toBeGreaterThanOrEqual(9_000n);
    const viaStop = await reservedFor(
      chat({ max_tokens: 1, stop: [hidden.slice(0, 120), hidden] }),
    );
    expect(viaStop - base).toBeGreaterThanOrEqual(9_000n);
  });

  it("facture les jetons en cache au tarif de cache", async () => {
    const org = await newOrganization(t.db);
    await credit(t.db, {
      organizationId: org,
      amountMicro: 10n * M,
      idempotencyKey: `fund:${org}`,
      configVersion: "t",
      source: "test",
    });
    const { key } = await createApiKey(t.db, {
      organizationId: org,
      name: "c",
    });
    upstream = () =>
      upstreamOk({
        prompt_tokens: 1000,
        // « Bonjour ! » est livré : une sortie à 0 serait refusée comme exacte (audit F-03), le bloc doit être cohérent.
        completion_tokens: 3,
        total_tokens: 1003,
        prompt_tokens_details: { cached_tokens: 400 },
      });
    // l'estimation d'entrée doit couvrir l'usage rapporté (elle est prudente : 1 jeton pour 3 octets)
    const res = await handleChatCompletions(
      post(
        key,
        chat({ messages: [{ role: "user", content: "x".repeat(3600) }] }),
      ),
      deps(),
    );
    // pas de tarif de cache sur nexora/test-chat : l'entrée complète s'applique (1000 µCAD) + 3 jetons de sortie (9 µCAD)
    expect(res.headers.get("x-nexora-cost-micro")).toBe("1009");
    const [ev] = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, org));
    expect(ev?.cachedTokens).toBe(400);
  });
});

describe("réponse non diffusée", () => {
  it("renvoie le contrat OpenAI sans révéler l'amont (fournisseur, coûts, clé maîtresse)", async () => {
    const c = await client();
    const res = await handleChatCompletions(post(c.key, chat()), deps());
    const text = await res.text();
    const json = JSON.parse(text);
    expect(json.choices[0].message.content).toBe("Bonjour !");
    expect(json.model).toBe("nexora/test-chat");
    expect(json).not.toHaveProperty("provider");
    expect(json.usage).not.toHaveProperty("cost");
    expect(json.usage).not.toHaveProperty("cost_details");
    expect(text).not.toContain(MASTER);
    for (const [k, v] of res.headers) expect(`${k}:${v}`).not.toContain(MASTER);
    expect(res.headers.get("x-request-id")).toMatch(/^req_test_/);
    expect(res.headers.get("x-nexora-residency")).toBe("quebec");
    expect(res.headers.get("x-ratelimit-limit-requests")).toBe("1000");
  });

  it("appelle LiteLLM avec la clé maîtresse et ne transmet que les paramètres connus", async () => {
    const c = await client();
    await handleChatCompletions(
      post(
        c.key,
        chat({
          api_base: "http://evil.example",
          api_key: "sk-pirate",
          metadata: { x: 1 },
          mock_response: "gratuit",
          temperature: 0.2,
          n: 1,
        }),
      ),
      deps(),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      "http://litellm.internal:4000/v1/chat/completions",
    );
    expect(calls[0]?.headers.get("authorization")).toBe(`Bearer ${MASTER}`);
    expect(Object.keys(calls[0]?.body ?? {}).sort()).toEqual([
      "max_tokens",
      "messages",
      "model",
      "temperature",
    ]);
    expect(calls[0]?.headers.get("authorization")).not.toContain(c.key);
  });

  it("valide la requête : JSON, modèle, messages, n > 1", async () => {
    const c = await client();
    const r1 = await handleChatCompletions(
      new Request("http://x/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${c.key}` },
        body: "{pas du json",
      }),
      deps(),
    );
    expect(r1.status).toBe(400);
    expect(
      (await handleChatCompletions(post(c.key, { messages: [] }), deps()))
        .status,
    ).toBe(400);
    expect(
      (
        await handleChatCompletions(
          post(c.key, chat({ model: "nexora/inconnu" })),
          deps(),
        )
      ).status,
    ).toBe(404);
    expect(
      (await handleChatCompletions(post(c.key, chat({ messages: [] })), deps()))
        .status,
    ).toBe(400);
    expect(
      (await handleChatCompletions(post(c.key, chat({ n: 3 })), deps())).status,
    ).toBe(400);
    expect(
      (
        await handleChatCompletions(
          post(c.key, chat({ model: "nexora/test-embed" })),
          deps(),
        )
      ).status,
    ).toBe(400);
    expect(calls).toHaveLength(0);
    const big = await handleChatCompletions(
      post(
        c.key,
        chat({ messages: [{ role: "user", content: "x".repeat(2000) }] }),
      ),
      deps({ maxBodyBytes: 500 }),
    );
    expect(big.status).toBe(413);
  });
});

describe("flux SSE", () => {
  const events = [
    chunk("Bon"),
    chunk("jour"),
    usageChunk(),
    "data: [DONE]\n\n",
  ];

  it("transmet le flux, règle au coût réel avant la fin et cache l'usage non demandé", async () => {
    const c = await client();
    upstream = () => sse(events);
    const res = await handleChatCompletions(
      post(c.key, chat({ stream: true })),
      deps(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const body = await res.text();
    expect(body).toContain('"content":"Bon"');
    expect(body).toContain("data: [DONE]");
    expect(body).not.toContain('"usage"'); // le client n'a pas demandé stream_options.include_usage
    expect(body).not.toContain("Wafer");
    expect(body).not.toContain("cost");
    // l'amont a reçu include_usage
    expect(calls[0]?.body).toMatchObject({
      stream: true,
      stream_options: { include_usage: true },
    });
    // le règlement est fait avant que le flux ne se ferme
    const acct = await getAccount(t.db, c.org);
    expect(acct).toMatchObject({ balanceMicro: 10n * M - 240n, heldMicro: 0n });
    const [ev] = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, c.org));
    expect(ev).toMatchObject({
      status: "ok",
      stream: true,
      costMicro: 240n,
      promptTokens: 120,
      completionTokens: 40,
    });
  });

  it("le grand livre est à jour dès que le client lit [DONE], sans attendre la fermeture du flux", async () => {
    const c = await client();
    upstream = () => sse(events);
    const res = await handleChatCompletions(
      post(c.key, chat({ stream: true })),
      deps(),
    );
    const reader = res.body?.getReader();
    if (!reader) throw new Error("flux attendu");
    const decoder = new TextDecoder();
    let seen = "";
    while (!seen.includes("[DONE]")) {
      const { done, value } = await reader.read();
      if (done) break;
      seen += decoder.decode(value);
    }
    expect(seen).toContain("[DONE]");
    const acct = await getAccount(t.db, c.org);
    expect(acct).toMatchObject({ balanceMicro: 10n * M - 240n, heldMicro: 0n });
    await reader.cancel();
  });

  it("garde l'usage dans le flux quand le client l'a demandé, sans les coûts amont", async () => {
    const c = await client();
    upstream = () => sse(events);
    const res = await handleChatCompletions(
      post(
        c.key,
        chat({ stream: true, stream_options: { include_usage: true } }),
      ),
      deps(),
    );
    const body = await res.text();
    expect(body).toContain('"prompt_tokens":120');
    expect(body).not.toContain("cost");
  });

  it("reste correct quand un événement est coupé entre deux paquets réseau", async () => {
    const c = await client();
    const joined = events.join("");
    upstream = () => sse(events, Math.floor(joined.indexOf("jour") + 2));
    const res = await handleChatCompletions(
      post(c.key, chat({ stream: true })),
      deps(),
    );
    const body = await res.text();
    expect(body).toContain('"content":"jour"');
    const [ev] = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, c.org));
    expect(ev?.costMicro).toBe(240n);
  });

  it("une erreur de l'amont avant le flux libère la réservation", async () => {
    const c = await client();
    upstream = () =>
      Response.json({ error: { message: "x" } }, { status: 503 });
    const res = await handleChatCompletions(
      post(c.key, chat({ stream: true })),
      deps(),
    );
    expect(res.status).toBe(502);
    expect(await getAccount(t.db, c.org)).toMatchObject({
      balanceMicro: 10n * M,
      heldMicro: 0n,
    });
  });

  it("le client qui ferme le flux : l'amont est coupé, le livré est facturé (estimé), le reste libéré", async () => {
    const c = await client();
    let upstreamAborted = false;
    upstream = (_call, signal) => {
      signal?.addEventListener("abort", () => {
        upstreamAborted = true;
      });
      const enc = new TextEncoder();
      return new Response(
        new ReadableStream({
          async start(ctrl) {
            ctrl.enqueue(enc.encode(chunk("Une longue réponse ".repeat(5))));
            await new Promise((r) => setTimeout(r, 2000)); // l'amont continue à produire
            ctrl.close();
          },
          cancel() {
            upstreamAborted = true;
          },
        }),
      );
    };
    const res = await handleChatCompletions(
      post(c.key, chat({ stream: true })),
      deps(),
    );
    const reader = res.body?.getReader();
    if (!reader) throw new Error("flux attendu");
    await reader.read();
    await reader.cancel();
    await new Promise((r) => setTimeout(r, 100));
    expect(upstreamAborted).toBe(true);
    const acct = await getAccount(t.db, c.org);
    expect(acct.heldMicro).toBe(0n);
    const [ev] = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, c.org));
    expect(ev?.status).toBe("aborted");
    expect(ev?.costMicro).toBeGreaterThan(0n);
    expect(acct.balanceMicro).toBe(10n * M - (ev?.costMicro ?? 0n));
  });
});

describe("flux coupé avant le bloc d'usage : ce qui a été livré ou consommé est facturé", () => {
  const toolDelta = (args: string, extra: Record<string, unknown> = {}) =>
    ev({
      id: "g",
      object: "chat.completion.chunk",
      model: "nexora/test-chat",
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "call_1",
                function: { name: "meteo", arguments: args },
              },
            ],
            ...extra,
          },
          finish_reason: null,
        },
      ],
    });
  const cut = (chunks: string[]) => () => {
    const enc = new TextEncoder();
    return new Response(
      new ReadableStream({
        async start(ctrl) {
          for (const c of chunks) {
            ctrl.enqueue(enc.encode(c));
            await new Promise((r) => setTimeout(r, 3));
          }
          ctrl.close(); // fin sans bloc d'usage ni [DONE]
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    );
  };
  const eventOf = async (org: string) =>
    (
      await t.db
        .select()
        .from(usageEvents)
        .where(eq(usageEvents.organizationId, org))
    )[0];

  it("appels d'outils sans texte : l'invite estimée ET les arguments estimés sont facturés", async () => {
    const c = await client();
    const args = ['{"ville":', '"Québec","unite":', '"celsius"}'];
    upstream = cut(args.map((a) => toolDelta(a)));
    const res = await handleChatCompletions(
      post(c.key, chat({ stream: true })),
      deps(),
    );
    await res.text();
    const e = await eventOf(c.org);
    expect(e?.status).toBe("aborted");
    expect(e?.promptTokens).toBeGreaterThan(0);
    expect(e?.completionTokens).toBe(
      estimateOutputTokens(args.join("").length),
    );
    const expected = requestCost(
      {
        prompt: e?.promptTokens ?? 0,
        completion: e?.completionTokens ?? 0,
        cached: 0,
      },
      PRICE,
    );
    expect(e?.costMicro).toBe(expected);
    expect(expected).toBeGreaterThan(0n);
    expect(await getAccount(t.db, c.org)).toMatchObject({
      balanceMicro: 10n * M - expected,
      heldMicro: 0n,
    });
  });

  it("le raisonnement (delta.reasoning) est aussi compté", async () => {
    const c = await client();
    const think = "Je réfléchis à la question posée par le client. ".repeat(4);
    upstream = cut([
      ev({
        id: "g",
        object: "chat.completion.chunk",
        model: "nexora/test-chat",
        choices: [
          { index: 0, delta: { reasoning: think }, finish_reason: null },
        ],
      }),
    ]);
    const res = await handleChatCompletions(
      post(c.key, chat({ stream: true })),
      deps(),
    );
    await res.text();
    const e = await eventOf(c.org);
    expect(e?.status).toBe("aborted");
    expect(e?.completionTokens).toBe(estimateOutputTokens(think.length));
  });

  it("l'amont répond 200 puis le flux se termine sans rien livrer : l'invite estimée est facturée (pas zéro)", async () => {
    const c = await client();
    upstream = cut([]);
    const res = await handleChatCompletions(
      post(c.key, chat({ stream: true })),
      deps(),
    );
    await res.text();
    const e = await eventOf(c.org);
    expect(e?.status).toBe("aborted");
    expect(e?.completionTokens).toBe(0);
    expect(e?.promptTokens).toBeGreaterThan(0);
    expect(e?.costMicro).toBe(
      requestCost(
        { prompt: e?.promptTokens ?? 0, completion: 0, cached: 0 },
        PRICE,
      ),
    );
    expect(e?.costMicro).toBeGreaterThan(0n);
  });

  it("le client coupe avant le premier fragment : l'invite estimée est facturée", async () => {
    const c = await client();
    upstream = () =>
      new Response(
        new ReadableStream({
          async start(ctrl) {
            await new Promise((r) => setTimeout(r, 1500));
            ctrl.close();
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    const res = await handleChatCompletions(
      post(c.key, chat({ stream: true })),
      deps(),
    );
    const reader = res.body?.getReader();
    if (!reader) throw new Error("flux attendu");
    await reader.cancel();
    await new Promise((r) => setTimeout(r, 100));
    const e = await eventOf(c.org);
    expect(e?.status).toBe("aborted");
    expect(e?.errorCode).toBe("client_closed");
    expect(e?.costMicro).toBeGreaterThan(0n);
    expect((await getAccount(t.db, c.org)).heldMicro).toBe(0n);
  });
});

describe("le client annule avant la réponse de l'amont : l'invite estimée est facturée (jamais max_tokens)", () => {
  const eventOf = async (org: string) =>
    (
      await t.db
        .select()
        .from(usageEvents)
        .where(eq(usageEvents.organizationId, org))
    )[0];
  /** L'amont ne répond jamais ; il rejette à l'annulation du signal (comme fetch). */
  const hangingUpstream = () => {
    upstream = (_call, signal) =>
      new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () =>
          reject(new DOMException("annulé", "AbortError")),
        );
      });
  };
  const abortable = (key: string, body: unknown, signal: AbortSignal) =>
    new Request("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });

  it("requête non diffusée : invite estimée seulement, max_tokens n'est plus facturé (audit F-02)", async () => {
    const c = await client();
    hangingUpstream();
    const ac = new AbortController();
    const pending = handleChatCompletions(
      abortable(c.key, chat({ max_tokens: 200 }), ac.signal),
      deps(),
    );
    await new Promise((r) => setTimeout(r, 100));
    ac.abort();
    const res = await pending;
    expect(res.status).toBe(499);
    const e = await eventOf(c.org);
    expect(e?.status).toBe("aborted");
    expect(e?.errorCode).toBe("client_closed");
    expect(e?.promptTokens).toBeGreaterThan(0);
    // Test aligné : il figeait « invite + max_tokens (200) » sans mesure ; or l'appel amont est coupé et la même
    // requête menée à terme ne produit en général qu'une fraction du plafond (surfacturation jusqu'à ×105 mesurée).
    expect(e?.completionTokens).toBe(0);
    expect(e?.costMicro).toBe(
      requestCost(
        {
          prompt: e?.promptTokens ?? 0,
          completion: 0,
          cached: 0,
        },
        PRICE,
      ),
    );
    expect(e?.costMicro).toBeGreaterThan(0n);
    expect(await getAccount(t.db, c.org)).toMatchObject({
      balanceMicro: 10n * M - (e?.costMicro ?? 0n),
      heldMicro: 0n,
    });
  });

  it("flux : invite estimée seulement (rien n'a été livré)", async () => {
    const c = await client();
    hangingUpstream();
    const ac = new AbortController();
    const pending = handleChatCompletions(
      abortable(c.key, chat({ stream: true }), ac.signal),
      deps(),
    );
    await new Promise((r) => setTimeout(r, 100));
    ac.abort();
    expect((await pending).status).toBe(499);
    const e = await eventOf(c.org);
    expect(e?.status).toBe("aborted");
    expect(e?.promptTokens).toBeGreaterThan(0);
    expect(e?.completionTokens).toBe(0);
    expect(e?.costMicro).toBe(
      requestCost(
        { prompt: e?.promptTokens ?? 0, completion: 0, cached: 0 },
        PRICE,
      ),
    );
    expect(e?.costMicro).toBeGreaterThan(0n);
  });

  it("une panne de l'amont (injoignable, sans annulation du client) reste gratuite", async () => {
    const c = await client();
    upstream = () => {
      throw new TypeError("fetch failed");
    };
    const res = await handleChatCompletions(post(c.key, chat()), deps());
    expect(res.status).toBe(502);
    const e = await eventOf(c.org);
    expect(e?.status).toBe("error");
    expect(e?.costMicro).toBe(0n);
  });

  it("les appels à l'amont ne suivent jamais une redirection (redirect: error)", async () => {
    const c = await client();
    const d = deps();
    const seen: Array<RequestInit | undefined> = [];
    d.fetch = (async (_input, init) => {
      seen.push(init);
      return upstreamOk();
    }) as typeof fetch;
    await handleChatCompletions(post(c.key, chat()), d);
    expect(seen[0]?.redirect).toBe("error");
  });
});

describe("limites", () => {
  it("applique la limite de requêtes par minute de la clé (429 + Retry-After)", async () => {
    const c = await client(10n, { rpmLimit: 2 });
    expect(
      (await handleChatCompletions(post(c.key, chat()), deps())).status,
    ).toBe(200);
    expect(
      (await handleChatCompletions(post(c.key, chat()), deps())).status,
    ).toBe(200);
    const third = await handleChatCompletions(post(c.key, chat()), deps());
    expect(third.status).toBe(429);
    expect(Number(third.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await third.json()).error.code).toBe("rate_limit_exceeded");
    expect(calls).toHaveLength(2);
  });

  it("applique la limite de jetons par minute", async () => {
    const c = await client(10n, { tpmLimit: 1000 });
    const res = await handleChatCompletions(
      post(c.key, chat({ max_tokens: 990 })),
      deps(),
    );
    expect(res.status).toBe(429);
    expect(calls).toHaveLength(0);
  });

  it("applique le plafond de dépense de la clé, sans le dépasser sous charge", async () => {
    // une requête réserve environ 700 µCAD ; plafond à 2 000 : au plus 2 requêtes simultanées
    const c = await client(10n, { spendCapMicro: 2000n });
    upstream = async () => {
      await new Promise((r) => setTimeout(r, 200));
      return upstreamOk();
    };
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        handleChatCompletions(post(c.key, chat({ max_tokens: 200 })), deps()),
      ),
    );
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 200).length).toBeLessThanOrEqual(3);
    expect(statuses.filter((s) => s === 200).length).toBeGreaterThanOrEqual(1);
    for (const r of results)
      if (r.status !== 200)
        expect((await r.json()).error.code).toBe("api_key_spend_cap_reached");
    const [k] = await t.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, c.record.id));
    const ok = statuses.filter((s) => s === 200).length;
    expect(k?.spentMicro).toBe(BigInt(ok) * 240n);
    expect(k?.spentMicro).toBeLessThanOrEqual(2000n);
  });
});

describe("embeddings et liste des modèles", () => {
  it("facture l'entrée des embeddings", async () => {
    const c = await client();
    upstream = () =>
      Response.json({
        object: "list",
        data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2] }],
        model: "nexora/test-embed",
        provider: "X",
        usage: { prompt_tokens: 1000, total_tokens: 1000, cost: 1 },
      });
    const res = await handleEmbeddings(
      post(
        c.key,
        { model: "nexora/test-embed", input: "bonjour ".repeat(500) },
        "embeddings",
      ),
      deps(),
    );
    expect(res.status).toBe(200);
    expect(calls[0]?.url).toBe("http://litellm.internal:4000/v1/embeddings");
    // 1000 jetons × 0,2 CAD / M = 200 µCAD
    expect(res.headers.get("x-nexora-cost-micro")).toBe("200");
    expect((await res.json()).usage).not.toHaveProperty("cost");
    expect(
      (
        await handleEmbeddings(
          post(c.key, { model: "nexora/test-chat", input: "x" }, "embeddings"),
          deps(),
        )
      ).status,
    ).toBe(400);
  });

  it("liste le catalogue publié sans fuite (pas de coût amont, pas de modèle privé)", async () => {
    const res = await handleModels(new Request("http://x/v1/models"), deps());
    const json = await res.json();
    const ids = json.data.map((m: { id: string }) => m.id).sort();
    expect(ids).toEqual([
      "nexora/test-chat",
      "nexora/test-embed",
      "nexora/test-route",
      "nexora/test-windows",
      "nexora/test-write",
    ]);
    // fiche, écriture du cache et plages horaires : présentes (vides ici) dans chaque entrée
    const win = json.data.find(
      (m: { id: string }) => m.id === "nexora/test-windows",
    );
    expect(win.pricing.windows).toEqual([
      {
        label: "creux",
        days: [0, 6],
        start_minute: 0,
        end_minute: 1440,
        input: "0.4",
        output: "1.2",
      },
    ]);
    expect(win.sheet).toEqual({});
    const wr = json.data.find(
      (m: { id: string }) => m.id === "nexora/test-write",
    );
    expect(wr.pricing.cache_write).toBe("2");
    const text = JSON.stringify(json);
    expect(text).not.toContain("upstream");
    expect(text).not.toContain("127.0.0.1");
    expect(text).not.toContain("llm.");
    const chatModel = json.data.find(
      (m: { id: string }) => m.id === "nexora/test-chat",
    );
    expect(chatModel.pricing).toMatchObject({
      currency: "CAD",
      input: "1",
      output: "3",
    });
    expect(chatModel.residency).toBe("quebec");
    const bad = await handleModels(
      new Request("http://x/v1/models", {
        headers: { authorization: `Bearer nxk_${"z".repeat(43)}` },
      }),
      deps(),
    );
    expect(bad.status).toBe(401);
  });
});

describe("GET /v1/models : limite par adresse, cache HTTP et cache mémoire", () => {
  const listFrom = (ip: string, headers: Record<string, string> = {}) =>
    new Request("http://x/v1/models", {
      headers: { "x-forwarded-for": `${ip}, 10.0.0.1`, ...headers },
    });

  it("répond avec un Cache-Control public de 30 s (sans clé) et Vary", async () => {
    const res = await handleModels(listFrom("203.0.113.10"), deps());
    expect(res.status).toBe(200);
    const cc = res.headers.get("cache-control") ?? "";
    expect(cc).toContain("public");
    expect(cc).toContain("max-age=30");
    expect(cc).not.toContain("no-store");
    expect((res.headers.get("vary") ?? "").toLowerCase()).toContain(
      "authorization",
    );
  });

  it("une réponse propre à une clé n'est jamais mise en cache partagé", async () => {
    const c = await client();
    const res = await handleModels(
      listFrom("203.0.113.11", { authorization: `Bearer ${c.key}` }),
      deps(),
    );
    expect(res.status).toBe(200);
    const cc = res.headers.get("cache-control") ?? "";
    expect(cc).not.toContain("public");
  });

  it("limite les appels par adresse client (429 + Retry-After), sans toucher aux autres adresses", async () => {
    const d = deps({ modelsPerMinute: 3 });
    for (let i = 0; i < 3; i++)
      expect((await handleModels(listFrom("203.0.113.20"), d)).status).toBe(
        200,
      );
    const blocked = await handleModels(listFrom("203.0.113.20"), d);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await blocked.json()).error.code).toBe("rate_limit_exceeded");
    expect((await handleModels(listFrom("203.0.113.21"), d)).status).toBe(200);
    // Une clé invalide est aussi comptée (pas de bruteforce des clés sans limite).
    for (let i = 0; i < 3; i++)
      await handleModels(
        listFrom("203.0.113.22", {
          authorization: `Bearer nxk_${"y".repeat(43)}`,
        }),
        d,
      );
    expect(
      (
        await handleModels(
          listFrom("203.0.113.22", {
            authorization: `Bearer nxk_${"y".repeat(43)}`,
          }),
          d,
        )
      ).status,
    ).toBe(429);
  });

  it("le catalogue est mis en cache en mémoire : le second appel ne relit pas la base", async () => {
    resetModelsCache();
    let reads = 0;
    const counting = new Proxy(t.db, {
      get(target, prop, receiver) {
        if (prop === "select" || prop === "query" || prop === "execute")
          reads++;
        return Reflect.get(target, prop, receiver);
      },
    });
    const d = { ...deps(), db: () => counting };
    await handleModels(listFrom("203.0.113.30"), d);
    const afterFirst = reads;
    expect(afterFirst).toBeGreaterThan(0);
    await handleModels(listFrom("203.0.113.31"), d);
    expect(reads).toBe(afterFirst);
    // Expire après la durée du cache.
    const later = { ...d, now: () => new Date(Date.now() + 60_000) };
    await handleModels(listFrom("203.0.113.32"), later);
    expect(reads).toBeGreaterThan(afterFirst);
  });
});

describe("corps de requête plafonné pendant la lecture", () => {
  it("sans Content-Length, un flux plus gros que le plafond est coupé (413) sans être lu en entier", async () => {
    const c = await client();
    const state = { pulled: 0, cancelled: false };
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        if (state.pulled >= 500) return ctrl.close();
        state.pulled++;
        ctrl.enqueue(enc.encode("a".repeat(10_000)));
      },
      cancel() {
        state.cancelled = true;
      },
    });
    const req = new Request("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${c.key}`,
        "content-type": "application/json",
      },
      body,
      duplex: "half",
    } as RequestInit);
    const res = await handleChatCompletions(
      req,
      deps({ maxBodyBytes: 50_000 }),
    );
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("request_too_large");
    expect(state.cancelled).toBe(true);
    expect(state.pulled).toBeLessThan(30);
    expect(calls).toHaveLength(0);
  });

  it("un corps de plusieurs octets non ASCII est mesuré en octets, pas en caractères", async () => {
    const c = await client();
    const res = await handleChatCompletions(
      post(
        c.key,
        chat({ messages: [{ role: "user", content: "é".repeat(30_000) }] }),
      ),
      deps({ maxBodyBytes: 50_000 }),
    );
    expect(res.status).toBe(413);
  });
});

describe("refus 400/422 de l'amont : aucun détail du fournisseur n'est transmis", () => {
  it.each([400, 422])(
    "statut amont %i : message générique, sans fournisseur ni identifiant amont",
    async (status) => {
      const c = await client();
      upstream = () =>
        Response.json(
          {
            error: {
              message:
                "litellm.BadRequestError: OpenrouterException - provider Wafer rejected model qwen/qwen3-xyz-b200 at https://llm.interne.example:4000 (key sk-or-v1-abc)",
            },
          },
          { status },
        );
      const res = await handleChatCompletions(post(c.key, chat()), deps());
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("upstream_rejected");
      const text = JSON.stringify(json);
      for (const leak of [
        "litellm",
        "Openrouter",
        "Wafer",
        "qwen",
        "interne.example",
        "sk-or",
      ])
        expect(text.toLowerCase()).not.toContain(leak.toLowerCase());
      expect(json.error.message.length).toBeGreaterThan(10);
      // Pas non plus dans les journaux.
      expect(lines.join("\n").toLowerCase()).not.toContain("wafer");
    },
  );
});

describe("confidentialité", () => {
  it("ne laisse aucune trace du contenu, de la clé client, de la clé maîtresse ni de la clé du fournisseur", async () => {
    const c = await client();
    upstream = () =>
      sse([chunk("Réponse confidentielle"), usageChunk(), "data: [DONE]\n\n"]);
    await (
      await handleChatCompletions(post(c.key, chat({ stream: true })), deps())
    ).text();
    upstream = () => upstreamOk();
    await handleChatCompletions(post(c.key, chat()), deps());
    upstream = () =>
      Response.json(
        { error: { message: `échec avec ${PROMPT_MARKER}` } },
        { status: 500 },
      );
    await handleChatCompletions(post(c.key, chat()), deps());
    await handleChatCompletions(post(`nxk_${"q".repeat(43)}`, chat()), deps());

    const logs = lines.join("\n");
    expect(logs.length).toBeGreaterThan(0);
    for (const secret of [
      PROMPT_MARKER,
      "Réponse confidentielle",
      c.key,
      c.key.slice(4),
      MASTER,
      "sk-upstream-secret",
    ])
      expect(logs).not.toContain(secret);

    // aucune colonne des événements d'usage ne contient le contenu
    const events = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, c.org));
    expect(events.length).toBe(3);
    const dump = JSON.stringify(events, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    expect(dump).not.toContain(PROMPT_MARKER);
    expect(dump).not.toContain("Réponse confidentielle");
    expect(dump).not.toContain(c.key.slice(4));
  });
});

describe("passerelle non configurée", () => {
  it("répond 503 sans toucher à la base", async () => {
    const d = { ...deps(), litellm: () => null };
    const res = await handleChatCompletions(
      post(`nxk_${"a".repeat(43)}`, chat()),
      d,
    );
    expect(res.status).toBe(503);
  });
});

describe("plages horaires et écriture du cache", () => {
  const saturday = () => new Date("2026-10-31T10:00:00Z");
  const wednesday = () => new Date("2026-10-28T09:00:00Z");
  const run = async (
    model: string,
    usage: Record<string, unknown>,
    now: () => Date,
  ) => {
    const c = await client();
    upstream = () => upstreamOk(usage);
    const res = await handleChatCompletions(
      post(c.key, chat({ model })),
      deps({}, now),
    );
    expect(res.status).toBe(200);
    const [ev] = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, c.org));
    return { res, ev };
  };
  const usage = {
    prompt_tokens: 100,
    completion_tokens: 100,
    total_tokens: 200,
  };

  it("applique le prix de la plage en vigueur au moment de la requête et note laquelle", async () => {
    // 100 jetons à 1 CAD/M en entrée + 100 à 3 CAD/M en sortie = 400 micro ; en plage « creux » : 40 + 120 = 160
    const base = await run("nexora/test-windows", usage, wednesday);
    expect(base.res.headers.get("x-nexora-cost-micro")).toBe("400");
    expect(base.ev?.priceWindow).toBeNull();
    const creux = await run("nexora/test-windows", usage, saturday);
    expect(creux.res.headers.get("x-nexora-cost-micro")).toBe("160");
    expect(creux.ev?.priceWindow).toBe("creux");
    expect(creux.ev?.priceInputMicro).toBe(400_000n);
    // le coût amont suit la même plage : 100 × 0,05 + 100 × 0,10 USD par million
    expect(creux.ev?.upstreamCostUsdMicro).toBe(15n);
  });

  it("facture l'écriture du cache à son tarif et enregistre les jetons de raisonnement", async () => {
    // 1 000 d'invite dont 200 lus et 300 écrits en cache ; 500 de sortie dont 120 de raisonnement
    const { res, ev } = await run(
      "nexora/test-write",
      {
        prompt_tokens: 1000,
        completion_tokens: 500,
        total_tokens: 1500,
        prompt_tokens_details: { cached_tokens: 200, cache_write_tokens: 300 },
        completion_tokens_details: { reasoning_tokens: 120 },
      },
      wednesday,
    );
    // 500 × 1 + 200 × 0,2 + 300 × 2 + 500 × 3 = 500 + 40 + 600 + 1500 = 2 640 micro
    expect(res.headers.get("x-nexora-cost-micro")).toBe("2640");
    expect(ev?.cachedTokens).toBe(200);
    expect(ev?.cacheWriteTokens).toBe(300);
    expect(ev?.reasoningTokens).toBe(120);
    expect(ev?.priceCacheWriteMicro).toBe(2_000_000n);
  });

  it("reconnaît le champ d'écriture du cache d'autres fournisseurs (cache_creation_input_tokens)", async () => {
    const { ev } = await run(
      "nexora/test-write",
      {
        prompt_tokens: 1000,
        completion_tokens: 0,
        total_tokens: 1000,
        cache_creation_input_tokens: 250,
      },
      wednesday,
    );
    expect(ev?.cacheWriteTokens).toBe(250);
  });
});

describe("organisation maison (accès gratuit du fondateur)", () => {
  async function houseClient() {
    const org = await newOrganization(t.db);
    await setBillingMode(t.db, org, "house");
    const { key } = await createApiKey(t.db, {
      organizationId: org,
      name: "maison",
    });
    return { org, key };
  }
  const usage = {
    prompt_tokens: 100,
    completion_tokens: 100,
    total_tokens: 200,
  };

  it("sert la requête sans solde, ne débite rien et note la valeur offerte et le coût amont", async () => {
    const { org, key } = await houseClient();
    upstream = () => upstreamOk(usage);
    const res = await handleChatCompletions(post(key, chat()), deps());
    expect(res.status).toBe(200);
    expect(res.headers.get("x-nexora-cost-micro")).toBe("0");
    const [ev] = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, org));
    expect(ev?.costMicro).toBe(0n);
    expect(ev?.billed).toBe(false);
    // 100 × 1 CAD/M + 100 × 3 CAD/M = 400 micro-CAD offerts ; coût amont réel : 100 × 0,10 + 100 × 0,20 USD/M = 30
    expect(ev?.valueMicro).toBe(400n);
    expect(ev?.upstreamCostUsdMicro).toBe(30n);
    expect(ev?.promptTokens).toBe(100);
    // aucune réservation ni écriture au grand livre
    expect(
      await t.db
        .select()
        .from(creditReservations)
        .where(eq(creditReservations.organizationId, org)),
    ).toHaveLength(0);
    expect(await getAccount(t.db, org)).toMatchObject({
      balanceMicro: 0n,
      heldMicro: 0n,
    });
  });

  it("sert aussi une réponse en flux, sans débit", async () => {
    const { org, key } = await houseClient();
    upstream = () => sse([chunk("Bon"), usageChunk(usage), "data: [DONE]\n\n"]);
    const res = await handleChatCompletions(
      post(key, chat({ stream: true })),
      deps(),
    );
    expect(res.status).toBe(200);
    await res.text();
    const [ev] = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, org));
    expect(ev?.billed).toBe(false);
    expect(ev?.costMicro).toBe(0n);
    expect(ev?.valueMicro).toBe(400n);
  });

  it("une organisation ordinaire sans solde reste refusée (402), et le mode se remet à ordinaire", async () => {
    const poor = await client(0n);
    const refused = await handleChatCompletions(post(poor.key, chat()), deps());
    expect(refused.status).toBe(402);
    const { org, key } = await houseClient();
    await setBillingMode(t.db, org, "standard");
    const again = await handleChatCompletions(post(key, chat()), deps());
    expect(again.status).toBe(402);
  });

  it("refuse un mode inconnu", async () => {
    const org = await newOrganization(t.db);
    // biome-ignore lint/suspicious/noExplicitAny: mode volontairement invalide
    await expect(setBillingMode(t.db, org, "gratuit" as any)).rejects.toThrow();
  });
});

describe("route qui a servi et coût rapporté par l'amont (G7)", () => {
  const usage = {
    prompt_tokens: 1000,
    completion_tokens: 1000,
    total_tokens: 2000,
  };
  const run = async (headers: Record<string, string>) => {
    const c = await client();
    upstream = () => {
      const r = upstreamOk(usage);
      for (const [k, v] of Object.entries(headers)) r.headers.set(k, v);
      return r;
    };
    const res = await handleChatCompletions(
      post(c.key, chat({ model: "nexora/test-route" })),
      deps(),
    );
    expect(res.status).toBe(200);
    const [ev] = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, c.org));
    return { res, ev };
  };

  it("route principale : coût amont au prix du modèle, position 0, coût rapporté enregistré", async () => {
    const { ev, res } = await run({
      "x-litellm-model-id": "nxm-nexora-test-route",
    });
    expect(ev?.routePosition).toBe(0);
    // 1 000 × 0,10 + 1 000 × 0,20 USD par million = 300 micro-USD
    expect(ev?.upstreamCostUsdMicro).toBe(300n);
    // le coût rapporté (0,123 USD) est gardé à part, jamais montré au client
    expect(ev?.reportedCostUsdMicro).toBe(123_000n);
    expect(await res.text()).not.toContain("0.123");
  });

  it("route de secours : coût amont au prix de la route et position enregistrée", async () => {
    const { ev } = await run({
      "x-litellm-model-id": "nxm-nexora-test-route~r1",
    });
    expect(ev?.routePosition).toBe(1);
    // 1 000 × 0,04 + 1 000 × 0,08 USD par million = 120 micro-USD
    expect(ev?.upstreamCostUsdMicro).toBe(120n);
  });

  it("sans en-tête d'identifiant : route principale", async () => {
    const { ev } = await run({});
    expect(ev?.routePosition).toBe(0);
    expect(ev?.upstreamCostUsdMicro).toBe(300n);
  });
});

describe("modèle en aperçu : visible au catalogue, jamais appelable", () => {
  const MESSAGE =
    "Ce modèle est en aperçu : il n'est pas encore disponible à l'appel.";

  async function expectRefused(res: Response) {
    expect(res.status).toBe(404);
    expect((await res.json()).error).toEqual({
      message: MESSAGE,
      type: "invalid_request_error",
      param: "model",
      code: "model_not_available",
    });
  }

  it("un appel de conversation répond 404 model_not_available, sans réservation, sans appel amont, sans débit", async () => {
    const c = await client(10n);
    const res = await handleChatCompletions(
      post(c.key, chat({ model: "nexora/test-apercu" })),
      deps(),
    );
    await expectRefused(res);
    expect(res.headers.get("x-request-id")).toMatch(/^req_test_/);
    expect(calls).toHaveLength(0);
    const held = await t.db
      .select()
      .from(creditReservations)
      .where(eq(creditReservations.organizationId, c.org));
    expect(held).toHaveLength(0);
    const acct = await getAccount(t.db, c.org);
    expect(acct.balanceMicro).toBe(10n * M);
    expect(acct.heldMicro).toBe(0n);
    const events = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, c.org));
    expect(events).toHaveLength(0);
  });

  it("un appel d'embeddings répond de même", async () => {
    const c = await client(10n);
    await expectRefused(
      await handleEmbeddings(
        post(
          c.key,
          { model: "nexora/test-apercu-embed", input: "x" },
          "embeddings",
        ),
        deps(),
      ),
    );
    expect(calls).toHaveLength(0);
  });

  it("même une clé qui nomme le modèle dans ses modèles autorisés reçoit le refus", async () => {
    const c = await client(10n, { allowedModels: ["nexora/test-apercu"] });
    await expectRefused(
      await handleChatCompletions(
        post(c.key, chat({ model: "nexora/test-apercu" })),
        deps(),
      ),
    );
    expect(calls).toHaveLength(0);
  });

  it("un modèle inconnu reste « model_not_found » (l'aperçu n'est annoncé que pour un modèle publié)", async () => {
    const c = await client(10n);
    const res = await handleChatCompletions(
      post(c.key, chat({ model: "nexora/n-existe-pas" })),
      deps(),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("model_not_found");
  });

  it("GET /v1/models ne le liste pas, avec ou sans clé", async () => {
    resetModelsCache();
    const anon = await (
      await handleModels(new Request("http://x/v1/models"), deps())
    ).json();
    const ids = anon.data.map((m: { id: string }) => m.id);
    expect(ids).not.toContain("nexora/test-apercu");
    expect(ids).not.toContain("nexora/test-apercu-embed");
    const c = await client(10n, { allowedModels: ["nexora/test-apercu"] });
    const withKey = await (
      await handleModels(
        new Request("http://x/v1/models", {
          headers: { authorization: `Bearer ${c.key}` },
        }),
        deps(),
      )
    ).json();
    expect(withKey.data.map((m: { id: string }) => m.id)).not.toContain(
      "nexora/test-apercu",
    );
  });
});
