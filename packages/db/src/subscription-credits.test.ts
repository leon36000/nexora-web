import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAccount, listEntries } from "./ledger.ts";
import {
  organizations,
  subscriptionCreditGrants,
  subscriptionCreditTranches,
  subscriptions,
} from "./schema.ts";
import {
  addMonthsUtc,
  createAnnualTranches,
  grantDueTranches,
  grantedMicro,
  grantFirstTranche,
  holdPendingTranches,
  reducedMicro,
  reduceUnpaidTranches,
  releaseHeldTranches,
  settleLostDispute,
  splitCredits,
} from "./subscription-credits.ts";
import { createTestDatabase, type TestDatabase } from "./testing.ts";

let t: TestDatabase;
const CFG = "cfg_test";
const M = 1_000_000n;
const START = new Date("2026-01-31T10:00:00Z");

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

/** Organisation, abonnement annuel payé (facture) et ses douze tranches ; la première est versée. */
async function annual(
  total = 1200n * M,
  status: "active" | "canceled" | "unpaid" = "active",
) {
  const org = `org_${randomBytes(6).toString("hex")}`;
  const sub = `sub_${randomBytes(6).toString("hex")}`;
  const invoice = `in_${randomBytes(6).toString("hex")}`;
  await t.db.insert(organizations).values({ id: org, name: org, slug: org });
  await t.db.insert(subscriptions).values({
    organizationId: org,
    stripeSubscriptionId: sub,
    stripeCustomerId: "cus_x",
    status,
  });
  const [grant] = await t.db
    .insert(subscriptionCreditGrants)
    .values({
      organizationId: org,
      stripeInvoiceId: invoice,
      stripeSubscriptionId: sub,
      amountPaidCents: 100_000,
      creditsMicro: total,
      configVersion: CFG,
    })
    .returning();
  if (!grant) throw new Error("octroi");
  await createAnnualTranches(t.db, {
    grantId: grant.id,
    organizationId: org,
    stripeInvoiceId: invoice,
    stripeSubscriptionId: sub,
    totalMicro: total,
    periodStart: START,
  });
  await grantFirstTranche(t.db, {
    grantId: grant.id,
    configVersion: CFG,
    now: START,
  });
  return { org, sub, invoice, grant };
}

const tranches = (grantId: string) =>
  t.db
    .select()
    .from(subscriptionCreditTranches)
    .where(eq(subscriptionCreditTranches.grantId, grantId))
    .orderBy(subscriptionCreditTranches.seq);

describe("découpage en douzièmes", () => {
  it("la somme des douze montants est exacte, le reste va aux premiers mois", () => {
    const parts = splitCredits(1_000_000_007n);
    expect(parts).toHaveLength(12);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(1_000_000_007n);
    expect((parts[0] as bigint) - (parts[11] as bigint)).toBe(1n);
    expect(splitCredits(1200n * M).every((p) => p === 100n * M)).toBe(true);
    expect(() => splitCredits(0n)).toThrow();
  });

  it("les échéances suivent les mois civils depuis le début de la période, sans dérive (31 janvier)", () => {
    expect(addMonthsUtc(START, 1).toISOString()).toBe(
      "2026-02-28T10:00:00.000Z",
    );
    expect(addMonthsUtc(START, 2).toISOString()).toBe(
      "2026-03-31T10:00:00.000Z",
    );
    expect(addMonthsUtc(START, 12).toISOString()).toBe(
      "2027-01-31T10:00:00.000Z",
    );
  });
});

describe("offre annuelle : un douzième par mois", () => {
  it("verse seulement le premier douzième au paiement, valable jusqu'au mois suivant", async () => {
    const { org, grant } = await annual();
    const acct = await getAccount(t.db, org);
    expect(acct.balanceMicro).toBe(100n * M); // 1 200 $ / 12, pas 1 200 $
    const rows = await tranches(grant.id);
    expect(rows).toHaveLength(12);
    expect(rows.filter((r) => r.status === "granted")).toHaveLength(1);
    const [entry] = await listEntries(t.db, org);
    expect(entry?.expiresAt?.toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(entry?.purchaseId).toBe(grant.id);
  });

  it("le worker verse chaque tranche à son échéance, une fois, et le total de l'année est exact", async () => {
    const { org, grant } = await annual(1_000_000_007n);
    await grantDueTranches(t.db, { now: new Date("2026-03-31T10:00:00Z") });
    // Janvier (au paiement), février et mars sont versés ; rien d'autre.
    expect(
      (await tranches(grant.id)).filter((r) => r.status === "granted"),
    ).toHaveLength(3);
    const afterMarch = (await getAccount(t.db, org)).balanceMicro;
    // Rejouer à la même heure ne verse rien de plus.
    await grantDueTranches(t.db, { now: new Date("2026-03-31T10:00:00Z") });
    expect((await getAccount(t.db, org)).balanceMicro).toBe(afterMarch);
    await grantDueTranches(t.db, { now: new Date("2027-01-01T00:00:00Z") });
    const rows = await tranches(grant.id);
    expect(rows.every((r) => r.status === "granted")).toBe(true);
    const total = rows.reduce((a, r) => a + r.originalMicro, 0n);
    expect(total).toBe(1_000_000_007n);
    expect((await getAccount(t.db, org)).balanceMicro).toBe(1_000_000_007n);
    expect(await grantedMicro(t.db, grant.id)).toBe(1_000_000_007n);
  });

  it("chaque tranche expire à la fin de son mois : le mois suivant, il ne reste que le nouveau douzième", async () => {
    const { org } = await annual();
    await grantDueTranches(t.db, { now: new Date("2026-02-28T10:00:00Z") });
    const entries = (await listEntries(t.db, org)).filter(
      (e) => e.kind === "credit",
    );
    const expiries = entries.map((e) => e.expiresAt?.toISOString()).sort();
    expect(expiries).toEqual([
      "2026-02-28T10:00:00.000Z",
      "2026-03-31T10:00:00.000Z",
    ]);
  });

  it("un abonnement terminé ne reçoit plus rien ; un abonnement impayé attend puis reprend", async () => {
    const ended = await annual(1200n * M, "canceled");
    const unpaid = await annual(1200n * M, "unpaid");
    const out = await grantDueTranches(t.db, {
      now: new Date("2026-06-30T00:00:00Z"),
    });
    expect(out.canceled).toBeGreaterThan(0);
    expect(out.waiting).toBeGreaterThan(0);
    expect((await getAccount(t.db, ended.org)).balanceMicro).toBe(100n * M);
    // Février à mai : 4 tranches échues, toutes annulées (abonnement terminé) ; les suivantes restent à venir.
    const endedRows = await tranches(ended.grant.id);
    expect(
      endedRows.filter((r) => r.cancelReason === "subscription_ended"),
    ).toHaveLength(4);
    expect((await getAccount(t.db, unpaid.org)).balanceMicro).toBe(100n * M);
    // Le paiement est régularisé : les tranches échues sont versées.
    await t.db
      .update(subscriptions)
      .set({ status: "active" })
      .where(eq(subscriptions.stripeSubscriptionId, unpaid.sub));
    await grantDueTranches(t.db, { now: new Date("2026-06-30T00:00:00Z") });
    expect((await getAccount(t.db, unpaid.org)).balanceMicro).toBeGreaterThan(
      100n * M,
    );
  });

  it("une tranche versée en retard (worker arrêté) vaut au moins 7 jours", async () => {
    const { org } = await annual();
    const late = new Date("2026-09-15T00:00:00Z");
    await grantDueTranches(t.db, { now: late });
    const entries = (await listEntries(t.db, org)).filter(
      (e) =>
        e.kind === "credit" && (e.metadata as { tranche?: number }).tranche,
    );
    expect(entries.length).toBeGreaterThan(5);
    for (const e of entries)
      expect((e.expiresAt as Date).getTime()).toBeGreaterThanOrEqual(
        late.getTime() + 7 * 86_400_000 - 1,
      );
  });
});

describe("remboursement et litige d'une offre annuelle", () => {
  it("un remboursement retire d'abord ce qui n'est pas encore versé, de la fin vers le début", async () => {
    const { grant } = await annual(1200n * M);
    const removed = await reduceUnpaidTranches(t.db, grant.id, 250n * M, START);
    expect(removed).toBe(250n * M);
    const rows = await tranches(grant.id);
    // 11 tranches à venir de 100 $ : les mois 12, 11 sont annulés, le mois 10 est réduit de 50 $.
    expect(rows[11]?.status).toBe("canceled");
    expect(rows[10]?.status).toBe("canceled");
    expect(rows[9]).toMatchObject({ status: "pending", amountMicro: 50n * M });
    expect(await reducedMicro(t.db, grant.id)).toBe(250n * M);
    // Le premier douzième, déjà versé, n'est pas touché ici (c'est le grand livre qui le reprend).
    expect(rows[0]?.status).toBe("granted");
    // Plus que ce qui reste à venir : on ne retire jamais plus.
    expect(await reduceUnpaidTranches(t.db, grant.id, 5000n * M, START)).toBe(
      850n * M,
    );
  });

  it("un litige ouvert suspend les tranches à venir ; gagné, elles reprennent", async () => {
    const { org, grant } = await annual();
    expect(await holdPendingTranches(t.db, grant.id, "dp_1")).toBe(11);
    // Suspendues : le worker ne verse rien.
    await grantDueTranches(t.db, { now: new Date("2027-02-01T00:00:00Z") });
    expect((await getAccount(t.db, org)).balanceMicro).toBe(100n * M);
    expect(await releaseHeldTranches(t.db, "dp_1")).toBe(11);
    await grantDueTranches(t.db, { now: new Date("2027-02-01T00:00:00Z") });
    expect((await getAccount(t.db, org)).balanceMicro).toBe(1200n * M);
  });

  it("un litige perdu retire des tranches suspendues le montant que le grand livre n'a pas repris, et libère le reste", async () => {
    const { org, grant } = await annual();
    await holdPendingTranches(t.db, grant.id, "dp_2");
    const reduced = await settleLostDispute(
      t.db,
      grant.id,
      "dp_2",
      300n * M,
      START,
    );
    expect(reduced).toBe(300n * M);
    await grantDueTranches(t.db, { now: new Date("2027-02-01T00:00:00Z") });
    // 1 200 $ − 300 $ retirés des tranches à venir = 900 $ versés au total.
    expect((await getAccount(t.db, org)).balanceMicro).toBe(900n * M);
  });
});
