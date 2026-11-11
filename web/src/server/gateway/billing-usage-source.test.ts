/**
 * Facturation exacte, chantier 1 (audit F-03 et F-13) : un `usage` à zéro ou incomplet avec une réponse livrée n'est
 * JAMAIS accepté comme exact ; il est traité comme absent (estimation de repli) et la provenance des jetons est
 * enregistrée (`usage_events.usage_source`). Un flux complet terminé par `[DONE]` sans bloc `usage` est « ok ».
 * Reprend les scénarios S4 et S5 de l'audit (DOC-FACT/RAPPORT-FACTURATION.md).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  chat,
  chunk,
  client,
  completion,
  createKit,
  EMBED_MODEL,
  eventsOf,
  hangingUpstream,
  type Kit,
  M,
  post,
  sleep,
  stream,
  usageChunk,
} from "./billing-kit";
import { estimateOutputTokens } from "./estimate";
import { handleChatCompletions, handleEmbeddings } from "./proxy";

let kit: Kit;
beforeAll(async () => {
  kit = await createKit();
});
afterAll(async () => {
  await kit.t.drop();
});
beforeEach(() => {
  kit.calls = [];
  kit.lines = [];
});

const text = "mot ".repeat(2000); // 8 000 caractères livrés

describe("S5 : usage nul ou incomplet avec une réponse livrée = usage absent", () => {
  it("non diffusé, usage 0/0 : estimation de repli, jamais 0 µCAD", async () => {
    const c = await client(kit.t, 5n * M);
    kit.upstream = () =>
      completion(
        { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        text,
      );
    await (
      await handleChatCompletions(
        post(c.key, chat("Résume ce texte.", { max_tokens: 4000 })),
        kit.deps(),
      )
    ).text();
    const [e] = await eventsOf(kit.t, c.org);
    expect(e?.status).toBe("ok");
    expect(e?.costMicro).toBeGreaterThan(0n);
    expect(e?.promptTokens).toBeGreaterThan(0);
    expect(e?.completionTokens).toBe(estimateOutputTokens(text.length));
    expect(e?.usageSource).toBe("estimated_missing");
  });

  it("diffusé, bloc usage 0/0 : même règle", async () => {
    const c = await client(kit.t, 5n * M);
    kit.upstream = () =>
      stream(
        [
          chunk(text.slice(0, 4000)),
          chunk(text.slice(4000)),
          usageChunk({
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
          }),
          "data: [DONE]\n\n",
        ],
        "close",
      );
    await (
      await handleChatCompletions(
        post(
          c.key,
          chat("Résume ce texte.", { stream: true, max_tokens: 4000 }),
        ),
        kit.deps(),
      )
    ).text();
    const [e] = await eventsOf(kit.t, c.org);
    expect(e?.status).toBe("ok");
    expect(e?.costMicro).toBeGreaterThan(0n);
    expect(e?.completionTokens).toBe(estimateOutputTokens(text.length));
    expect(e?.usageSource).toBe("estimated_missing");
  });

  it("« prompt_tokens » seul (sortie indéterminée) : l'entrée rapportée est gardée, la sortie est estimée", async () => {
    const c = await client(kit.t, 5n * M);
    kit.upstream = () => completion({ prompt_tokens: 1000 }, text);
    await (
      await handleChatCompletions(
        post(c.key, chat("x", { max_tokens: 4000 })),
        kit.deps(),
      )
    ).text();
    const [e] = await eventsOf(kit.t, c.org);
    expect(e?.promptTokens).toBe(1000);
    expect(e?.completionTokens).toBe(estimateOutputTokens(text.length));
    expect(e?.costMicro).toBeGreaterThan(3_000n); // plus que l'entrée seule (S5 : 3 000 µCAD)
    expect(e?.usageSource).toBe("estimated_missing");
  });

  it("sortie à zéro alors que du contenu est livré : la sortie est estimée, l'entrée rapportée est gardée", async () => {
    const c = await client(kit.t, 5n * M);
    kit.upstream = () =>
      completion(
        { prompt_tokens: 500, completion_tokens: 0, total_tokens: 500 },
        text,
      );
    await (
      await handleChatCompletions(
        post(c.key, chat("x", { max_tokens: 4000 })),
        kit.deps(),
      )
    ).text();
    const [e] = await eventsOf(kit.t, c.org);
    expect(e?.promptTokens).toBe(500);
    expect(e?.completionTokens).toBe(estimateOutputTokens(text.length));
    expect(e?.usageSource).toBe("estimated_missing");
  });

  it("un usage complet et cohérent reste accepté tel quel : source « provider »", async () => {
    const c = await client(kit.t, 5n * M);
    kit.upstream = () =>
      completion({
        prompt_tokens: 120,
        completion_tokens: 40,
        total_tokens: 160,
      });
    await (
      await handleChatCompletions(post(c.key, chat("x")), kit.deps())
    ).text();
    const [e] = await eventsOf(kit.t, c.org);
    expect([e?.promptTokens, e?.completionTokens]).toEqual([120, 40]);
    expect(e?.usageSource).toBe("provider");
  });

  it("un usage à zéro SANS contenu livré (réponse vide) reste zéro : rien n'est inventé", async () => {
    const c = await client(kit.t, 5n * M);
    kit.upstream = () =>
      completion(
        { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        "",
      );
    await (
      await handleChatCompletions(post(c.key, chat("x")), kit.deps())
    ).text();
    const [e] = await eventsOf(kit.t, c.org);
    expect(e?.status).toBe("ok");
    expect(e?.usageSource).toBe("provider");
  });

  it("embeddings : un usage à zéro avec des vecteurs livrés est estimé", async () => {
    const c = await client(kit.t, 5n * M);
    kit.upstream = () =>
      Response.json({
        object: "list",
        data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2] }],
        usage: { prompt_tokens: 0, total_tokens: 0 },
      });
    const res = await handleEmbeddings(
      new Request("http://localhost/v1/embeddings", {
        method: "POST",
        headers: {
          authorization: `Bearer ${c.key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: EMBED_MODEL,
          input: "Bonjour le monde, comment ça va ?",
        }),
      }),
      kit.deps(),
    );
    expect(res.status).toBe(200);
    const [e] = await eventsOf(kit.t, c.org);
    expect(e?.promptTokens).toBeGreaterThan(0);
    expect(e?.costMicro).toBeGreaterThan(0n);
    expect(e?.usageSource).toBe("estimated_missing");
  });

  it("une requête en erreur ne facture rien et n'invente aucune provenance (source « none »)", async () => {
    const c = await client(kit.t, 5n * M);
    kit.upstream = () => new Response("boom", { status: 500 });
    const res = await handleChatCompletions(post(c.key, chat("x")), kit.deps());
    expect(res.status).toBe(502);
    const [e] = await eventsOf(kit.t, c.org);
    expect(e?.status).toBe("error");
    expect(e?.costMicro).toBe(0n);
    expect(e?.usageSource).toBe("none");
  });
});

describe("S4 / F-13 : flux terminé par [DONE] sans bloc usage", () => {
  it("réponse complète : statut « ok », aucun code d'erreur, jetons estimés et marqués comme tels", async () => {
    const c = await client(kit.t, 5n * M);
    kit.upstream = () =>
      stream(
        [chunk("Bonjour "), chunk("le monde"), "data: [DONE]\n\n"],
        "close",
      );
    const res = await handleChatCompletions(
      post(c.key, chat("Salut", { stream: true, max_tokens: 100 })),
      kit.deps(),
    );
    await res.text();
    const [e] = await eventsOf(kit.t, c.org);
    expect(e?.status).toBe("ok");
    expect(e?.errorCode).toBeNull();
    expect(e?.httpStatus).toBe(200);
    expect(e?.completionTokens).toBe(
      estimateOutputTokens("Bonjour le monde".length),
    );
    expect(e?.costMicro).toBeGreaterThan(0n);
    expect(e?.usageSource).toBe("estimated_missing");
  });

  it("flux coupé sans [DONE] ni usage : « aborted / upstream_interrupted », source « estimated_interrupted »", async () => {
    const c = await client(kit.t, 5n * M);
    kit.upstream = () =>
      stream([chunk("Bonjour "), chunk("le monde")], "close");
    await (
      await handleChatCompletions(
        post(c.key, chat("Salut", { stream: true, max_tokens: 100 })),
        kit.deps(),
      )
    ).text();
    const [e] = await eventsOf(kit.t, c.org);
    expect(e?.status).toBe("aborted");
    expect(e?.errorCode).toBe("upstream_interrupted");
    expect(e?.usageSource).toBe("estimated_interrupted");
  });

  it("le client coupe un flux sans usage : source « estimated_aborted »", async () => {
    const c = await client(kit.t, 5n * M);
    kit.upstream = () => stream([chunk("Bonjour ")], "hang");
    const res = await handleChatCompletions(
      post(c.key, chat("Salut", { stream: true, max_tokens: 100 })),
      kit.deps(),
    );
    const reader = res.body?.getReader();
    await reader?.read();
    await reader?.cancel();
    await sleep(150);
    const [e] = await eventsOf(kit.t, c.org);
    expect(e?.status).toBe("aborted");
    expect(e?.errorCode).toBe("client_closed");
    expect(e?.usageSource).toBe("estimated_aborted");
  });

  it("l'annulation avant la réponse de l'amont est étiquetée « estimated_aborted »", async () => {
    const c = await client(kit.t, 5n * M);
    kit.upstream = hangingUpstream;
    const ac = new AbortController();
    const pending = handleChatCompletions(
      post(c.key, chat("Bonjour"), ac.signal),
      kit.deps(),
    );
    await sleep(80);
    ac.abort();
    expect((await pending).status).toBe(499);
    const [e] = await eventsOf(kit.t, c.org);
    expect(e?.usageSource).toBe("estimated_aborted");
  });
});
