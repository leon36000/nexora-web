import {
  apiKeys,
  credit,
  creditEntries,
  creditReservations,
  eq,
  getAccount,
  reserve,
  usageEvents,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiKey } from "./keys";
import { newOrganization } from "./test-support";
import { finalizeRequest, reserveKeySpend, usageByDayAndModel } from "./usage";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

const price = { input: 1_000_000n, output: 3_000_000n, cache: null };
const M = 1_000_000n;

async function setup() {
  const org = await newOrganization(t.db);
  await credit(t.db, {
    organizationId: org,
    amountMicro: 5n * M,
    idempotencyKey: `f:${org}`,
    configVersion: "t",
    source: "test",
  });
  const { record } = await createApiKey(t.db, {
    organizationId: org,
    name: "k",
    spendCapMicro: 10_000n,
  });
  const reserved = await reserve(t.db, {
    organizationId: org,
    amountMicro: 1000n,
    idempotencyKey: `gw:${org}`,
    configVersion: "cat_x",
  });
  if (reserved.status !== "reserved") throw new Error("réservation attendue");
  await reserveKeySpend(t.db, record.id, 1000n);
  return { org, keyId: record.id, reservationId: reserved.reservation.id };
}

const input = (s: Awaited<ReturnType<typeof setup>>, requestId: string) => ({
  requestId,
  organizationId: s.org,
  apiKeyId: s.keyId,
  modelPublicId: "nexora/test",
  endpoint: "chat.completions" as const,
  configVersion: "cat_x",
  stream: false,
  status: "ok" as const,
  httpStatus: 200,
  tokens: { prompt: 100, completion: 50, cached: 0 },
  price,
  upstreamPrice: { input: 100_000n, output: 200_000n, cache: null },
  reservationId: s.reservationId,
  reservedMicro: 1000n,
  keyReserved: true,
  latencyMs: 12,
});

describe("usage idempotent", () => {
  it("rejouer le même request_id ne débite ni ne compte deux fois", async () => {
    const s = await setup();
    const first = await finalizeRequest(t.db, input(s, "req_idem_1"));
    const second = await finalizeRequest(t.db, input(s, "req_idem_1"));
    expect(first).toEqual({ costMicro: 250n, replayed: false });
    expect(second).toEqual({ costMicro: 250n, replayed: true });
    const events = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, s.org));
    expect(events).toHaveLength(1);
    const settles = (
      await t.db
        .select()
        .from(creditEntries)
        .where(eq(creditEntries.organizationId, s.org))
    ).filter((e) => e.kind === "settle");
    expect(settles).toHaveLength(1);
    expect((await getAccount(t.db, s.org)).balanceMicro).toBe(5n * M - 250n);
    const [k] = await t.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, s.keyId));
    expect(k?.spentMicro).toBe(250n); // 1000 réservés → 250 réglés, une seule fois
  });

  it("des rejeux concurrents ne produisent qu'un seul événement et un seul règlement", async () => {
    const s = await setup();
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        finalizeRequest(t.db, input(s, "req_idem_2")),
      ),
    );
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(
      await t.db
        .select()
        .from(usageEvents)
        .where(eq(usageEvents.organizationId, s.org)),
    ).toHaveLength(1);
    expect((await getAccount(t.db, s.org)).balanceMicro).toBe(5n * M - 250n);
  });

  it("un échec libère la réservation sans rien débiter, et rend le plafond de la clé", async () => {
    const s = await setup();
    await finalizeRequest(t.db, {
      ...input(s, "req_err_1"),
      status: "error",
      httpStatus: 502,
      tokens: { prompt: 0, completion: 0, cached: 0 },
    });
    expect(await getAccount(t.db, s.org)).toMatchObject({
      balanceMicro: 5n * M,
      heldMicro: 0n,
    });
    const [r] = await t.db
      .select()
      .from(creditReservations)
      .where(eq(creditReservations.id, s.reservationId));
    expect(r?.status).toBe("released");
    const [k] = await t.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, s.keyId));
    expect(k?.spentMicro).toBe(0n);
  });

  it("la base refuse de modifier ou de supprimer un événement d'usage", async () => {
    const s = await setup();
    await finalizeRequest(t.db, input(s, "req_immutable_1"));
    await expect(
      t.db
        .update(usageEvents)
        .set({ costMicro: 0n })
        .where(eq(usageEvents.requestId, "req_immutable_1")),
    ).rejects.toThrow();
    await expect(
      t.db
        .delete(usageEvents)
        .where(eq(usageEvents.requestId, "req_immutable_1")),
    ).rejects.toThrow();
  });
});

describe("plafond de dépense de la clé", () => {
  it("la réservation atomique ne dépasse jamais le plafond sous concurrence", async () => {
    const org = await newOrganization(t.db);
    const { record } = await createApiKey(t.db, {
      organizationId: org,
      name: "k",
      spendCapMicro: 5000n,
    });
    const results = await Promise.all(
      Array.from({ length: 20 }, () => reserveKeySpend(t.db, record.id, 1000n)),
    );
    expect(results.filter(Boolean)).toHaveLength(5);
    const [k] = await t.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, record.id));
    expect(k?.spentMicro).toBe(5000n);
  });
});

describe("usage par jour et par modèle", () => {
  it("agrège les événements de l'organisation seulement", async () => {
    const s = await setup();
    await finalizeRequest(t.db, input(s, "req_agg_1"));
    const rows = await usageByDayAndModel(t.db, s.org, 7);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      model: "nexora/test",
      requests: 1,
      promptTokens: 100,
      completionTokens: 50,
      costMicro: 250n,
    });
    const other = await newOrganization(t.db);
    expect(await usageByDayAndModel(t.db, other, 7)).toEqual([]);
  });
});
