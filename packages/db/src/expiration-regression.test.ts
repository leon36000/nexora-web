import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  credit,
  expireDue,
  getAccount,
  reserve,
  settleReservation,
} from "./ledger.ts";
import { organizations } from "./schema.ts";
import { createTestDatabase, type TestDatabase } from "./testing.ts";
let t: TestDatabase;
const M = 1_000_000n;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  if (t) await t.drop();
});
it("ne réattribue pas une dépense à un lot déjà expiré", async () => {
  const organizationId = `org_${randomBytes(6).toString("hex")}`;
  await t.db
    .insert(organizations)
    .values({ id: organizationId, name: organizationId, slug: organizationId });
  const lot = async (id: string, expires: string) =>
    credit(t.db, {
      organizationId,
      amountMicro: 10n * M,
      idempotencyKey: id,
      configVersion: "test",
      source: "purchase",
      expiresAt: new Date(expires),
    });
  await lot("first", "2026-06-01T00:00:00Z");
  const first = await expireDue(t.db, {
    organizationId,
    now: new Date("2026-07-01T00:00:00Z"),
    configVersion: "test",
  });
  expect(first.expiredMicro).toBe(10n * M);
  await lot("second", "2026-12-01T00:00:00Z");
  const reservation = await reserve(t.db, {
    organizationId,
    amountMicro: 10n * M,
    idempotencyKey: "use",
    configVersion: "test",
  });
  if (reservation.status !== "reserved")
    throw new Error("réservation attendue");
  await settleReservation(t.db, {
    organizationId,
    reservationId: reservation.reservation.id,
    actualMicro: 10n * M,
  });
  await lot("third", "2027-02-01T00:00:00Z");
  const next = await expireDue(t.db, {
    organizationId,
    now: new Date("2027-01-01T00:00:00Z"),
    configVersion: "test",
  });
  const balance = await getAccount(t.db, organizationId);
  expect({ expired: next.expiredMicro, balance: balance.balanceMicro }).toEqual(
    { expired: 0n, balance: 10n * M },
  );
});
it("respecte les réservations, le FIFO et le rejeu concurrent après une expiration partielle", async () => {
  const organizationId = `org_${randomBytes(6).toString("hex")}`;
  await t.db
    .insert(organizations)
    .values({ id: organizationId, name: organizationId, slug: organizationId });
  const lot = async (id: string, expires: string) =>
    credit(t.db, {
      organizationId,
      amountMicro: 10n * M,
      idempotencyKey: id,
      configVersion: "test",
      source: "purchase",
      expiresAt: new Date(expires),
    });
  const use = async (id: string, amountMicro: bigint, settle = true) => {
    const r = await reserve(t.db, {
      organizationId,
      amountMicro,
      idempotencyKey: id,
      configVersion: "test",
    });
    if (r.status !== "reserved") throw new Error("réservation attendue");
    if (settle)
      await settleReservation(t.db, {
        organizationId,
        reservationId: r.reservation.id,
        actualMicro: amountMicro,
      });
    return r.reservation.id;
  };
  await lot("partial-first", "2026-06-01T00:00:00Z");
  const held = await use("held", 6n * M, false);
  expect(
    (
      await expireDue(t.db, {
        organizationId,
        now: new Date("2026-07-01T00:00:00Z"),
        configVersion: "test",
      })
    ).expiredMicro,
  ).toBe(4n * M);
  await settleReservation(t.db, {
    organizationId,
    reservationId: held,
    actualMicro: 6n * M,
  });
  await lot("partial-second", "2026-12-01T00:00:00Z");
  await use("second-use", 5n * M);
  await lot("partial-third", "2027-02-01T00:00:00Z");
  const params = {
    organizationId,
    now: new Date("2027-01-01T00:00:00Z"),
    configVersion: "test",
  };
  const results = await Promise.all([
    expireDue(t.db, params),
    expireDue(t.db, params),
  ]);
  expect(results.reduce((sum, result) => sum + result.expiredMicro, 0n)).toBe(
    5n * M,
  );
  expect((await getAccount(t.db, organizationId)).balanceMicro).toBe(10n * M);
  expect((await expireDue(t.db, params)).expiredMicro).toBe(0n);
});
