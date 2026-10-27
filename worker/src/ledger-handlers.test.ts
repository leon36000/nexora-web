import {
  credit,
  creditReservations,
  eq,
  getAccount,
  organizations,
  reserve,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  registerLedgerHandlers,
  staleReservationAfterMs,
} from "./ledger-handlers.ts";
import { defaultRegistry } from "./handlers.ts";
import { HandlerRegistry } from "./registry.ts";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});
const silent = createLogger({ name: "test", sink: () => {} });
const M = 1_000_000n;

async function org(): Promise<string> {
  const id = `org_${Math.random().toString(16).slice(2, 10)}`;
  await t.db.insert(organizations).values({ id, name: id, slug: id });
  return id;
}
async function reserveAged(
  id: string,
  key: string,
  amount: bigint,
  ageMs: number,
) {
  const r = await reserve(t.db, {
    organizationId: id,
    amountMicro: amount,
    idempotencyKey: key,
    configVersion: "t",
  });
  if (r.status !== "reserved") throw new Error("réservation attendue");
  await t.db
    .update(creditReservations)
    .set({ createdAt: new Date(Date.now() - ageMs) })
    .where(eq(creditReservations.id, r.reservation.id));
  return r.reservation.id;
}
const ctx = { log: silent, signal: new AbortController().signal };
const job = (type: string) => ({
  id: "j",
  type,
  payload: {},
  attempt: 1,
  maxAttempts: 1,
});

describe("délai de libération", () => {
  it("dépasse toujours la durée maximale d'un flux, avec une marge", () => {
    expect(staleReservationAfterMs({})).toBeGreaterThanOrEqual(
      900_000 + 600_000,
    );
    expect(staleReservationAfterMs({})).toBe(30 * 60_000);
    expect(
      staleReservationAfterMs({ GATEWAY_STREAM_TIMEOUT_MS: "3600000" }),
    ).toBeGreaterThan(3_600_000);
    expect(staleReservationAfterMs({ GATEWAY_STREAM_TIMEOUT_MS: "abc" })).toBe(
      30 * 60_000,
    );
  });
});

describe("tâches du grand livre", () => {
  it("le registre du worker gère les deux types que le planificateur déclare", () => {
    const types = defaultRegistry({ db: t.db, log: silent }).types();
    expect(types).toContain("ledger.release-stale");
    expect(types).toContain("ledger.expire");
  });

  it("ledger.release-stale libère les réservations de plus de 30 min et laisse les récentes (même d'un long flux)", async () => {
    const id = await org();
    await credit(t.db, {
      organizationId: id,
      amountMicro: 10n * M,
      idempotencyKey: `f:${id}`,
      configVersion: "t",
      source: "test",
    });
    await reserveAged(id, `r1:${id}`, M, 20 * 60_000); // flux long en cours : conservée
    await reserveAged(id, `r2:${id}`, 2n * M, 31 * 60_000); // perdue
    const registry = registerLedgerHandlers(new HandlerRegistry(), {
      db: t.db,
      log: silent,
    });
    const handler = registry.get("ledger.release-stale");
    if (!handler) throw new Error("gestionnaire attendu");
    await handler(job("ledger.release-stale"), ctx);
    expect(await getAccount(t.db, id)).toMatchObject({
      heldMicro: M,
      availableMicro: 9n * M,
    });
    await handler(job("ledger.release-stale"), ctx); // rejeu : sans effet
    expect((await getAccount(t.db, id)).heldMicro).toBe(M);
  });

  it("ledger.expire expire les lots échus, une seule fois", async () => {
    const id = await org();
    await credit(t.db, {
      organizationId: id,
      amountMicro: 3n * M,
      idempotencyKey: `lot:${id}`,
      configVersion: "t",
      source: "purchase",
      expiresAt: new Date("2026-01-01T00:00:00Z"),
    });
    const registry = registerLedgerHandlers(new HandlerRegistry(), {
      db: t.db,
      log: silent,
      now: () => new Date("2026-02-01T00:00:00Z"),
    });
    const handler = registry.get("ledger.expire");
    if (!handler) throw new Error("gestionnaire attendu");
    await handler(job("ledger.expire"), ctx);
    expect((await getAccount(t.db, id)).balanceMicro).toBe(0n);
    await handler(job("ledger.expire"), ctx);
    expect((await getAccount(t.db, id)).balanceMicro).toBe(0n);
  });
});
