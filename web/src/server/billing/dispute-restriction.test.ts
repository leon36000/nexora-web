import { randomBytes } from "node:crypto";
import { billingCustomers, organizations, promoCodes, users } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_BILLING_CONFIG } from "../ledger/config";
import { validatePromo } from "../payments/promo-apply";
import { trialFor } from "../payments/purchase";
import { buildEvent } from "../stripe/testing";
import { hasDisputeRestriction } from "./disputes";
import { FakePlanSource, type SubscriptionPlan } from "./plans";
import { processStripeEvent, type WebhookDeps } from "./webhook";

/**
 * Ruling du 28/10 (achat dépensé puis contesté) : le solde négatif reste une dette qui bloque l'API (inchangé) ; en plus,
 * une organisation dont un litige est ouvert ou perdu ne reçoit plus d'essai gratuit ni de rabais.
 */
let t: TestDatabase;
const silentLog = { debug() {}, info() {}, warn() {}, error() {} } as never;
const PLAN: SubscriptionPlan = {
  id: "p1",
  code: "pro",
  kind: "workstudio",
  interval: "month",
  priceCents: 4900,
  includedCreditsCents: 0,
  family: "fam-litige",
  trialDays: 14,
  trialCard: "default",
  stripeProductId: "prod_1",
  stripePriceId: "price_pro",
  translations: {},
};
const plans = new FakePlanSource([PLAN]);
const deps = (): WebhookDeps => ({
  db: t.db,
  plans,
  config: DEFAULT_BILLING_CONFIG,
  log: silentLog,
});

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

const T = Math.floor(new Date("2026-03-15T12:00:00Z").getTime() / 1000);
async function org() {
  const id = `org_${randomBytes(5).toString("hex")}`;
  const customer = `cus_${randomBytes(5).toString("hex")}`;
  await t.db.insert(organizations).values({ id, name: id, slug: id });
  await t.db
    .insert(billingCustomers)
    .values({ organizationId: id, stripeCustomerId: customer });
  const userId = `usr_${randomBytes(5).toString("hex")}`;
  await t.db
    .insert(users)
    .values({ id: userId, name: "N", email: `${userId}@exemple.ca` });
  return { id, customer, userId };
}

/** Achat de crédits, puis litige sur son paiement. */
async function purchaseThenDispute(o: { id: string; customer: string }) {
  const pi = `pi_${randomBytes(5).toString("hex")}`;
  const session = {
    id: `cs_${randomBytes(5).toString("hex")}`,
    mode: "payment",
    payment_status: "paid",
    client_reference_id: o.id,
    customer: o.customer,
    payment_intent: pi,
    amount_subtotal: 10_000,
    amount_total: 11_498,
    currency: "cad",
    total_details: { amount_tax: 1_498 },
    metadata: { kind: "credits", organization_id: o.id },
  };
  await processStripeEvent(
    deps(),
    buildEvent("checkout.session.completed", session, { created: T }),
  );
  const dispute = (status: string) => ({
    id: `dp_${pi}`,
    charge: `ch_${pi}`,
    payment_intent: pi,
    amount: 11_498,
    status,
  });
  return {
    open: () =>
      processStripeEvent(
        deps(),
        buildEvent("charge.dispute.created", dispute("needs_response"), {
          created: T + 10,
        }),
      ),
    close: (status: string) =>
      processStripeEvent(
        deps(),
        buildEvent("charge.dispute.closed", dispute(status), {
          created: T + 20,
        }),
      ),
  };
}

async function percentPromo(code: string) {
  await t.db.insert(promoCodes).values({
    code,
    kind: "percent",
    percentOff: 10,
    scopes: ["subscriptions", "credits"],
    status: "active",
    stripeCouponId: `co_${code}`,
    stripePromotionCodeId: `promo_${code}`,
    createdBy: "admin",
  });
}

describe("litige : plus d'essai ni de rabais tant qu'il est ouvert ou perdu", () => {
  it("un litige ouvert restreint l'organisation ; gagné, la restriction est levée ; perdu, elle reste", async () => {
    const won = await org();
    const w = await purchaseThenDispute(won);
    expect(await hasDisputeRestriction(t.db, won.id)).toBe(false);
    await w.open();
    expect(await hasDisputeRestriction(t.db, won.id)).toBe(true);
    await w.close("won");
    expect(await hasDisputeRestriction(t.db, won.id)).toBe(false);

    const lost = await org();
    const l = await purchaseThenDispute(lost);
    await l.open();
    await l.close("lost");
    expect(await hasDisputeRestriction(t.db, lost.id)).toBe(true);
    // Rejeu de l'événement : sans effet de plus.
    await l.open();
    expect(await hasDisputeRestriction(t.db, lost.id)).toBe(true);
  });

  it("un rabais et un essai sont refusés à une organisation restreinte, accordés aux autres", async () => {
    await percentPromo("DIX-LITIGE");
    const clean = await org();
    const disputed = await org();
    await (await purchaseThenDispute(disputed)).open();
    const input = (o: { id: string; userId: string }) => ({
      code: "DIX-LITIGE",
      scope: "subscriptions" as const,
      organizationId: o.id,
      userId: o.userId,
      amountCents: 4900,
      now: new Date(),
    });
    expect((await validatePromo(t.db, input(clean))).ok).toBe(true);
    expect(await validatePromo(t.db, input(disputed))).toEqual({
      ok: false,
      reason: "account_restricted",
    });
    const trial = (o: { id: string }) =>
      trialFor(t.db, {
        plan: PLAN,
        plans,
        organizationId: o.id,
        settings: { trialRequiresCard: true },
      });
    expect(await trial(clean)).toEqual({ days: 14, requireCard: true });
    expect(await trial(disputed)).toBeUndefined();
  });
});
