/**
 * Facturation exacte, chantier 4 (audit F-01), arrêt propre : au signal d'arrêt, la passerelle attend la fin des
 * requêtes en vol (période de grâce) puis RÈGLE de force celles qui restent (appel amont coupé, invite estimée
 * plus ce qui a déjà été livré), au lieu de laisser Docker tuer le processus au milieu d'un flux.
 */
import { eq, getAccount, usageIntents } from "@nexora/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  chat,
  chunk,
  client,
  completion,
  createKit,
  eventsOf,
  hangingUpstream,
  type Kit,
  M,
  post,
  sleep,
  stream,
  usageChunk,
} from "./billing-kit";
import { drainGateway, inflightCount } from "./inflight";
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

describe("drain à l'arrêt du serveur", () => {
  it("sans requête en vol : rend la main tout de suite", async () => {
    expect(inflightCount()).toBe(0);
    const started = Date.now();
    const out = await drainGateway({ graceMs: 5_000 });
    expect(out).toMatchObject({ forced: 0, remaining: 0 });
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("attend la fin naturelle d'une requête en vol pendant la période de grâce, sans rien forcer", async () => {
    const c = await client(kit.t, 5n * M);
    kit.upstream = async () => {
      await sleep(300);
      return completion({ prompt_tokens: 10, completion_tokens: 5 });
    };
    const pending = handleChatCompletions(
      post(c.key, chat("Bonjour")),
      kit.deps(),
    );
    await sleep(100);
    expect(inflightCount()).toBe(1);
    const out = await drainGateway({ graceMs: 5_000 });
    expect(out).toMatchObject({ forced: 0, remaining: 0 });
    expect((await pending).status).toBe(200);
    const [e] = await eventsOf(kit.t, c.org);
    expect(e).toMatchObject({ status: "ok", usageSource: "provider" });
  });

  it("flux encore ouvert à la fin de la grâce : réglé de force (aborted / server_shutdown), invite + livré estimés, rien ne reste réservé", async () => {
    const c = await client(kit.t, 5n * M);
    kit.upstream = () => stream([chunk("Bonjour à tous, ".repeat(50))], "hang");
    const res = await handleChatCompletions(
      post(
        c.key,
        chat("Écris un long texte", { stream: true, max_tokens: 5_000 }),
      ),
      kit.deps(),
    );
    const reader = res.body?.getReader();
    await reader?.read();
    expect(inflightCount()).toBe(1);
    const out = await drainGateway({ graceMs: 100 });
    expect(out).toMatchObject({ forced: 1, remaining: 0 });
    const [e] = await eventsOf(kit.t, c.org);
    expect(e).toMatchObject({
      status: "aborted",
      errorCode: "server_shutdown",
      usageSource: "estimated_aborted",
    });
    expect(e?.completionTokens).toBeGreaterThan(0); // ce qui avait été livré est facturé
    expect(e?.costMicro).toBeGreaterThan(0n);
    const acct = await getAccount(kit.t.db, c.org);
    expect(acct.heldMicro).toBe(0n);
    expect(acct.balanceMicro).toBe(5n * M - (e?.costMicro ?? 0n));
    const [intent] = await kit.t.db
      .select()
      .from(usageIntents)
      .where(eq(usageIntents.requestId, e?.requestId ?? ""));
    expect(intent?.status).toBe("settled");
    // Le client reçoit une fin de flux explicite, pas une coupure muette.
    let tail = "";
    const dec = new TextDecoder();
    for (let i = 0; i < 5; i++) {
      const r = await reader?.read();
      if (!r || r.done) break;
      tail += dec.decode(r.value);
    }
    expect(tail).toContain("server_shutdown");
    expect(inflightCount()).toBe(0);
  });

  it("requête non diffusée encore en attente de l'amont : appel coupé, invite estimée facturée, 503 pour le client", async () => {
    const c = await client(kit.t, 5n * M);
    kit.upstream = hangingUpstream;
    const pending = handleChatCompletions(
      post(c.key, chat("Bonjour", { max_tokens: 20_000 })),
      kit.deps(),
    );
    await sleep(100);
    const out = await drainGateway({ graceMs: 50 });
    expect(out).toMatchObject({ forced: 1, remaining: 0 });
    const res = await pending;
    expect(res.status).toBe(503);
    const [e] = await eventsOf(kit.t, c.org);
    expect(e).toMatchObject({
      status: "aborted",
      errorCode: "server_shutdown",
      completionTokens: 0,
      usageSource: "estimated_aborted",
    });
    expect((await getAccount(kit.t.db, c.org)).heldMicro).toBe(0n);
  });

  it("un flux qui se termine pendant la grâce est réglé normalement (usage de l'amont)", async () => {
    const c = await client(kit.t, 5n * M);
    kit.upstream = () =>
      stream(
        [
          chunk("Bonjour"),
          usageChunk({
            prompt_tokens: 20,
            completion_tokens: 8,
            total_tokens: 28,
          }),
          "data: [DONE]\n\n",
        ],
        "close",
      );
    const res = await handleChatCompletions(
      post(c.key, chat("Salut", { stream: true, max_tokens: 100 })),
      kit.deps(),
    );
    const [out] = await Promise.all([
      drainGateway({ graceMs: 5_000 }),
      res.text(),
    ]);
    expect(out.forced).toBe(0);
    const [e] = await eventsOf(kit.t, c.org);
    expect(e).toMatchObject({ status: "ok", usageSource: "provider" });
  });
});
