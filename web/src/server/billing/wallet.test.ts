import { credit as ledgerCredit, reserve, settleReservation } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newOrganization } from "../gateway/test-support";
import { allocateLots, loadWallet, type RawLot } from "./wallet";

const NOW = new Date("2026-10-15T12:00:00.000Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const lot = (over: Partial<RawLot> & { id: string }): RawLot => ({
  source: "purchase",
  amountMicro: 10_000_000n,
  createdAt: day(-10),
  expiresAt: day(300),
  ...over,
});

describe("allocateLots : la consommation est imputée aux lots dans l'ordre d'échéance (comme l'expiration du grand livre)", () => {
  it("les crédits inclus, qui expirent d'abord, servent d'abord", () => {
    const out = allocateLots(
      [
        lot({ id: "achat", expiresAt: day(300) }),
        lot({
          id: "forfait",
          source: "subscription",
          amountMicro: 4_400_000n,
          expiresAt: day(10),
        }),
      ],
      3_000_000n,
      new Map(),
      NOW,
    );
    const forfait = out.find((l) => l.id === "forfait");
    const achat = out.find((l) => l.id === "achat");
    expect(forfait).toMatchObject({
      usedMicro: 3_000_000n,
      remainingMicro: 1_400_000n,
      included: true,
    });
    expect(achat).toMatchObject({
      usedMicro: 0n,
      remainingMicro: 10_000_000n,
      included: false,
    });
  });

  it("une consommation plus grande que le forfait déborde sur le lot suivant", () => {
    const out = allocateLots(
      [
        lot({
          id: "forfait",
          source: "subscription",
          amountMicro: 4_400_000n,
          expiresAt: day(10),
        }),
        lot({ id: "achat" }),
      ],
      6_400_000n,
      new Map(),
      NOW,
    );
    expect(out.find((l) => l.id === "forfait")?.remainingMicro).toBe(0n);
    expect(out.find((l) => l.id === "achat")?.remainingMicro).toBe(8_000_000n);
  });

  it("un lot échu n'est pas rendu ; ce qui a déjà expiré est déduit du restant", () => {
    const out = allocateLots(
      [
        lot({ id: "vieux", expiresAt: day(-1) }),
        lot({ id: "partiel", expiresAt: day(5) }),
      ],
      0n,
      new Map([["partiel", 2_000_000n]]),
      NOW,
    );
    expect(out.map((l) => l.id)).toEqual(["partiel"]);
    expect(out[0]?.remainingMicro).toBe(8_000_000n);
  });

  it("un lot sans échéance passe en dernier", () => {
    const out = allocateLots(
      [lot({ id: "sans", expiresAt: null }), lot({ id: "avec" })],
      1_000_000n,
      new Map(),
      NOW,
    );
    expect(out.find((l) => l.id === "avec")?.usedMicro).toBe(1_000_000n);
    expect(out.find((l) => l.id === "sans")?.usedMicro).toBe(0n);
  });
});

describe("loadWallet (base)", () => {
  let t: TestDatabase;
  beforeAll(async () => {
    t = await createTestDatabase();
  });
  afterAll(async () => {
    await t.drop();
  });

  async function credit(
    org: string,
    key: string,
    source: string,
    micro: bigint,
    expiresAt: Date,
  ) {
    await ledgerCredit(t.db, {
      organizationId: org,
      amountMicro: micro,
      idempotencyKey: key,
      configVersion: "cfg_test",
      source,
      expiresAt,
    });
  }
  async function spend(org: string, key: string, micro: bigint) {
    const r = await reserve(t.db, {
      organizationId: org,
      amountMicro: micro,
      idempotencyKey: `${key}-r`,
      configVersion: "cfg_test",
    });
    if (r.status !== "reserved") throw new Error("réservation refusée");
    await settleReservation(t.db, {
      organizationId: org,
      reservationId: r.reservation.id,
      actualMicro: micro,
    });
  }

  it("une organisation neuve : aucun lot, aucun forfait", async () => {
    const org = await newOrganization(t.db);
    expect(await loadWallet(t.db, org, NOW)).toEqual({
      lots: [],
      included: null,
    });
  });

  it("forfait de 4,40 $ dont 1,10 $ consommé : restant, utilisé, échéance", async () => {
    const org = await newOrganization(t.db);
    await credit(org, `${org}-a`, "purchase", 20_000_000n, day(300));
    await credit(org, `${org}-b`, "subscription", 4_400_000n, day(16));
    await spend(org, `${org}-s`, 1_100_000n);
    const wallet = await loadWallet(t.db, org, NOW);
    expect(wallet.included).toEqual({
      amountMicro: 4_400_000n,
      usedMicro: 1_100_000n,
      remainingMicro: 3_300_000n,
      expiresAt: day(16),
    });
    expect(wallet.lots.map((l) => l.source)).toEqual([
      "subscription",
      "purchase",
    ]);
  });

  it("jamais les lots d'une autre organisation", async () => {
    const a = await newOrganization(t.db);
    const b = await newOrganization(t.db);
    await credit(a, `${a}-a`, "subscription", 4_400_000n, day(16));
    expect((await loadWallet(t.db, b, NOW)).included).toBeNull();
  });
});
