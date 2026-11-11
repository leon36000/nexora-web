/**
 * Facturation exacte, chantier 4 (audit F-01) : journal d'intention durable. Une ligne `pending` est écrite AVANT
 * l'appel amont (dans la transaction de la réservation), avec l'identifiant d'appel envoyé à LiteLLM
 * (`x-litellm-call-id`) ; un arrêt du serveur entre la réservation et le règlement laisse donc une trace que la reprise
 * du grand livre règle à l'estimé (invite seule) au lieu de libérer « à zéro » sans rien dire. Reprend le scénario S3.
 */
import {
  creditReservations,
  eq,
  getAccount,
  reconciliationFindings,
  releaseStaleReservationsDetailed,
  usageIntents,
} from "@nexora/db";
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
  PRICE,
  post,
  stream,
} from "./billing-kit";
import { setBillingMode } from "./house";
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

const intentOf = async (requestId: string) =>
  (
    await kit.t.db
      .select()
      .from(usageIntents)
      .where(eq(usageIntents.requestId, requestId))
  )[0];
const future = () => new Date(Date.now() + 3_600_000);

describe("intention écrite avant l'appel amont", () => {
  it("au moment où l'amont est appelé, l'intention « pending » existe déjà, avec l'identifiant d'appel envoyé à LiteLLM", async () => {
    const c = await client(kit.t, 5n * M);
    let seen: Awaited<ReturnType<typeof intentOf>> | undefined;
    let sentCallId: string | null = null;
    kit.upstream = async (call) => {
      sentCallId = call.headers.get("x-litellm-call-id");
      seen = await intentOf(`req_kit_${kit.counter}`);
      return completion({ prompt_tokens: 10, completion_tokens: 5 });
    };
    await (
      await handleChatCompletions(post(c.key, chat("Bonjour")), kit.deps())
    ).text();
    expect(sentCallId).toMatch(/^[0-9a-f-]{36}$/);
    expect(seen?.status).toBe("pending");
    expect(seen?.litellmCallId).toBe(sentCallId);
    expect(seen?.reservationId).not.toBeNull();
    expect(seen?.modelPublicId).toBe("nexora/audit-chat");
    // Coût de reprise = l'invite estimée au prix figé, jamais au-delà de la réservation.
    const expected = requestCost(
      { prompt: seen?.promptEstimate ?? 0, completion: 0, cached: 0 },
      PRICE,
    );
    expect(seen?.recoveryCostMicro).toBe(expected);
    expect(seen?.priceInputMicro).toBe(PRICE.input);
    expect(seen?.fxUsdToCadMicro).toBe(1_400_000n);
  });

  it("le règlement ferme l'intention (« settled ») et l'événement garde l'identifiant d'appel envoyé", async () => {
    const c = await client(kit.t, 5n * M);
    let sentCallId: string | null = null;
    kit.upstream = (call) => {
      sentCallId = call.headers.get("x-litellm-call-id");
      return completion({ prompt_tokens: 10, completion_tokens: 5 }); // l'amont ne renvoie pas d'en-tête
    };
    await (
      await handleChatCompletions(post(c.key, chat("Bonjour")), kit.deps())
    ).text();
    const id = `req_kit_${kit.counter}`;
    expect((await intentOf(id))?.status).toBe("settled");
    expect((await intentOf(id))?.resolvedAt).not.toBeNull();
    const [e] = await eventsOf(kit.t, c.org);
    expect(e?.litellmCallId).toBe(sentCallId);
  });

  it("l'en-tête renvoyé par LiteLLM fait foi sur l'événement", async () => {
    const c = await client(kit.t, 5n * M);
    kit.upstream = () =>
      completion({ prompt_tokens: 10, completion_tokens: 5 }, "ok", {
        "x-litellm-call-id": "renvoye-par-litellm",
      });
    await (
      await handleChatCompletions(post(c.key, chat("Bonjour")), kit.deps())
    ).text();
    const [e] = await eventsOf(kit.t, c.org);
    expect(e?.litellmCallId).toBe("renvoye-par-litellm");
  });

  it("un échec amont libère la réservation ET ferme l'intention", async () => {
    const c = await client(kit.t, 5n * M);
    kit.upstream = () => new Response("boom", { status: 500 });
    await handleChatCompletions(post(c.key, chat("Bonjour")), kit.deps());
    expect((await intentOf(`req_kit_${kit.counter}`))?.status).toBe("settled");
    expect((await getAccount(kit.t.db, c.org)).heldMicro).toBe(0n);
  });

  it("une requête refusée avant la réservation (solde insuffisant) n'écrit aucune intention", async () => {
    const c = await client(kit.t, 0n);
    const res = await handleChatCompletions(
      post(c.key, chat("Bonjour")),
      kit.deps(),
    );
    expect(res.status).toBe(402);
    expect(await intentOf(`req_kit_${kit.counter}`)).toBeUndefined();
  });

  it("organisation « maison » : intention sans réservation, fermée au règlement", async () => {
    const c = await client(kit.t, 0n);
    await setBillingMode(kit.t.db, c.org, "house");
    let during: Awaited<ReturnType<typeof intentOf>> | undefined;
    kit.upstream = async () => {
      during = await intentOf(`req_kit_${kit.counter}`);
      return completion({ prompt_tokens: 10, completion_tokens: 5 });
    };
    await (
      await handleChatCompletions(post(c.key, chat("Bonjour")), kit.deps())
    ).text();
    expect(during?.status).toBe("pending");
    expect(during?.reservationId).toBeNull();
    expect((await intentOf(`req_kit_${kit.counter}`))?.status).toBe("settled");
  });
});

describe("S3 : le serveur s'arrête entre la réservation et le règlement", () => {
  it("la libération du worker règle la requête perdue à l'estimé et laisse une anomalie visible (avant : 0 µCAD, aucune trace)", async () => {
    const c = await client(kit.t, 5n * M);
    // La requête est en vol : réservation et intention faites, l'amont a répondu et produit ; le serveur s'arrête.
    kit.upstream = () => stream([chunk("a".repeat(30_000))], "hang");
    const res = await handleChatCompletions(
      post(
        c.key,
        chat("Génère un long texte", { stream: true, max_tokens: 20_000 }),
      ),
      kit.deps(),
    );
    const reader = res.body?.getReader();
    await reader?.read(); // le client a reçu du contenu : l'amont a bien produit des jetons
    const requestId = `req_kit_${kit.counter}`;
    const before = await getAccount(kit.t.db, c.org);
    expect(before.heldMicro).toBeGreaterThan(0n);

    // 31 minutes plus tard, la libération périodique du worker (ledger.release-stale) passe.
    const out = await releaseStaleReservationsDetailed(kit.t.db, {
      olderThan: future(),
    });
    expect(out.recovered).toBeGreaterThanOrEqual(1);

    const after = await getAccount(kit.t.db, c.org);
    expect(after.heldMicro).toBe(0n);
    expect(after.balanceMicro).toBeLessThan(5n * M); // débité (avant : 5 000 000 avant et après)
    const evs = await eventsOf(kit.t, c.org);
    expect(evs).toHaveLength(1); // avant : aucune ligne d'usage
    expect(evs[0]).toMatchObject({
      requestId,
      status: "aborted",
      errorCode: "lost_in_flight",
      usageSource: "settled_by_recovery",
      costMicro: 5n * M - after.balanceMicro,
    });
    expect(evs[0]?.litellmCallId).toMatch(/^[0-9a-f-]{36}$/);
    const findings = await kit.t.db
      .select()
      .from(reconciliationFindings)
      .where(eq(reconciliationFindings.requestId, requestId));
    expect(findings.map((f) => f.kind)).toEqual(["recovered_in_flight"]);
    expect((await intentOf(requestId))?.status).toBe("recovered");

    // Le processus « revient » : le client coupe enfin ; le règlement tardif ne double jamais la facturation.
    await reader?.cancel().catch(() => undefined);
    await new Promise((r) => setTimeout(r, 200));
    expect((await getAccount(kit.t.db, c.org)).balanceMicro).toBe(
      after.balanceMicro,
    );
    expect(await eventsOf(kit.t, c.org)).toHaveLength(1);
    const [r] = await kit.t.db
      .select()
      .from(creditReservations)
      .where(eq(creditReservations.organizationId, c.org));
    expect(r?.status).toBe("settled");
  });
});
