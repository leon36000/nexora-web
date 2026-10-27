import { randomBytes } from "node:crypto";
import {
  billingCustomers,
  credit,
  debit,
  organizations,
  reserve,
  subscriptions,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDashboard } from "./dashboard";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

async function org(name: string) {
  const id = `o_${randomBytes(5).toString("hex")}`;
  await t.db.insert(organizations).values({ id, name, slug: id });
  return id;
}

describe("tableau de bord de facturation", () => {
  it("renvoie solde, historique et abonnements de l'organisation demandée seulement", async () => {
    const a = await org("Alpha");
    const b = await org("Bravo");
    await credit(t.db, {
      organizationId: a,
      amountMicro: 25_000_000n,
      idempotencyKey: "a1",
      configVersion: "c",
      source: "purchase",
    });
    await credit(t.db, {
      organizationId: b,
      amountMicro: 99_000_000n,
      idempotencyKey: "b1",
      configVersion: "c",
      source: "purchase",
    });
    await t.db.insert(subscriptions).values({
      organizationId: b,
      stripeSubscriptionId: "sub_b",
      stripeCustomerId: "cus_b",
      status: "active",
      planCode: "secret-b",
    });
    const data = await loadDashboard(t.db, a);
    expect(data.organization).toEqual({ id: a, name: "Alpha" });
    expect(data.account.balanceMicro).toBe(25_000_000n);
    expect(data.entries).toHaveLength(1);
    expect(
      JSON.stringify(data, (_k, v) =>
        typeof v === "bigint" ? v.toString() : v,
      ),
    ).not.toContain("secret-b");
    expect(data.subscriptions).toEqual([]);
    expect(data.hasStripeCustomer).toBe(false);
  });

  it("masque les écritures internes de réservation et trie du plus récent au plus ancien", async () => {
    const a = await org("Charlie");
    await credit(t.db, {
      organizationId: a,
      amountMicro: 10_000_000n,
      idempotencyKey: "c1",
      configVersion: "c",
      source: "purchase",
    });
    await reserve(t.db, {
      organizationId: a,
      amountMicro: 1_000_000n,
      idempotencyKey: "r-c1",
      configVersion: "c",
    });
    await debit(t.db, {
      organizationId: a,
      kind: "refund",
      amountMicro: 2_000_000n,
      idempotencyKey: "d1",
      configVersion: "c",
      source: "stripe_refund",
    });
    const data = await loadDashboard(t.db, a);
    expect(data.entries.map((e) => e.kind)).toEqual(["refund", "credit"]);
    expect(data.entries[0]?.amountMicro).toBe(-2_000_000n);
    expect(data.account.heldMicro).toBe(1_000_000n);
  });

  it("indique le niveau d'accès des abonnements et la présence d'un client Stripe", async () => {
    const a = await org("Delta");
    await t.db
      .insert(billingCustomers)
      .values({ organizationId: a, stripeCustomerId: `cus_${a}` });
    await t.db.insert(subscriptions).values({
      organizationId: a,
      stripeSubscriptionId: `sub_${a}`,
      stripeCustomerId: `cus_${a}`,
      status: "past_due",
      graceEndsAt: new Date(Date.now() + 86_400_000),
      planCode: "pro",
    });
    const data = await loadDashboard(t.db, a);
    expect(data.hasStripeCustomer).toBe(true);
    expect(data.subscriptions[0]).toMatchObject({
      planCode: "pro",
      status: "past_due",
      access: "grace",
    });
  });
  it("un abonnement résilié n'affiche aucune prochaine échéance (elle contredirait « Résilié · Aucun accès »)", async () => {
    const a = await org("Epsilon");
    await t.db.insert(subscriptions).values({
      organizationId: a,
      stripeSubscriptionId: `sub_${a}`,
      stripeCustomerId: `cus_${a}`,
      status: "canceled",
      planCode: "pro",
      currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
    });
    const active = await org("Zeta");
    await t.db.insert(subscriptions).values({
      organizationId: active,
      stripeSubscriptionId: `sub_${active}`,
      stripeCustomerId: `cus_${active}`,
      status: "active",
      planCode: "pro",
      currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
    });
    expect(
      (await loadDashboard(t.db, a)).subscriptions[0]?.currentPeriodEnd,
    ).toBeNull();
    expect(
      (await loadDashboard(t.db, active)).subscriptions[0]?.currentPeriodEnd,
    ).toBeInstanceOf(Date);
  });
});
