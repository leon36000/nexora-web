import { eq, getAccount, usageEvents } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  activePrices,
  finalizeWebpilot,
  NO_UNITS,
  reserveWebpilot,
  sellCost,
  unpricedUnits,
  upstreamCost,
} from "./billing.ts";
import { fund, newKey, newOrg, publishSheet } from "./test-support.ts";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

let n = 0;
const rid = () => `wp_test_${++n}_${Math.random().toString(16).slice(2)}`;

describe("feuille de prix en vigueur", () => {
  it("sans feuille publiée : aucun prix (jamais de prix par défaut)", async () => {
    expect(await activePrices(t.db, new Date())).toBeNull();
  });

  it("ignore les brouillons et les feuilles pas encore en vigueur, prend la plus récente", async () => {
    const past = new Date(Date.now() - 3_600_000);
    await publishSheet(t.db, { page_static: { sell: 100n } }, past);
    expect(
      (await activePrices(t.db, new Date()))?.units.page_static?.sellCadMicro,
    ).toBe(100n);
    await publishSheet(
      t.db,
      { page_static: { sell: 250n, upstream: 40n } },
      new Date(Date.now() - 1000),
    );
    await publishSheet(
      t.db,
      { page_static: { sell: 999n } },
      new Date(Date.now() + 3_600_000),
    );
    const now = await activePrices(t.db, new Date());
    expect(now?.units.page_static).toEqual({
      sellCadMicro: 250n,
      upstreamUsdMicro: 40n,
    });
    expect(now?.configVersion).toBe(`webpilot_prices_v${now?.version}`);
    // Une requête passée garde son prix : la feuille d'hier reste lisible.
    const before = await activePrices(t.db, new Date(Date.now() - 30 * 60_000));
    expect(before?.units.page_static?.sellCadMicro).toBe(100n);
  });
});

describe("calcul", () => {
  const prices = {
    sheetId: "s",
    version: 1,
    configVersion: "webpilot_prices_v1",
    units: {
      page_static: { sellCadMicro: 10n, upstreamUsdMicro: 3n },
      page_browser: { sellCadMicro: 50n, upstreamUsdMicro: 20n },
    },
  };
  it("prix de vente et coût amont par unité", () => {
    const units = { pageStatic: 3, pageBrowser: 2, browserMinute: 0 };
    expect(sellCost(units, prices)).toBe(130n);
    expect(upstreamCost(units, prices)).toBe(49n);
  });
  it("signale les unités sans prix", () => {
    expect(
      unpricedUnits(
        { pageStatic: 1, pageBrowser: 0, browserMinute: 2 },
        prices,
      ),
    ).toEqual(["browser_minute"]);
    expect(
      unpricedUnits({ pageStatic: 1, pageBrowser: 0, browserMinute: 0 }, null),
    ).toEqual(["page_static"]);
    expect(unpricedUnits(NO_UNITS, null)).toEqual([]);
  });
});

describe("réservation et règlement", () => {
  async function setup(
    opts: { house?: boolean; balance?: bigint; cap?: bigint } = {},
  ) {
    const org = await newOrg(t.db, opts.house);
    const key = await newKey(
      t.db,
      org,
      opts.cap ? { spendCapMicro: opts.cap } : {},
    );
    if (opts.balance) await fund(t.db, org, opts.balance);
    return { org, key };
  }
  const prices = {
    sheetId: "s",
    version: 1,
    configVersion: "webpilot_prices_v1",
    units: { page_static: { sellCadMicro: 1000n, upstreamUsdMicro: 100n } },
  };

  it("402 : solde insuffisant, solde bloqué, plafond de la clé", async () => {
    const poor = await setup({ balance: 500n });
    const r1 = await reserveWebpilot(t.db, {
      organizationId: poor.org,
      apiKeyId: poor.key,
      idempotencyKey: rid(),
      amountMicro: 1000n,
      configVersion: "v",
      house: false,
    });
    expect(r1).toEqual({ ok: false, reason: "insufficient" });
    const capped = await setup({ balance: 10_000n, cap: 1500n });
    const r2 = await reserveWebpilot(t.db, {
      organizationId: capped.org,
      apiKeyId: capped.key,
      idempotencyKey: rid(),
      amountMicro: 2000n,
      configVersion: "v",
      house: false,
    });
    expect(r2).toEqual({ ok: false, reason: "key_cap" });
  });

  it("règle au coût réel : le surplus réservé est libéré, l'événement porte les unités, l'hôte et la décision", async () => {
    const s = await setup({ balance: 100_000n });
    const requestId = rid();
    const r = await reserveWebpilot(t.db, {
      organizationId: s.org,
      apiKeyId: s.key,
      idempotencyKey: `wp:${requestId}`,
      amountMicro: 5000n,
      configVersion: prices.configVersion,
      house: false,
    });
    if (!r.ok) throw new Error("réservation");
    const out = await finalizeWebpilot(t.db, {
      requestId,
      organizationId: s.org,
      apiKeyId: s.key,
      operation: "scrape",
      prices,
      status: "ok",
      httpStatus: 200,
      units: { pageStatic: 2, pageBrowser: 0, browserMinute: 0 },
      reservationId: r.reservationId,
      house: false,
      destinationHost: "exemple.test",
      privacy: { decision: "mask", policyVersion: "pol-7" },
      latencyMs: 12,
    });
    expect(out.costMicro).toBe(2000n);
    const acct = await getAccount(t.db, s.org);
    expect(acct.balanceMicro).toBe(98_000n);
    expect(acct.heldMicro).toBe(0n);
    const [ev] = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.requestId, requestId));
    expect(ev).toMatchObject({
      endpoint: "webpilot.scrape",
      modelPublicId: "webpilot/scrape",
      costMicro: 2000n,
      billed: true,
      unitsPageStatic: 2,
      destinationHost: "exemple.test",
      privacyDecision: "mask",
      policyVersion: "pol-7",
      upstreamCostUsdMicro: 200n,
      configVersion: "webpilot_prices_v1",
    });
  });

  it("une erreur avant livraison libère tout et ne coûte rien", async () => {
    const s = await setup({ balance: 100_000n });
    const requestId = rid();
    const r = await reserveWebpilot(t.db, {
      organizationId: s.org,
      apiKeyId: s.key,
      idempotencyKey: `wp:${requestId}`,
      amountMicro: 5000n,
      configVersion: "v",
      house: false,
    });
    if (!r.ok) throw new Error("réservation");
    await finalizeWebpilot(t.db, {
      requestId,
      organizationId: s.org,
      apiKeyId: s.key,
      operation: "scrape",
      prices,
      status: "error",
      httpStatus: 504,
      errorCode: "target_timeout",
      units: { pageStatic: 3, pageBrowser: 0, browserMinute: 0 },
      reservationId: r.reservationId,
      house: false,
      latencyMs: 1,
    });
    const acct = await getAccount(t.db, s.org);
    expect(acct.balanceMicro).toBe(100_000n);
    expect(acct.heldMicro).toBe(0n);
    const [ev] = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.requestId, requestId));
    expect(ev).toMatchObject({
      costMicro: 0n,
      unitsPageStatic: 0,
      errorCode: "target_timeout",
      status: "error",
    });
  });

  it("idempotent : rejouer le règlement ne débite pas deux fois", async () => {
    const s = await setup({ balance: 100_000n });
    const requestId = rid();
    const r = await reserveWebpilot(t.db, {
      organizationId: s.org,
      apiKeyId: s.key,
      idempotencyKey: `wp:${requestId}`,
      amountMicro: 3000n,
      configVersion: "v",
      house: false,
    });
    if (!r.ok) throw new Error("réservation");
    const input = {
      requestId,
      organizationId: s.org,
      apiKeyId: s.key,
      operation: "scrape" as const,
      prices,
      status: "ok" as const,
      httpStatus: 200,
      units: { pageStatic: 3, pageBrowser: 0, browserMinute: 0 },
      reservationId: r.reservationId,
      house: false,
      latencyMs: 1,
    };
    await finalizeWebpilot(t.db, input);
    const again = await finalizeWebpilot(t.db, input);
    expect(again.replayed).toBe(true);
    expect((await getAccount(t.db, s.org)).balanceMicro).toBe(97_000n);
  });

  it("organisation « maison » : aucune réservation ni débit, la valeur offerte est comptée", async () => {
    const s = await setup({ house: true });
    const requestId = rid();
    const r = await reserveWebpilot(t.db, {
      organizationId: s.org,
      apiKeyId: s.key,
      idempotencyKey: `wp:${requestId}`,
      amountMicro: 3000n,
      configVersion: "v",
      house: true,
    });
    expect(r).toEqual({ ok: true, reservationId: null, amountMicro: 0n });
    const out = await finalizeWebpilot(t.db, {
      requestId,
      organizationId: s.org,
      apiKeyId: s.key,
      operation: "search",
      prices,
      status: "ok",
      httpStatus: 200,
      units: { pageStatic: 1, pageBrowser: 0, browserMinute: 0 },
      reservationId: null,
      house: true,
      latencyMs: 1,
    });
    expect(out.costMicro).toBe(0n);
    const [ev] = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.requestId, requestId));
    expect(ev).toMatchObject({
      billed: false,
      costMicro: 0n,
      valueMicro: 1000n,
    });
    expect((await getAccount(t.db, s.org)).balanceMicro).toBe(0n);
  });

  it("organisation « maison » sans feuille publiée : fonctionne, valeur zéro", async () => {
    const s = await setup({ house: true });
    const requestId = rid();
    await finalizeWebpilot(t.db, {
      requestId,
      organizationId: s.org,
      apiKeyId: s.key,
      operation: "scrape",
      prices: null,
      status: "ok",
      httpStatus: 200,
      units: { pageStatic: 1, pageBrowser: 0, browserMinute: 0 },
      reservationId: null,
      house: true,
      latencyMs: 1,
    });
    const [ev] = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.requestId, requestId));
    expect(ev).toMatchObject({
      billed: false,
      valueMicro: 0n,
      configVersion: "webpilot_unpriced",
      unitsPageStatic: 1,
    });
  });
});
