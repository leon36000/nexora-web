/**
 * Facturation exacte, chantier 3 (audit F-06, F-07) : à chaque réponse, la passerelle capture de quoi RAPPROCHER
 * l'événement d'usage de l'amont : identifiant d'appel LiteLLM (`x-litellm-call-id`), coût rapporté par LiteLLM
 * (`x-litellm-response-cost`), identifiant de génération (`id` du corps ou du premier fragment, OpenRouter « gen-… »),
 * coût rapporté par l'amont en NANO-USD (`usage.cost` ou, pour DeepInfra, `usage.estimated_cost`), fournisseur servi et
 * taux de change du catalogue en vigueur, figé PAR ÉVÉNEMENT. Aucune de ces valeurs n'est jamais montrée au client.
 * Reprend S12 (et le contrôle du change de S14) de l'audit.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  chat,
  chunk,
  client,
  completion,
  createKit,
  eventsOf,
  type Kit,
  M,
  post,
  stream,
  usageChunk,
} from "./billing-kit";
import { handleChatCompletions } from "./proxy";

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

const USAGE = { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 };

describe("capture des identifiants et du coût amont", () => {
  it("non diffusé : appel LiteLLM, coût LiteLLM, génération, fournisseur, coût rapporté en nano-USD, change figé", async () => {
    const c = await client(kit.t, 5n * M);
    kit.upstream = () =>
      Response.json(
        {
          id: "gen-abc123",
          object: "chat.completion",
          model: "nexora/audit-chat",
          provider: "Wafer",
          choices: [
            { index: 0, message: { role: "assistant", content: "Bonjour" } },
          ],
          usage: { ...USAGE, cost: 0.0000575 },
        },
        {
          headers: {
            "x-litellm-call-id": "11111111-2222-3333-4444-555555555555",
            "x-litellm-response-cost": "5.75e-05",
          },
        },
      );
    const res = await handleChatCompletions(
      post(c.key, chat("x", { max_tokens: 100 })),
      kit.deps(),
    );
    const body = await res.text();
    // Rien de l'amont n'est montré au client.
    expect(body).not.toContain("Wafer");
    expect(body).not.toContain("5.75e-05");
    expect(body).not.toContain("0.0000575");
    for (const [name] of res.headers)
      expect(name).not.toMatch(/litellm|generation/i);
    const [e] = await eventsOf(kit.t, c.org);
    expect(e?.litellmCallId).toBe("11111111-2222-3333-4444-555555555555");
    expect(e?.litellmResponseCostNano).toBe(57_500n);
    expect(e?.upstreamGenerationId).toBe("gen-abc123");
    expect(e?.upstreamProvider).toBe("Wafer");
    expect(e?.reportedCostUsdNano).toBe(57_500n);
    expect(e?.fxUsdToCadMicro).toBe(1_400_000n); // taux du catalogue publié (test-support : 1,40)
    expect(e?.usageSource).toBe("provider");
    expect(e?.upstreamCostUsdNano).toBeGreaterThan(0n);
  });

  it("diffusé : l'identifiant de génération vient du premier fragment, les en-têtes sont lus avant le flux", async () => {
    const c = await client(kit.t, 5n * M);
    kit.upstream = () =>
      stream(
        [
          chunk("Bon", "gen-stream-9"),
          chunk("jour", "gen-stream-9"),
          usageChunk({ ...USAGE, cost: "0.0000575" }, "gen-stream-9"),
          "data: [DONE]\n\n",
        ],
        "close",
        {
          "x-litellm-call-id": "call-stream-1",
          "x-litellm-response-cost": "0.0000575",
        },
      );
    await (
      await handleChatCompletions(
        post(c.key, chat("x", { stream: true, max_tokens: 100 })),
        kit.deps(),
      )
    ).text();
    const [e] = await eventsOf(kit.t, c.org);
    expect(e?.litellmCallId).toBe("call-stream-1");
    expect(e?.upstreamGenerationId).toBe("gen-stream-9");
    expect(e?.litellmResponseCostNano).toBe(57_500n);
    expect(e?.reportedCostUsdNano).toBe(57_500n); // une chaîne décimale est acceptée (S12 : elle était ignorée)
  });

  it("flux coupé par le client : les identifiants déjà connus sont conservés pour la réconciliation", async () => {
    const c = await client(kit.t, 5n * M);
    kit.upstream = () =>
      stream([chunk("Bon", "gen-cut-1")], "hang", {
        "x-litellm-call-id": "call-cut-1",
      });
    const res = await handleChatCompletions(
      post(c.key, chat("x", { stream: true, max_tokens: 100 })),
      kit.deps(),
    );
    const reader = res.body?.getReader();
    await reader?.read();
    await reader?.cancel();
    await new Promise((r) => setTimeout(r, 150));
    const [e] = await eventsOf(kit.t, c.org);
    expect(e?.status).toBe("aborted");
    expect(e?.litellmCallId).toBe("call-cut-1");
    expect(e?.upstreamGenerationId).toBe("gen-cut-1");
  });

  it("S12 : DeepInfra « estimated_cost », coût inférieur au micro-USD et coût en chaîne sont tous conservés (nano-USD)", async () => {
    const out: Record<string, bigint | null | undefined> = {};
    for (const [name, extra] of Object.entries({
      openrouter_cost: { cost: 0.0000575 },
      deepinfra_estimated_cost: { estimated_cost: 0.0000575 },
      cout_tres_petit: { cost: 0.0000004 },
      cout_en_chaine: { cost: "0.0000575" },
      aucun_cout: {},
    })) {
      const c = await client(kit.t, 5n * M);
      kit.upstream = () => completion({ ...USAGE, ...extra });
      await (
        await handleChatCompletions(
          post(c.key, chat("x", { max_tokens: 100 })),
          kit.deps(),
        )
      ).text();
      const [e] = await eventsOf(kit.t, c.org);
      out[name] = e?.reportedCostUsdNano;
    }
    expect(out.openrouter_cost).toBe(57_500n);
    expect(out.deepinfra_estimated_cost).toBe(57_500n);
    expect(out.cout_tres_petit).toBe(400n); // l'ancienne colonne en micro-USD enregistrait 0 (« appel gratuit »)
    expect(out.cout_en_chaine).toBe(57_500n);
    expect(out.aucun_cout).toBeNull(); // absent ≠ gratuit
  });

  it("la colonne historique en micro-USD reste renseignée (retour arrière sans perte pour les lecteurs existants)", async () => {
    const c = await client(kit.t, 5n * M);
    kit.upstream = () => completion({ ...USAGE, cost: 0.0000575 });
    await (
      await handleChatCompletions(
        post(c.key, chat("x", { max_tokens: 100 })),
        kit.deps(),
      )
    ).text();
    const [e] = await eventsOf(kit.t, c.org);
    expect(e?.reportedCostUsdMicro).toBe(58n);
  });

  it("une requête en erreur n'enregistre aucun coût rapporté, mais garde l'appel LiteLLM s'il est connu", async () => {
    const c = await client(kit.t, 5n * M);
    kit.upstream = () =>
      new Response("boom", {
        status: 500,
        headers: { "x-litellm-call-id": "call-err-1" },
      });
    await handleChatCompletions(post(c.key, chat("x")), kit.deps());
    const [e] = await eventsOf(kit.t, c.org);
    expect(e?.status).toBe("error");
    expect(e?.reportedCostUsdNano).toBeNull();
    expect(e?.litellmCallId).toBe("call-err-1");
  });
});
