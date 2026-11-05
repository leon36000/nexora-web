import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  credit,
  debit,
  deriveBalance,
  expireAllDue,
  expireDue,
  getAccount,
  LedgerError,
  listEntries,
  releaseReservation,
  releaseStaleReservations,
  reserve,
  settleReservation,
} from "./ledger.ts";
import {
  apiKeys,
  creditEntries,
  creditReservations,
  organizations,
} from "./schema.ts";
import { createTestDatabase, type TestDatabase } from "./testing.ts";

let t: TestDatabase;
const CFG = "cfg_test";
const M = 1_000_000n; // 1 CAD en micro-unités

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

async function newOrg(): Promise<string> {
  const id = `org_${randomBytes(6).toString("hex")}`;
  await t.db.insert(organizations).values({ id, name: id, slug: id });
  return id;
}

async function fund(
  orgId: string,
  cad: bigint,
  key = randomBytes(6).toString("hex"),
) {
  return credit(t.db, {
    organizationId: orgId,
    amountMicro: cad * M,
    idempotencyKey: `fund:${key}`,
    configVersion: CFG,
    source: "purchase",
  });
}

describe("crédit", () => {
  it("crédite le solde et enregistre la version de configuration", async () => {
    const org = await newOrg();
    const { entry, replayed } = await fund(org, 25n);
    expect(replayed).toBe(false);
    expect(entry).toMatchObject({
      kind: "credit",
      balanceDeltaMicro: 25n * M,
      balanceAfterMicro: 25n * M,
      configVersion: CFG,
    });
    const acct = await getAccount(t.db, org);
    expect(acct).toMatchObject({
      balanceMicro: 25n * M,
      heldMicro: 0n,
      availableMicro: 25n * M,
      blocked: false,
    });
  });

  it("est idempotent par clé : un rejeu ne double pas le crédit", async () => {
    const org = await newOrg();
    const a = await fund(org, 10n, "k1");
    const b = await fund(org, 10n, "k1");
    expect(b.replayed).toBe(true);
    expect(b.entry.id).toBe(a.entry.id);
    expect((await getAccount(t.db, org)).balanceMicro).toBe(10n * M);
  });

  it("rejeu concurrent d'une même clé : une seule écriture", async () => {
    const org = await newOrg();
    await Promise.all(Array.from({ length: 10 }, () => fund(org, 5n, "same")));
    expect((await getAccount(t.db, org)).balanceMicro).toBe(5n * M);
    expect(await listEntries(t.db, org)).toHaveLength(1);
  });

  it("refuse une clé réutilisée avec un autre montant (conflit d'idempotence)", async () => {
    const org = await newOrg();
    await fund(org, 10n, "k2");
    await expect(fund(org, 11n, "k2")).rejects.toMatchObject({
      code: "idempotency_conflict",
    });
  });

  it("refuse un montant nul, négatif ou non entier", async () => {
    const org = await newOrg();
    for (const amount of [0n, -5n]) {
      await expect(
        credit(t.db, {
          organizationId: org,
          amountMicro: amount,
          idempotencyKey: `bad:${amount}`,
          configVersion: CFG,
          source: "purchase",
        }),
      ).rejects.toBeInstanceOf(LedgerError);
    }
  });
});

describe("réservation, règlement, libération", () => {
  it("lie une réservation à sa clé créatrice et garde ses compteurs après rotation", async () => {
    const org = await newOrg();
    await fund(org, 2n);
    const [keyA] = await t.db
      .insert(apiKeys)
      .values({
        organizationId: org,
        name: "Creative A",
        prefix: "nxk_a",
        keyHash: randomBytes(32).toString("hex"),
        spendCapMicro: 2n * M,
      })
      .returning({ id: apiKeys.id });
    const [keyB] = await t.db
      .insert(apiKeys)
      .values({
        organizationId: org,
        name: "Creative B",
        prefix: "nxk_b",
        keyHash: randomBytes(32).toString("hex"),
      })
      .returning({ id: apiKeys.id });
    if (!keyA || !keyB) throw new Error("clés API attendues");

    const r = await reserve(t.db, {
      organizationId: org,
      apiKeyId: keyA.id,
      amountMicro: M,
      idempotencyKey: "creative:key-bound",
      configVersion: CFG,
    });
    if (r.status !== "reserved") throw new Error("réservation attendue");

    const replay = await reserve(t.db, {
      organizationId: org,
      apiKeyId: keyA.id,
      amountMicro: M,
      idempotencyKey: "creative:key-bound",
      configVersion: CFG,
    });
    expect(replay).toMatchObject({
      status: "replayed",
      reservation: { id: r.reservation.id },
    });

    await expect(
      reserve(t.db, {
        organizationId: org,
        apiKeyId: keyB.id,
        amountMicro: M,
        idempotencyKey: "creative:key-bound",
        configVersion: CFG,
      }),
    ).rejects.toMatchObject({ code: "idempotency_conflict" });
    expect((await getAccount(t.db, org)).heldMicro).toBe(M);

    const settled = await settleReservation(t.db, {
      organizationId: org,
      reservationId: r.reservation.id,
      actualMicro: 50_000n,
    });
    expect(settled.chargedMicro).toBe(50_000n);
    expect((await getAccount(t.db, org)).heldMicro).toBe(0n);

    const second = await reserve(t.db, {
      organizationId: org,
      apiKeyId: keyA.id,
      amountMicro: M,
      idempotencyKey: "creative:key-bound-release",
      configVersion: CFG,
    });
    if (second.status !== "reserved") throw new Error("seconde réservation attendue");
    await releaseReservation(t.db, {
      organizationId: org,
      reservationId: second.reservation.id,
    });
    const [spentA] = await t.db
      .select({ spentMicro: apiKeys.spentMicro })
      .from(apiKeys)
      .where(eq(apiKeys.id, keyA.id));
    const [spentB] = await t.db
      .select({ spentMicro: apiKeys.spentMicro })
      .from(apiKeys)
      .where(eq(apiKeys.id, keyB.id));
    expect(spentA?.spentMicro).toBe(50_000n);
    expect(spentB?.spentMicro).toBe(0n);
  });

  it("réserve, puis règle au coût réel et libère le surplus", async () => {
    const org = await newOrg();
    await fund(org, 10n);
    const r = await reserve(t.db, {
      organizationId: org,
      amountMicro: 4n * M,
      idempotencyKey: "req:1",
      configVersion: CFG,
    });
    expect(r.status).toBe("reserved");
    if (r.status !== "reserved") return;
    expect(await getAccount(t.db, org)).toMatchObject({
      balanceMicro: 10n * M,
      heldMicro: 4n * M,
      availableMicro: 6n * M,
    });
    const settled = await settleReservation(t.db, {
      organizationId: org,
      reservationId: r.reservation.id,
      actualMicro: 1_250_000n,
    });
    expect(settled.entry).toMatchObject({
      kind: "settle",
      balanceDeltaMicro: -1_250_000n,
      heldDeltaMicro: -4n * M,
    });
    expect(await getAccount(t.db, org)).toMatchObject({
      balanceMicro: 10n * M - 1_250_000n,
      heldMicro: 0n,
    });
  });

  it("rejouer la même clé de réservation renvoie la même réservation sans rien retenir de plus", async () => {
    const org = await newOrg();
    await fund(org, 10n);
    const input = {
      organizationId: org,
      amountMicro: 3n * M,
      idempotencyKey: "req:same",
      configVersion: CFG,
    };
    const a = await reserve(t.db, input);
    const b = await reserve(t.db, input);
    expect(a.status).toBe("reserved");
    expect(b.status).toBe("replayed");
    expect((await getAccount(t.db, org)).heldMicro).toBe(3n * M);
  });

  it("refuse une réservation supérieure au solde disponible, sans écrire", async () => {
    const org = await newOrg();
    await fund(org, 2n);
    const r = await reserve(t.db, {
      organizationId: org,
      amountMicro: 3n * M,
      idempotencyKey: "req:big",
      configVersion: CFG,
    });
    expect(r.status).toBe("insufficient_funds");
    expect(await listEntries(t.db, org)).toHaveLength(1);
  });

  it("20 réservations concurrentes de 1 CAD sur 10 CAD : exactement 10 réussissent, jamais de dépassement", async () => {
    const org = await newOrg();
    await fund(org, 10n);
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        reserve(t.db, {
          organizationId: org,
          amountMicro: M,
          idempotencyKey: `req:conc:${i}`,
          configVersion: CFG,
        }),
      ),
    );
    expect(results.filter((r) => r.status === "reserved")).toHaveLength(10);
    expect(
      results.filter((r) => r.status === "insufficient_funds"),
    ).toHaveLength(10);
    const acct = await getAccount(t.db, org);
    expect(acct.heldMicro).toBe(10n * M);
    expect(acct.availableMicro).toBe(0n);
    expect(acct.availableMicro >= 0n).toBe(true);
  });

  it("20 réservations concurrentes de montants inégaux : le total retenu ne dépasse jamais le solde", async () => {
    const org = await newOrg();
    await fund(org, 7n);
    const amounts = Array.from({ length: 20 }, (_, i) =>
      BigInt(300_000 + i * 70_001),
    );
    const results = await Promise.all(
      amounts.map((amountMicro, i) =>
        reserve(t.db, {
          organizationId: org,
          amountMicro,
          idempotencyKey: `req:uneven:${i}`,
          configVersion: CFG,
        }),
      ),
    );
    const held = results.reduce(
      (s, r, i) => (r.status === "reserved" ? s + (amounts[i] as bigint) : s),
      0n,
    );
    expect(held <= 7n * M).toBe(true);
    expect((await getAccount(t.db, org)).heldMicro).toBe(held);
  });

  it("libère une réservation : le disponible est restitué ; libérer deux fois est sans effet", async () => {
    const org = await newOrg();
    await fund(org, 5n);
    const r = await reserve(t.db, {
      organizationId: org,
      amountMicro: 2n * M,
      idempotencyKey: "req:rel",
      configVersion: CFG,
    });
    if (r.status !== "reserved") throw new Error("réservation attendue");
    await releaseReservation(t.db, {
      organizationId: org,
      reservationId: r.reservation.id,
    });
    const again = await releaseReservation(t.db, {
      organizationId: org,
      reservationId: r.reservation.id,
    });
    expect(again.replayed).toBe(true);
    expect(await getAccount(t.db, org)).toMatchObject({
      heldMicro: 0n,
      availableMicro: 5n * M,
    });
  });

  it("règle une seule fois : un second règlement renvoie le premier, libérer une réservation réglée est refusé", async () => {
    const org = await newOrg();
    await fund(org, 5n);
    const r = await reserve(t.db, {
      organizationId: org,
      amountMicro: 2n * M,
      idempotencyKey: "req:once",
      configVersion: CFG,
    });
    if (r.status !== "reserved") throw new Error("réservation attendue");
    const first = await settleReservation(t.db, {
      organizationId: org,
      reservationId: r.reservation.id,
      actualMicro: 500_000n,
    });
    const second = await settleReservation(t.db, {
      organizationId: org,
      reservationId: r.reservation.id,
      actualMicro: 500_000n,
    });
    expect(second.replayed).toBe(true);
    expect(second.entry.id).toBe(first.entry.id);
    expect((await getAccount(t.db, org)).balanceMicro).toBe(5n * M - 500_000n);
    await expect(
      releaseReservation(t.db, {
        organizationId: org,
        reservationId: r.reservation.id,
      }),
    ).rejects.toMatchObject({ code: "reservation_closed" });
  });

  it("règle au coût RÉEL : le dépassement est un débit supplémentaire, le solde devient négatif et bloque l'API", async () => {
    const org = await newOrg();
    await fund(org, 1n);
    const r = await reserve(t.db, {
      organizationId: org,
      amountMicro: 600_000n,
      idempotencyKey: "req:over",
      configVersion: CFG,
    });
    if (r.status !== "reserved") throw new Error("réservation attendue");
    const s = await settleReservation(t.db, {
      organizationId: org,
      reservationId: r.reservation.id,
      actualMicro: 1_400_000n,
    });
    expect(s.chargedMicro).toBe(1_400_000n);
    expect(s.entry).toMatchObject({
      kind: "settle",
      balanceDeltaMicro: -600_000n,
      heldDeltaMicro: -600_000n,
    });
    expect(s.overageEntry).toMatchObject({
      kind: "overage",
      balanceDeltaMicro: -800_000n,
      heldDeltaMicro: 0n,
      idempotencyKey: `overage:${r.reservation.id}`,
    });
    expect(await getAccount(t.db, org)).toMatchObject({
      balanceMicro: -400_000n,
      heldMicro: 0n,
      blocked: true,
    });
    const next = await reserve(t.db, {
      organizationId: org,
      amountMicro: 1n,
      idempotencyKey: "req:after-over",
      configVersion: CFG,
    });
    expect(next.status).toBe("blocked");
    const derived = await deriveBalance(t.db, org);
    expect(derived.balanceMicro).toBe(-400_000n);
  });

  it("le règlement au réel est idempotent : un rejeu (même concurrent) ne débite pas deux fois", async () => {
    const org = await newOrg();
    await fund(org, 2n);
    const r = await reserve(t.db, {
      organizationId: org,
      amountMicro: 500_000n,
      idempotencyKey: "req:over-replay",
      configVersion: CFG,
    });
    if (r.status !== "reserved") throw new Error("réservation attendue");
    const input = {
      organizationId: org,
      reservationId: r.reservation.id,
      actualMicro: 1_500_000n,
    };
    const outs = await Promise.all([
      settleReservation(t.db, input),
      settleReservation(t.db, input),
      settleReservation(t.db, input),
    ]);
    expect(outs.filter((o) => !o.replayed)).toHaveLength(1);
    for (const o of outs) expect(o.chargedMicro).toBe(1_500_000n);
    expect(outs.every((o) => o.overageEntry !== null)).toBe(true);
    expect((await getAccount(t.db, org)).balanceMicro).toBe(500_000n);
    const entries = (await listEntries(t.db, org)).filter(
      (e) => e.kind === "settle" || e.kind === "overage",
    );
    expect(entries).toHaveLength(2);
  });

  it("un règlement qui arrive APRÈS la libération de la réservation est facturé au réel, une seule fois", async () => {
    const org = await newOrg();
    await fund(org, 2n);
    const r = await reserve(t.db, {
      organizationId: org,
      amountMicro: 600_000n,
      idempotencyKey: "req:late",
      configVersion: CFG,
    });
    if (r.status !== "reserved") throw new Error("réservation attendue");
    await releaseReservation(t.db, {
      organizationId: org,
      reservationId: r.reservation.id,
    });
    const input = {
      organizationId: org,
      reservationId: r.reservation.id,
      actualMicro: 250_000n,
    };
    const late = await settleReservation(t.db, input);
    expect(late.replayed).toBe(false);
    expect(late.chargedMicro).toBe(250_000n);
    expect(late.entry).toMatchObject({
      kind: "overage",
      balanceDeltaMicro: -250_000n,
      heldDeltaMicro: 0n,
    });
    const again = await settleReservation(t.db, input);
    expect(again.replayed).toBe(true);
    expect(again.chargedMicro).toBe(250_000n);
    expect(await getAccount(t.db, org)).toMatchObject({
      balanceMicro: 2n * M - 250_000n,
      heldMicro: 0n,
    });
  });

  it("mémorise un règlement nul après libération sans créer de débit", async () => {
    const org = await newOrg();
    await fund(org, 1n);
    const r = await reserve(t.db, {
      organizationId: org,
      amountMicro: 100n,
      idempotencyKey: "req:late-zero",
      configVersion: CFG,
    });
    if (r.status !== "reserved") throw new Error("réservation attendue");
    await releaseReservation(t.db, {
      organizationId: org,
      reservationId: r.reservation.id,
    });
    const out = await settleReservation(t.db, {
      organizationId: org,
      reservationId: r.reservation.id,
      actualMicro: 0n,
    });
    expect(out.replayed).toBe(false);
    expect(out.chargedMicro).toBe(0n);
    const [row] = await t.db
      .select({ settledMicro: creditReservations.settledMicro })
      .from(creditReservations)
      .where(eq(creditReservations.id, r.reservation.id));
    expect(row?.settledMicro).toBe(0n);

    const changedReplay = await settleReservation(t.db, {
      organizationId: org,
      reservationId: r.reservation.id,
      actualMicro: 250n,
    });
    expect(changedReplay.replayed).toBe(true);
    expect(changedReplay.chargedMicro).toBe(0n);
    expect(
      (await listEntries(t.db, org)).some(
        (entry) => entry.kind === "overage" && entry.reservationId === r.reservation.id,
      ),
    ).toBe(false);
    expect((await getAccount(t.db, org)).balanceMicro).toBe(M);
  });

  it("une organisation ne peut pas régler ni libérer la réservation d'une autre", async () => {
    const a = await newOrg();
    const b = await newOrg();
    await fund(a, 5n);
    const r = await reserve(t.db, {
      organizationId: a,
      amountMicro: M,
      idempotencyKey: "req:cross",
      configVersion: CFG,
    });
    if (r.status !== "reserved") throw new Error("réservation attendue");
    await expect(
      settleReservation(t.db, {
        organizationId: b,
        reservationId: r.reservation.id,
        actualMicro: 1n,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("libère les réservations ouvertes depuis trop longtemps (requête perdue)", async () => {
    const org = await newOrg();
    await fund(org, 5n);
    await reserve(t.db, {
      organizationId: org,
      amountMicro: 2n * M,
      idempotencyKey: "req:stale",
      configVersion: CFG,
    });
    const future = new Date(Date.now() + 3_600_000);
    const n = await releaseStaleReservations(t.db, {
      olderThan: new Date(future.getTime() - 600_000),
    });
    expect(n).toBeGreaterThanOrEqual(1);
    expect((await getAccount(t.db, org)).heldMicro).toBe(0n);
  });
});

describe("libération périodique des réservations perdues", () => {
  const ago = (ms: number) => new Date(Date.now() - ms);
  async function reserveAt(
    org: string,
    key: string,
    amount: bigint,
    createdAt: Date,
  ) {
    const r = await reserve(t.db, {
      organizationId: org,
      amountMicro: amount,
      idempotencyKey: key,
      configVersion: CFG,
    });
    if (r.status !== "reserved") throw new Error("réservation attendue");
    await t.db
      .update(creditReservations)
      .set({ createdAt })
      .where(eq(creditReservations.id, r.reservation.id));
    return r.reservation.id;
  }

  it("ne touche pas une réservation récente ; libère celle qui dépasse le délai, dont le montant redevient disponible", async () => {
    const org = await newOrg();
    await fund(org, 5n);
    const fresh = await reserveAt(org, "stale:fresh", M, ago(60_000));
    const old = await reserveAt(org, "stale:old", 2n * M, ago(3_600_000));
    expect((await getAccount(t.db, org)).availableMicro).toBe(2n * M);
    const n = await releaseStaleReservations(t.db, {
      olderThan: ago(30 * 60_000),
    });
    expect(n).toBeGreaterThanOrEqual(1);
    expect(await getAccount(t.db, org)).toMatchObject({
      heldMicro: M,
      availableMicro: 4n * M,
    });
    const rows = await t.db
      .select()
      .from(creditReservations)
      .where(eq(creditReservations.organizationId, org));
    expect(rows.find((r) => r.id === fresh)?.status).toBe("open");
    expect(rows.find((r) => r.id === old)?.status).toBe("released");
    // Rejeu : rien de plus à libérer pour cette organisation.
    await releaseStaleReservations(t.db, { olderThan: ago(30 * 60_000) });
    expect((await getAccount(t.db, org)).heldMicro).toBe(M);
  });

  it("rend aussi le plafond de la clé ; le règlement tardif facture ensuite le coût réel sans double compte", async () => {
    const org = await newOrg();
    await fund(org, 5n);
    const [key] = await t.db
      .insert(apiKeys)
      .values({
        organizationId: org,
        name: "k",
        prefix: "nxk_test",
        keyHash: `h_${randomBytes(8).toString("hex")}`,
        spendCapMicro: 3n * M,
      })
      .returning();
    if (!key) throw new Error("clé attendue");
    const r = await reserve(t.db, {
      organizationId: org,
      amountMicro: 2n * M,
      idempotencyKey: "stale:key",
      configVersion: CFG,
      apiKeyId: key.id,
    });
    if (r.status !== "reserved") throw new Error("réservation attendue");
    const spent = async () =>
      (await t.db.select().from(apiKeys).where(eq(apiKeys.id, key.id)))[0]
        ?.spentMicro;
    expect(await spent()).toBe(2n * M);
    await t.db
      .update(creditReservations)
      .set({ createdAt: ago(3_600_000) })
      .where(eq(creditReservations.id, r.reservation.id));
    await releaseStaleReservations(t.db, { olderThan: ago(30 * 60_000) });
    expect(await spent()).toBe(0n);
    const late = await settleReservation(t.db, {
      organizationId: org,
      reservationId: r.reservation.id,
      actualMicro: 700_000n,
    });
    expect(late.chargedMicro).toBe(700_000n);
    expect(await spent()).toBe(700_000n);
    await settleReservation(t.db, {
      organizationId: org,
      reservationId: r.reservation.id,
      actualMicro: 700_000n,
    });
    expect(await spent()).toBe(700_000n);
    expect((await getAccount(t.db, org)).balanceMicro).toBe(5n * M - 700_000n);
  });
});

describe("plafond de dépense de la clé, dans la transaction du grand livre", () => {
  async function newKey(org: string, cap: bigint | null) {
    const [key] = await t.db
      .insert(apiKeys)
      .values({
        organizationId: org,
        name: "k",
        prefix: "nxk_test",
        keyHash: `h_${randomBytes(8).toString("hex")}`,
        spendCapMicro: cap,
      })
      .returning();
    if (!key) throw new Error("clé attendue");
    return key;
  }
  const spentOf = async (id: string) =>
    (await t.db.select().from(apiKeys).where(eq(apiKeys.id, id)))[0]
      ?.spentMicro;

  it("retient le montant sur la clé plafonnée, refuse au-delà du plafond sans rien écrire, rend le surplus au règlement", async () => {
    const org = await newOrg();
    await fund(org, 10n);
    const key = await newKey(org, 3n * M);
    const a = await reserve(t.db, {
      organizationId: org,
      amountMicro: 2n * M,
      idempotencyKey: "cap:a",
      configVersion: CFG,
      apiKeyId: key.id,
    });
    expect(a.status).toBe("reserved");
    expect(await spentOf(key.id)).toBe(2n * M);
    const b = await reserve(t.db, {
      organizationId: org,
      amountMicro: 2n * M,
      idempotencyKey: "cap:b",
      configVersion: CFG,
      apiKeyId: key.id,
    });
    expect(b.status).toBe("key_cap_exceeded");
    expect((await getAccount(t.db, org)).heldMicro).toBe(2n * M); // rien d'écrit pour b
    if (a.status !== "reserved") return;
    await settleReservation(t.db, {
      organizationId: org,
      reservationId: a.reservation.id,
      actualMicro: 500_000n,
    });
    expect(await spentOf(key.id)).toBe(500_000n);
  });

  it("une clé sans plafond cumule seulement le coût réglé, y compris le dépassement", async () => {
    const org = await newOrg();
    await fund(org, 10n);
    const key = await newKey(org, null);
    const a = await reserve(t.db, {
      organizationId: org,
      amountMicro: 100_000n,
      idempotencyKey: "nocap:a",
      configVersion: CFG,
      apiKeyId: key.id,
    });
    if (a.status !== "reserved") throw new Error("réservation attendue");
    expect(await spentOf(key.id)).toBe(0n);
    await settleReservation(t.db, {
      organizationId: org,
      reservationId: a.reservation.id,
      actualMicro: 900_000n,
    });
    expect(await spentOf(key.id)).toBe(900_000n);
  });

  it("le dépassement de réservation s'ajoute à la dépense de la clé plafonnée (réel, pas réservé)", async () => {
    const org = await newOrg();
    await fund(org, 10n);
    const key = await newKey(org, 3n * M);
    const a = await reserve(t.db, {
      organizationId: org,
      amountMicro: 100_000n,
      idempotencyKey: "cap:over",
      configVersion: CFG,
      apiKeyId: key.id,
    });
    if (a.status !== "reserved") throw new Error("réservation attendue");
    await settleReservation(t.db, {
      organizationId: org,
      reservationId: a.reservation.id,
      actualMicro: 2n * M,
    });
    expect(await spentOf(key.id)).toBe(2n * M);
  });

  it("refuse la clé d'une autre organisation", async () => {
    const a = await newOrg();
    const b = await newOrg();
    await fund(a, 1n);
    const key = await newKey(b, null);
    await expect(
      reserve(t.db, {
        organizationId: a,
        amountMicro: 10n,
        idempotencyKey: "cap:cross",
        configVersion: CFG,
        apiKeyId: key.id,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("remboursements et litiges : le solde peut devenir négatif et bloque", () => {
  it("un remboursement supérieur au solde rend le compte négatif et bloqué ; plus aucune réservation", async () => {
    const org = await newOrg();
    await fund(org, 10n);
    // 8 CAD dépensés
    const r = await reserve(t.db, {
      organizationId: org,
      amountMicro: 8n * M,
      idempotencyKey: "req:spend",
      configVersion: CFG,
    });
    if (r.status !== "reserved") throw new Error("réservation attendue");
    await settleReservation(t.db, {
      organizationId: org,
      reservationId: r.reservation.id,
      actualMicro: 8n * M,
    });
    const d = await debit(t.db, {
      organizationId: org,
      kind: "refund",
      amountMicro: 10n * M,
      idempotencyKey: "refund:ch_1:1000",
      configVersion: CFG,
      source: "stripe_refund",
    });
    expect(d.entry.balanceAfterMicro).toBe(-8n * M);
    expect(await getAccount(t.db, org)).toMatchObject({
      balanceMicro: -8n * M,
      blocked: true,
    });
    const blocked = await reserve(t.db, {
      organizationId: org,
      amountMicro: 1n,
      idempotencyKey: "req:blocked",
      configVersion: CFG,
    });
    expect(blocked.status).toBe("blocked");
    // Un nouveau crédit qui ramène le solde au-dessus de zéro débloque.
    await fund(org, 20n);
    expect((await getAccount(t.db, org)).blocked).toBe(false);
  });

  it("le débit est idempotent par clé", async () => {
    const org = await newOrg();
    await fund(org, 10n);
    const input = {
      organizationId: org,
      kind: "dispute" as const,
      amountMicro: 3n * M,
      idempotencyKey: "dispute:dp_1",
      configVersion: CFG,
      source: "stripe_dispute",
    };
    await debit(t.db, input);
    const again = await debit(t.db, input);
    expect(again.replayed).toBe(true);
    expect((await getAccount(t.db, org)).balanceMicro).toBe(7n * M);
  });

  it("n'accepte que les types refund et dispute", async () => {
    const org = await newOrg();
    await expect(
      debit(t.db, {
        organizationId: org,
        // @ts-expect-error type interdit
        kind: "credit",
        amountMicro: M,
        idempotencyKey: "x",
        configVersion: CFG,
        source: "x",
      }),
    ).rejects.toBeInstanceOf(LedgerError);
  });
});

describe("expiration à 12 mois", () => {
  const day = 86_400_000;
  const T0 = new Date("2026-01-01T00:00:00Z");
  const expiryOf = (months: number) =>
    new Date(T0.getTime() + months * 30 * day);

  async function lot(
    org: string,
    cad: bigint,
    expiresAt: Date | null,
    key: string,
  ) {
    return credit(t.db, {
      organizationId: org,
      amountMicro: cad * M,
      idempotencyKey: `lot:${key}`,
      configVersion: CFG,
      source: "purchase",
      expiresAt,
    });
  }

  it("expire la part non consommée d'un lot échu, une seule fois", async () => {
    const org = await newOrg();
    await lot(org, 10n, expiryOf(12), "a");
    const r = await reserve(t.db, {
      organizationId: org,
      amountMicro: 3n * M,
      idempotencyKey: "req:e1",
      configVersion: CFG,
    });
    if (r.status !== "reserved") throw new Error("réservation attendue");
    await settleReservation(t.db, {
      organizationId: org,
      reservationId: r.reservation.id,
      actualMicro: 3n * M,
    });
    const before = await expireDue(t.db, {
      organizationId: org,
      now: expiryOf(11),
      configVersion: CFG,
    });
    expect(before.expiredMicro).toBe(0n);
    const res = await expireDue(t.db, {
      organizationId: org,
      now: expiryOf(13),
      configVersion: CFG,
    });
    expect(res.expiredMicro).toBe(7n * M);
    expect((await getAccount(t.db, org)).balanceMicro).toBe(0n);
    const again = await expireDue(t.db, {
      organizationId: org,
      now: expiryOf(14),
      configVersion: CFG,
    });
    expect(again.expiredMicro).toBe(0n);
  });

  it("attribue la consommation au lot qui expire en premier (premier échu, premier consommé)", async () => {
    const org = await newOrg();
    await lot(org, 10n, expiryOf(6), "early");
    await lot(org, 10n, expiryOf(12), "late");
    const r = await reserve(t.db, {
      organizationId: org,
      amountMicro: 4n * M,
      idempotencyKey: "req:e2",
      configVersion: CFG,
    });
    if (r.status !== "reserved") throw new Error("réservation attendue");
    await settleReservation(t.db, {
      organizationId: org,
      reservationId: r.reservation.id,
      actualMicro: 4n * M,
    });
    // Le premier lot a servi pour 4 : il reste 6 à expirer à 6 mois, rien à 12 mois avant son échéance.
    const res = await expireDue(t.db, {
      organizationId: org,
      now: expiryOf(7),
      configVersion: CFG,
    });
    expect(res.expiredMicro).toBe(6n * M);
    expect((await getAccount(t.db, org)).balanceMicro).toBe(10n * M);
  });

  it("n'expire jamais ce qui est réservé et ne laisse jamais le disponible négatif", async () => {
    const org = await newOrg();
    await lot(org, 10n, expiryOf(12), "held");
    await reserve(t.db, {
      organizationId: org,
      amountMicro: 6n * M,
      idempotencyKey: "req:e3",
      configVersion: CFG,
    });
    const res = await expireDue(t.db, {
      organizationId: org,
      now: expiryOf(13),
      configVersion: CFG,
    });
    expect(res.expiredMicro).toBe(4n * M);
    const acct = await getAccount(t.db, org);
    expect(acct.availableMicro).toBe(0n);
    expect(acct.balanceMicro).toBe(6n * M);
  });

  it("expireAllDue expire toutes les organisations concernées, une seule fois, sans toucher les autres", async () => {
    const a = await newOrg();
    const b = await newOrg();
    const c = await newOrg();
    await lot(a, 4n, expiryOf(12), "all:a");
    await lot(b, 3n, expiryOf(12), "all:b");
    await lot(c, 2n, new Date(T0.getTime() + 400 * day * 10), "all:c"); // loin dans le futur
    const now = new Date(expiryOf(12).getTime() + day);
    const first = await expireAllDue(t.db, { now, configVersion: CFG });
    expect(first.expiredMicro).toBeGreaterThanOrEqual(7n * M);
    expect((await getAccount(t.db, a)).balanceMicro).toBe(0n);
    expect((await getAccount(t.db, b)).balanceMicro).toBe(0n);
    expect((await getAccount(t.db, c)).balanceMicro).toBe(2n * M);
    const second = await expireAllDue(t.db, { now, configVersion: CFG });
    expect(second.expiredMicro).toBe(0n);
  });

  it("ignore les crédits sans échéance", async () => {
    const org = await newOrg();
    await lot(org, 5n, null, "forever");
    const res = await expireDue(t.db, {
      organizationId: org,
      now: expiryOf(60),
      configVersion: CFG,
    });
    expect(res.expiredMicro).toBe(0n);
  });
});

describe("immutabilité et dérivation", () => {
  it("le solde en cache égale toujours la somme des écritures", async () => {
    const org = await newOrg();
    await fund(org, 12n);
    const r = await reserve(t.db, {
      organizationId: org,
      amountMicro: 5n * M,
      idempotencyKey: "req:d1",
      configVersion: CFG,
    });
    if (r.status !== "reserved") throw new Error("réservation attendue");
    await settleReservation(t.db, {
      organizationId: org,
      reservationId: r.reservation.id,
      actualMicro: 2n * M,
    });
    await debit(t.db, {
      organizationId: org,
      kind: "refund",
      amountMicro: M,
      idempotencyKey: "refund:d1",
      configVersion: CFG,
      source: "stripe_refund",
    });
    const derived = await deriveBalance(t.db, org);
    const acct = await getAccount(t.db, org);
    expect(derived).toEqual({
      balanceMicro: acct.balanceMicro,
      heldMicro: acct.heldMicro,
    });
    expect(derived.balanceMicro).toBe(9n * M);
  });

  it("refuse toute modification, suppression ou vidage d'une écriture", async () => {
    const org = await newOrg();
    await fund(org, 3n);
    await expect(
      t.sql`UPDATE credit_entries SET balance_delta_micro = 1 WHERE organization_id = ${org}`,
    ).rejects.toThrow(/immuable/);
    await expect(
      t.sql`DELETE FROM credit_entries WHERE organization_id = ${org}`,
    ).rejects.toThrow(/immuable/);
    await expect(t.sql`TRUNCATE credit_entries`).rejects.toThrow(/immuable/);
  });

  it("la base refuse un solde disponible négatif causé par une réservation, même en contournant le code", async () => {
    const org = await newOrg();
    await fund(org, 1n);
    await expect(
      t.db.insert(creditEntries).values({
        organizationId: org,
        kind: "reserve",
        balanceDeltaMicro: 0n,
        heldDeltaMicro: 2n * M,
        balanceAfterMicro: M,
        heldAfterMicro: 2n * M,
        idempotencyKey: "raw:overdraft",
        configVersion: CFG,
        source: "usage",
      }),
    ).rejects.toThrow();
  });

  it("n'utilise que des entiers : les montants conservent leur précision au-delà de 2^53", async () => {
    const org = await newOrg();
    const big = 9_007_199_254_740_993n; // 2^53 + 1
    await credit(t.db, {
      organizationId: org,
      amountMicro: big,
      idempotencyKey: "big",
      configVersion: CFG,
      source: "purchase",
    });
    expect((await getAccount(t.db, org)).balanceMicro).toBe(big);
  });
});
