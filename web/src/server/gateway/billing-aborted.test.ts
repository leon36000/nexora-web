/**
 * Facturation exacte, chantier 2 (audit F-02) : une requête NON diffusée annulée par le client ne facture que l'invite
 * estimée (provenance « estimated_aborted »), plus `max_tokens` en entier. L'audit mesurait 480 081 µCAD pour un
 * abandon alors que la même requête menée à terme (300 jetons de sortie) coûte 4 581 µCAD (×105). Le complément éventuel
 * est apporté par la réconciliation (chantier 5), jamais par une supposition de ce que l'amont « a pu » produire.
 * Reprend le scénario S1 de l'audit (DOC-FACT/RAPPORT-FACTURATION.md).
 */
import { getAccount } from "@nexora/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  chat,
  client,
  completion,
  createKit,
  eventsOf,
  hangingUpstream,
  type Kit,
  M,
  PRICE,
  post,
  sleep,
} from "./billing-kit";
import { requestCost } from "./pricing";
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

describe("S1 : abandon d'une requête non diffusée", () => {
  it("annulée pendant l'appel amont : invite estimée seulement, 0 jeton de sortie, plus aucun max_tokens", async () => {
    const c = await client(kit.t, 5n * M);
    kit.upstream = hangingUpstream;
    const ac = new AbortController();
    // Sans max_tokens : le plafond du modèle (32 000) était facturé en entier avant le correctif.
    const pending = handleChatCompletions(
      post(c.key, chat("Bonjour, peux-tu résumer ce texte ?"), ac.signal),
      kit.deps(),
    );
    await sleep(100);
    ac.abort();
    expect((await pending).status).toBe(499);
    const [e] = await eventsOf(kit.t, c.org);
    expect(e?.status).toBe("aborted");
    expect(e?.errorCode).toBe("client_closed");
    expect(e?.completionTokens).toBe(0);
    expect(e?.promptTokens).toBeGreaterThan(0);
    const prompt = e?.promptTokens ?? 0;
    expect(e?.costMicro).toBe(
      requestCost({ prompt, completion: 0, cached: 0 }, PRICE),
    );
    expect(e?.usageSource).toBe("estimated_aborted");
    // Le client abandonné ne paie plus 100 fois ce que coûte la même requête menée à terme (300 jetons).
    const done = requestCost({ prompt, completion: 300, cached: 0 }, PRICE);
    expect(e?.costMicro ?? 0n).toBeLessThan(done);
    expect(await getAccount(kit.t.db, c.org)).toMatchObject({
      balanceMicro: 5n * M - (e?.costMicro ?? 0n),
      heldMicro: 0n,
    });
  });

  it("annulée pendant la lecture du corps de la réponse : même règle (l'amont a répondu, mais la sortie n'a jamais été reçue)", async () => {
    const c = await client(kit.t, 5n * M);
    kit.upstream = (_call, signal) =>
      new Response(
        new ReadableStream({
          start(ctrl) {
            signal?.addEventListener("abort", () =>
              ctrl.error(new DOMException("annulé", "AbortError")),
            );
          },
        }),
        { headers: { "content-type": "application/json" } },
      );
    const ac = new AbortController();
    const pending = handleChatCompletions(
      post(c.key, chat("Bonjour", { max_tokens: 20_000 }), ac.signal),
      kit.deps(),
    );
    await sleep(100);
    ac.abort();
    expect((await pending).status).toBe(499);
    const [e] = await eventsOf(kit.t, c.org);
    expect(e?.status).toBe("aborted");
    expect(e?.completionTokens).toBe(0);
    expect(e?.usageSource).toBe("estimated_aborted");
  });

  it("la même requête menée à terme reste facturée à son usage réel (aucune régression du chemin nominal)", async () => {
    const c = await client(kit.t, 5n * M);
    kit.upstream = () =>
      completion({
        prompt_tokens: 27,
        completion_tokens: 300,
        total_tokens: 327,
      });
    await (
      await handleChatCompletions(post(c.key, chat("Bonjour")), kit.deps())
    ).text();
    const [e] = await eventsOf(kit.t, c.org);
    expect(e?.costMicro).toBe(
      requestCost({ prompt: 27, completion: 300, cached: 0 }, PRICE),
    );
    expect(e?.usageSource).toBe("provider");
  });
});
