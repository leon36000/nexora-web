/** Réconciliation quotidienne : lectures, invariants internes, enregistrement idempotent et purge, sur une vraie base. */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordIntent } from "./intents.ts";
import { credit, reserve, settleReservation } from "./ledger.ts";
import {
  checkLedgerInvariants,
  finishRun,
  lastRun,
  listFindings,
  loadLedgerRows,
  purgeSettledIntents,
  saveReconciliation,
  startRun,
} from "./reconciliation.ts";
import {
  apiKeys,
  creditAccounts,
  organizations,
  reconciliationFindings,
  usageEvents,
  usageIntents,
  usageReconciliations,
} from "./schema.ts";
import { createTestDatabase, type TestDatabase } from "./testing.ts";

let t: TestDatabase;
const M = 1_000_000n;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

async function client() {
  const org = `org_${randomBytes(6).toString("hex")}`;
  await t.db.insert(organizations).values({ id: org, name: org, slug: org });
  await credit(t.db, {
    organizationId: org,
    amountMicro: 10n * M,
    idempotencyKey: `f:${org}`,
    configVersion: "t",
    source: "purchase",
  });
  const [key] = await t.db
    .insert(apiKeys)
    .values({
      organizationId: org,
      name: "k",
      prefix: "nxk_t",
      keyHash: randomBytes(12).toString("hex"),
    })
    .returning();
  if (!key) throw new Error("clé");
  return { org, keyId: key.id };
}

async function event(
  c: { org: string; keyId: string },
  requestId: string,
  over: Partial<typeof usageEvents.$inferInsert> = {},
) {
  const [e] = await t.db
    .insert(usageEvents)
    .values({
      requestId,
      organizationId: c.org,
      apiKeyId: c.keyId,
      modelPublicId: "nexora/m",
      endpoint: "chat.completions",
      configVersion: "cat",
      status: "ok",
      httpStatus: 200,
      promptTokens: 100,
      completionTokens: 20,
      costMicro: 500n,
      valueMicro: 500n,
      createdAt: new Date("2026-11-10T15:00:00Z"),
      ...over,
    })
    .returning();
  if (!e) throw new Error("événement");
  return e;
}

describe("lecture du jour", () => {
  it("ne garde que le jour UTC demandé, les identifiants amont et les non-échecs", async () => {
    const c = await client();
    await event(c, "r_in", { litellmCallId: "call-in" });
    await event(c, "r_gen", { upstreamGenerationId: "gen-in" });
    await event(c, "r_noid"); // aucun identifiant : rien à joindre
    await event(c, "r_err", { status: "error", litellmCallId: "call-err" });
    await event(c, "r_other_day", {
      litellmCallId: "call-d",
      createdAt: new Date("2026-11-11T00:00:00Z"), // borne exclue
    });
    const rows = (await loadLedgerRows(t.db, "2026-11-10")).filter((r) =>
      r.requestId.startsWith("r_"),
    );
    expect(rows.map((r) => r.requestId).sort()).toEqual(["r_gen", "r_in"]);
    expect(rows[0]?.day).toBe("2026-11-10");
  });

  it("refuse un jour illisible", async () => {
    await expect(loadLedgerRows(t.db, "hier")).rejects.toThrow(RangeError);
  });
});

describe("invariants internes", () => {
  it("règlement de la passerelle = coût de l'événement : aucun écart quand tout concorde", async () => {
    const c = await client();
    const r = await reserve(t.db, {
      organizationId: c.org,
      amountMicro: 1000n,
      idempotencyKey: "gw:req_inv_ok",
      configVersion: "t",
    });
    if (r.status !== "reserved") throw new Error("réservation");
    await settleReservation(t.db, {
      organizationId: c.org,
      reservationId: r.reservation.id,
      actualMicro: 500n,
    });
    await event(c, "req_inv_ok", {
      reservationId: r.reservation.id,
      costMicro: 500n,
    });
    const today = new Date().toISOString().slice(0, 10);
    const f = (await checkLedgerInvariants(t.db, today)).filter(
      (x) => x.organizationId === c.org,
    );
    expect(f).toEqual([]);
  });

  it("événement dont le coût ≠ règlement : ledger_mismatch ; solde en cache faussé : ledger_mismatch", async () => {
    const c = await client();
    const r = await reserve(t.db, {
      organizationId: c.org,
      amountMicro: 1000n,
      idempotencyKey: "gw:req_inv_bad",
      configVersion: "t",
    });
    if (r.status !== "reserved") throw new Error("réservation");
    await settleReservation(t.db, {
      organizationId: c.org,
      reservationId: r.reservation.id,
      actualMicro: 500n,
    });
    await event(c, "req_inv_bad", {
      reservationId: r.reservation.id,
      costMicro: 400n,
    });
    await t.db
      .update(creditAccounts)
      .set({ balanceMicro: 123n })
      .where(eq(creditAccounts.organizationId, c.org));
    const today = new Date().toISOString().slice(0, 10);
    const f = (await checkLedgerInvariants(t.db, today)).filter(
      (x) => x.organizationId === c.org,
    );
    expect(f.map((x) => x.detail?.check).sort()).toEqual([
      "account_vs_entries",
      "settled_vs_usage_event",
    ]);
    expect(
      f.find((x) => x.detail?.check === "settled_vs_usage_event")?.detail,
    ).toMatchObject({
      settledMicro: "500",
      eventCostMicro: "400",
    });
  });
});

describe("enregistrement", () => {
  it("rejouable : un second passage met à jour la ligne de l'événement et celle de l'écart, sans doublon ni perte de la révision", async () => {
    const c = await client();
    const e = await event(c, "r_save", { litellmCallId: "call-save" });
    const runA = await startRun(t.db, "2026-11-10");
    const base = {
      eventId: e.id,
      requestId: "r_save",
      source: "litellm" as const,
      upstreamCostUsdNano: 1000n,
      nativePrompt: 100,
      nativeCompletion: 20,
      nativeCached: null,
      nativeReasoning: null,
      cancelled: false,
      provider: null,
    };
    const finding = {
      dedupeKey: `token_mismatch:r_save`,
      kind: "token_mismatch" as const,
      requestId: "r_save",
      organizationId: c.org,
      detail: { n: 1 },
    };
    await saveReconciliation(
      t.db,
      runA,
      [{ ...base, status: "mismatch" }],
      [finding],
    );
    await t.db
      .update(reconciliationFindings)
      .set({ status: "reviewed", reviewedBy: "admin" })
      .where(eq(reconciliationFindings.dedupeKey, "token_mismatch:r_save"));
    const runB = await startRun(t.db, "2026-11-10");
    await saveReconciliation(
      t.db,
      runB,
      [{ ...base, status: "ok" }],
      [{ ...finding, detail: { n: 2 } }],
    );
    const rows = await t.db
      .select()
      .from(usageReconciliations)
      .where(eq(usageReconciliations.requestId, "r_save"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "ok", runId: runB });
    const fs = await t.db
      .select()
      .from(reconciliationFindings)
      .where(eq(reconciliationFindings.dedupeKey, "token_mismatch:r_save"));
    expect(fs).toHaveLength(1);
    expect(fs[0]).toMatchObject({
      status: "reviewed",
      detail: { n: 2 },
      runId: runB,
    });
  });

  it("journal des exécutions et liste des écarts ouverts", async () => {
    const run = await startRun(t.db, "2026-11-09");
    await finishRun(t.db, run, "alert", { compared: 3 });
    const last = await lastRun(t.db);
    expect(last).toMatchObject({
      id: run,
      status: "alert",
      summary: { compared: 3 },
    });
    const open = await listFindings(t.db, { status: "open", limit: 5 });
    expect(open.every((f) => f.status === "open")).toBe(true);
  });
});

describe("purge du journal d'intention", () => {
  it("n'efface que les intentions réglées et anciennes ; garde les « pending » et les anomalies", async () => {
    const c = await client();
    const old = new Date(Date.now() - 90 * 86_400_000);
    for (const [id, status] of [
      ["p_settled_old", "settled"],
      ["p_pending_old", "pending"],
      ["p_anomaly_old", "anomaly"],
      ["p_settled_new", "settled"],
    ] as const) {
      await recordIntent(t.db, {
        requestId: id,
        organizationId: c.org,
        apiKeyId: c.keyId,
        reservationId: null,
        modelPublicId: "nexora/m",
        endpoint: "chat.completions",
        configVersion: "cat",
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
      await t.db
        .update(usageIntents)
        .set({ status, createdAt: id.endsWith("old") ? old : new Date() })
        .where(eq(usageIntents.requestId, id));
    }
    const n = await purgeSettledIntents(
      t.db,
      new Date(Date.now() - 45 * 86_400_000),
    );
    expect(n).toBe(1);
    const left = await t.db
      .select()
      .from(usageIntents)
      .where(eq(usageIntents.organizationId, c.org));
    expect(left.map((x) => x.requestId).sort()).toEqual([
      "p_anomaly_old",
      "p_pending_old",
      "p_settled_new",
    ]);
  });
});
