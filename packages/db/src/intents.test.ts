/**
 * Journal d'intention et reprise des requêtes perdues (audit F-01). Un arrêt du serveur entre la réservation et le
 * règlement ne doit plus laisser une réservation libérée « à zéro » sans trace : la reprise règle la requête à
 * l'estimé (invite seule) quand l'identifiant d'appel LiteLLM est connu, sinon elle laisse une anomalie visible.
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type IntentInput, recordFinding, recordIntent } from "./intents.ts";
import {
  credit,
  deriveBalance,
  getAccount,
  releaseStaleReservations,
  releaseStaleReservationsDetailed,
  reserve,
} from "./ledger.ts";
import {
  apiKeys,
  creditEntries,
  creditReservations,
  organizations,
  reconciliationFindings,
  usageEvents,
  usageIntents,
} from "./schema.ts";
import { createTestDatabase, type TestDatabase } from "./testing.ts";

let t: TestDatabase;
const CFG = "cfg_test";
const M = 1_000_000n;
const future = () => new Date(Date.now() + 3_600_000);

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

async function client(balance = 10n * M, spendCap?: bigint) {
  const org = `org_${randomBytes(6).toString("hex")}`;
  await t.db.insert(organizations).values({ id: org, name: org, slug: org });
  if (balance > 0n)
    await credit(t.db, {
      organizationId: org,
      amountMicro: balance,
      idempotencyKey: `fund:${org}`,
      configVersion: CFG,
      source: "purchase",
    });
  const [key] = await t.db
    .insert(apiKeys)
    .values({
      organizationId: org,
      name: "k",
      prefix: "nxk_test",
      keyHash: randomBytes(16).toString("hex"),
      spendCapMicro: spendCap ?? null,
    })
    .returning();
  if (!key) throw new Error("clé attendue");
  return { org, keyId: key.id };
}

/** Réservation de la passerelle (clé `gw:<requestId>`), avec ou sans intention. */
async function inFlight(
  c: { org: string; keyId: string },
  requestId: string,
  options: {
    amount?: bigint;
    intent?: Partial<IntentInput> | false;
  } = {},
) {
  const amount = options.amount ?? 500_000n;
  const r = await reserve(t.db, {
    organizationId: c.org,
    amountMicro: amount,
    idempotencyKey: `gw:${requestId}`,
    configVersion: CFG,
    apiKeyId: c.keyId,
  });
  if (r.status !== "reserved") throw new Error("réservation attendue");
  if (options.intent !== false)
    await recordIntent(t.db, {
      requestId,
      organizationId: c.org,
      apiKeyId: c.keyId,
      reservationId: r.reservation.id,
      modelPublicId: "nexora/test",
      endpoint: "chat.completions",
      configVersion: "cat_1",
      stream: true,
      litellmCallId: `call-${requestId}`,
      promptEstimate: 1200,
      recoveryCostMicro: 3_600n,
      recoveryUpstreamCostUsdNano: 120_000n,
      priceInputMicro: 3_000_000n,
      priceOutputMicro: 15_000_000n,
      priceCacheMicro: null,
      priceCacheWriteMicro: null,
      priceWindow: null,
      fxUsdToCadMicro: 1_400_000n,
      ...options.intent,
    });
  return r.reservation.id;
}

const intentOf = async (requestId: string) =>
  (
    await t.db
      .select()
      .from(usageIntents)
      .where(eq(usageIntents.requestId, requestId))
  )[0];
const eventsOf = (org: string) =>
  t.db.select().from(usageEvents).where(eq(usageEvents.organizationId, org));
const findingsOf = (org: string) =>
  t.db
    .select()
    .from(reconciliationFindings)
    .where(eq(reconciliationFindings.organizationId, org));

describe("journal d'intention", () => {
  it("recordIntent écrit une ligne « pending » et rejoue sans doublon", async () => {
    const c = await client();
    await inFlight(c, "req_intent_1");
    const again = await intentOf("req_intent_1");
    expect(again).toMatchObject({
      status: "pending",
      litellmCallId: "call-req_intent_1",
      promptEstimate: 1200,
      recoveryCostMicro: 3_600n,
    });
    // Un deuxième enregistrement du même identifiant de requête ne crée pas de seconde ligne.
    await recordIntent(t.db, {
      requestId: "req_intent_1",
      organizationId: c.org,
      apiKeyId: c.keyId,
      reservationId: null,
      modelPublicId: "nexora/test",
      endpoint: "chat.completions",
      configVersion: "cat_1",
      stream: false,
      litellmCallId: null,
      promptEstimate: 1,
      recoveryCostMicro: 0n,
      recoveryUpstreamCostUsdNano: 0n,
      priceInputMicro: 0n,
      priceOutputMicro: 0n,
      priceCacheMicro: null,
      priceCacheWriteMicro: null,
      priceWindow: null,
      fxUsdToCadMicro: null,
    });
    const rows = await t.db
      .select()
      .from(usageIntents)
      .where(eq(usageIntents.requestId, "req_intent_1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.promptEstimate).toBe(1200);
  });

  it("recordFinding est idempotent par clé : rejouer met à jour la ligne et garde sa révision", async () => {
    const c = await client(0n);
    await recordFinding(t.db, {
      dedupeKey: `test:${c.org}`,
      kind: "token_mismatch",
      organizationId: c.org,
      detail: { n: 1 },
    });
    await t.db
      .update(reconciliationFindings)
      .set({ status: "reviewed", reviewedBy: "admin" })
      .where(eq(reconciliationFindings.dedupeKey, `test:${c.org}`));
    await recordFinding(t.db, {
      dedupeKey: `test:${c.org}`,
      kind: "token_mismatch",
      organizationId: c.org,
      detail: { n: 2 },
    });
    const rows = await findingsOf(c.org);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "reviewed", detail: { n: 2 } });
  });
});

describe("reprise d'une requête perdue (réservation passerelle libérée par le worker)", () => {
  // Chaque essai compte ses propres passages : on referme d'abord ce que les essais précédents ont laissé ouvert.
  beforeEach(async () => {
    await releaseStaleReservationsDetailed(t.db, { olderThan: future() });
  });

  it("avec intention et identifiant d'appel : réglée à l'estimé, événement « settled_by_recovery », anomalie visible", async () => {
    const c = await client(10n * M, 5n * M);
    const reservationId = await inFlight(c, "req_lost_1");
    const before = await getAccount(t.db, c.org);
    expect(before.heldMicro).toBe(500_000n);

    const out = await releaseStaleReservationsDetailed(t.db, {
      olderThan: future(),
    });
    expect(out).toMatchObject({ recovered: 1, released: 0, anomalies: 0 });

    const after = await getAccount(t.db, c.org);
    expect(after.heldMicro).toBe(0n);
    expect(after.balanceMicro).toBe(10n * M - 3_600n); // l'invite estimée est débitée
    const [res] = await t.db
      .select()
      .from(creditReservations)
      .where(eq(creditReservations.id, reservationId));
    expect(res).toMatchObject({ status: "settled", settledMicro: 3_600n });

    const [e] = await eventsOf(c.org);
    expect(e).toMatchObject({
      requestId: "req_lost_1",
      status: "aborted",
      errorCode: "lost_in_flight",
      usageSource: "settled_by_recovery",
      promptTokens: 1200,
      completionTokens: 0,
      costMicro: 3_600n,
      billed: true,
      litellmCallId: "call-req_lost_1",
      upstreamCostUsdNano: 120_000n,
      fxUsdToCadMicro: 1_400_000n,
      reservationId,
    });
    // L'événement porte la date de la requête, pas celle de la reprise.
    const intent = await intentOf("req_lost_1");
    expect(e?.createdAt.getTime()).toBe(intent?.createdAt.getTime());
    expect(intent?.status).toBe("recovered");
    expect(intent?.resolvedAt).not.toBeNull();

    const [f] = await findingsOf(c.org);
    expect(f).toMatchObject({
      kind: "recovered_in_flight",
      requestId: "req_lost_1",
      litellmCallId: "call-req_lost_1",
      status: "open",
    });
    // Le plafond de la clé a été rendu puis débité du coût réglé seulement.
    const [k] = await t.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, c.keyId));
    expect(k?.spentMicro).toBe(3_600n);
    // Le grand livre reste cohérent.
    const derived = await deriveBalance(t.db, c.org);
    expect(derived.balanceMicro).toBe(after.balanceMicro);
    expect(derived.heldMicro).toBe(0n);
  });

  it("rejouable : un second passage ne facture ni n'écrit rien de plus", async () => {
    const c = await client();
    await inFlight(c, "req_lost_2");
    await releaseStaleReservationsDetailed(t.db, { olderThan: future() });
    const again = await releaseStaleReservationsDetailed(t.db, {
      olderThan: future(),
    });
    expect(again).toMatchObject({ recovered: 0, released: 0, anomalies: 0 });
    expect(await eventsOf(c.org)).toHaveLength(1);
    expect(await findingsOf(c.org)).toHaveLength(1);
    expect((await getAccount(t.db, c.org)).balanceMicro).toBe(10n * M - 3_600n);
  });

  it("sans intention (antérieure au journal) : libérée MAIS laisse une anomalie « lost_reservation », aucun événement", async () => {
    const c = await client();
    await inFlight(c, "req_lost_3", { intent: false, amount: 700_000n });
    const out = await releaseStaleReservationsDetailed(t.db, {
      olderThan: future(),
    });
    expect(out).toMatchObject({ recovered: 0, released: 0, anomalies: 1 });
    expect((await getAccount(t.db, c.org)).heldMicro).toBe(0n);
    expect(await eventsOf(c.org)).toHaveLength(0);
    const [f] = await findingsOf(c.org);
    expect(f).toMatchObject({
      kind: "lost_reservation",
      requestId: "req_lost_3",
      status: "open",
    });
    expect(f?.detail).toMatchObject({
      reservedMicro: "700000",
      reason: "no_intent",
    });
  });

  it("intention sans identifiant d'appel (agent hébergé) : libérée, intention en anomalie, anomalie visible", async () => {
    const c = await client();
    await inFlight(c, "req_lost_4", { intent: { litellmCallId: null } });
    const out = await releaseStaleReservationsDetailed(t.db, {
      olderThan: future(),
    });
    expect(out.anomalies).toBe(1);
    expect(await eventsOf(c.org)).toHaveLength(0);
    expect((await intentOf("req_lost_4"))?.status).toBe("anomaly");
    expect((await findingsOf(c.org))[0]).toMatchObject({
      kind: "lost_reservation",
      detail: expect.objectContaining({ reason: "no_call_id" }),
    });
    expect((await getAccount(t.db, c.org)).balanceMicro).toBe(10n * M);
  });

  it("une réservation qui n'est pas de la passerelle est libérée comme avant, sans anomalie", async () => {
    const c = await client();
    const r = await reserve(t.db, {
      organizationId: c.org,
      amountMicro: 400_000n,
      idempotencyKey: `webpilot:session-${randomBytes(4).toString("hex")}`,
      configVersion: CFG,
    });
    expect(r.status).toBe("reserved");
    const out = await releaseStaleReservationsDetailed(t.db, {
      olderThan: future(),
    });
    expect(out).toMatchObject({ released: 1, recovered: 0, anomalies: 0 });
    expect(await findingsOf(c.org)).toHaveLength(0);
  });

  it("une intention déjà réglée n'est jamais reprise ; une requête récente non plus", async () => {
    const c = await client();
    await inFlight(c, "req_lost_5");
    // Trop récente : le délai de libération n'est pas atteint.
    const none = await releaseStaleReservationsDetailed(t.db, {
      olderThan: new Date(Date.now() - 3_600_000),
    });
    expect(none).toMatchObject({ recovered: 0, released: 0, anomalies: 0 });
    expect((await intentOf("req_lost_5"))?.status).toBe("pending");
  });

  it("l'ancienne signature renvoie toujours le nombre de réservations fermées", async () => {
    const c = await client();
    await inFlight(c, "req_lost_6");
    await inFlight(c, "req_lost_7", { intent: false });
    const n = await releaseStaleReservations(t.db, { olderThan: future() });
    expect(n).toBeGreaterThanOrEqual(2);
    expect((await getAccount(t.db, c.org)).heldMicro).toBe(0n);
  });

  it("organisation « maison » (aucune réservation) : l'usage perdu devient un événement non facturé", async () => {
    const c = await client(0n);
    await recordIntent(t.db, {
      requestId: "req_lost_house",
      organizationId: c.org,
      apiKeyId: c.keyId,
      reservationId: null,
      modelPublicId: "nexora/test",
      endpoint: "chat.completions",
      configVersion: "cat_1",
      stream: false,
      litellmCallId: "call-house",
      promptEstimate: 800,
      recoveryCostMicro: 2_400n,
      recoveryUpstreamCostUsdNano: 80_000n,
      priceInputMicro: 3_000_000n,
      priceOutputMicro: 15_000_000n,
      priceCacheMicro: null,
      priceCacheWriteMicro: null,
      priceWindow: null,
      fxUsdToCadMicro: 1_400_000n,
    });
    const out = await releaseStaleReservationsDetailed(t.db, {
      olderThan: future(),
    });
    expect(out.recovered).toBeGreaterThanOrEqual(1);
    const [e] = await eventsOf(c.org);
    expect(e).toMatchObject({
      billed: false,
      costMicro: 0n,
      valueMicro: 2_400n,
      usageSource: "settled_by_recovery",
    });
    expect((await getAccount(t.db, c.org)).balanceMicro).toBe(0n);
  });

  it("le grand livre garde ses écritures immuables : la reprise n'en modifie aucune", async () => {
    const c = await client();
    await inFlight(c, "req_lost_8");
    const before = await t.db
      .select()
      .from(creditEntries)
      .where(eq(creditEntries.organizationId, c.org));
    await releaseStaleReservationsDetailed(t.db, { olderThan: future() });
    const after = await t.db
      .select()
      .from(creditEntries)
      .where(eq(creditEntries.organizationId, c.org));
    for (const e of before) expect(after.find((x) => x.id === e.id)).toEqual(e);
    expect(after.length).toBeGreaterThan(before.length);
  });
});
