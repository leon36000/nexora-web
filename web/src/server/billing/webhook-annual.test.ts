import { randomBytes } from "node:crypto";
import {
  billingCustomers,
  eq,
  getAccount,
  grantDueTranches,
  listEntries,
  organizations,
  subscriptionCreditGrants,
  subscriptionCreditTranches,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_BILLING_CONFIG } from "../ledger/config";
import { buildEvent } from "../stripe/testing";
import { FakePlanSource, type SubscriptionPlan } from "./plans";
import { processStripeEvent, type WebhookDeps } from "./webhook";

/**
 * Offres annuelles : les crédits inclus sont versés mois par mois (un douzième, valable le mois en cours), avec reprise
 * en cas de remboursement ou de litige. Voir `packages/db/src/subscription-credits.ts`.
 */
let t: TestDatabase;
const silentLog = { debug() {}, info() {}, warn() {}, error() {} } as never;
const M = 1_000_000n;

const ANNUAL: SubscriptionPlan = {
  id: "pa",
  code: "workstudio-annuel",
  kind: "workstudio",
  interval: "year",
  priceCents: 120_000,
  includedCreditsCents: 120_000, // 1 200 $ pour l'année
  family: "ws",
  trialDays: 0,
  trialCard: "default",
  stripeProductId: "prod_a",
  stripePriceId: "price_annuel",
  translations: {},
};
const MONTHLY: SubscriptionPlan = {
  ...ANNUAL,
  id: "pm",
  code: "workstudio-mensuel",
  interval: "month",
  priceCents: 10_000,
  includedCreditsCents: 10_000,
  stripePriceId: "price_mensuel",
};
const plans = new FakePlanSource([ANNUAL, MONTHLY]);
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

const T0 = Math.floor(new Date("2026-01-31T10:00:00Z").getTime() / 1000);
const at = (iso: string) => new Date(iso);
async function newOrg() {
  const id = `org_${randomBytes(5).toString("hex")}`;
  const customer = `cus_${randomBytes(5).toString("hex")}`;
  await t.db.insert(organizations).values({ id, name: id, slug: id });
  await t.db
    .insert(billingCustomers)
    .values({ organizationId: id, stripeCustomerId: customer });
  return { id, customer };
}

function invoiceFor(
  org: { id: string; customer: string },
  plan: SubscriptionPlan,
  subId: string,
  over: Record<string, unknown> = {},
) {
  return {
    id: `in_${randomBytes(5).toString("hex")}`,
    customer: org.customer,
    billing_reason: "subscription_create",
    amount_paid: Math.round(plan.priceCents * 1.14975), // taxes comprises
    total_excluding_tax: plan.priceCents,
    parent: {
      subscription_details: {
        subscription: subId,
        metadata: { organization_id: org.id, plan_code: plan.code },
      },
    },
    lines: {
      data: [
        {
          period: {
            start: T0,
            end:
              plan.interval === "year" ? T0 + 365 * 86_400 : T0 + 30 * 86_400,
          },
          pricing: { price_details: { price: plan.stripePriceId } },
        },
      ],
    },
    ...over,
  };
}

/** Facture payée + lien paiement (comme le fait Stripe). */
async function paid(
  org: { id: string; customer: string },
  plan: SubscriptionPlan,
  over: Record<string, unknown> = {},
) {
  const sub = `sub_${randomBytes(5).toString("hex")}`;
  const inv = invoiceFor(org, plan, sub, over);
  await processStripeEvent(
    deps(),
    buildEvent("invoice.paid", inv, { created: T0 }),
  );
  await processStripeEvent(
    deps(),
    buildEvent(
      "invoice_payment.paid",
      {
        id: `inpay_${inv.id}`,
        invoice: inv.id,
        status: "paid",
        payment: { type: "payment_intent", payment_intent: `pi_${inv.id}` },
      },
      { created: T0 },
    ),
  );
  return { inv, sub, paymentIntent: `pi_${inv.id}` };
}

const balance = async (orgId: string) =>
  (await getAccount(t.db, orgId)).balanceMicro;
const tranchesOf = async (invoiceId: string) =>
  t.db
    .select()
    .from(subscriptionCreditTranches)
    .where(eq(subscriptionCreditTranches.stripeInvoiceId, invoiceId))
    .orderBy(subscriptionCreditTranches.seq);
const refund = (
  p: { inv: { id: string }; paymentIntent: string },
  amountRefunded: number,
  paidCents: number,
) =>
  buildEvent(
    "charge.refunded",
    {
      id: `ch_${p.inv.id}`,
      payment_intent: p.paymentIntent,
      amount: paidCents,
      amount_refunded: amountRefunded,
      currency: "cad",
    },
    { created: T0 + 86_400 * 100 },
  );
const dispute = (
  p: { inv: { id: string }; paymentIntent: string },
  amount: number,
  type: "charge.dispute.created" | "charge.dispute.closed",
  status = "needs_response",
) =>
  buildEvent(
    type,
    {
      id: `dp_${p.inv.id}`,
      charge: `ch_${p.inv.id}`,
      payment_intent: p.paymentIntent,
      amount,
      status,
    },
    { created: T0 + 86_400 * 100 },
  );

describe("offre annuelle : crédits inclus mois par mois", () => {
  it("la facture annuelle verse UN douzième (valable jusqu'au mois suivant), pas l'année entière", async () => {
    const org = await newOrg();
    const p = await paid(org, ANNUAL);
    expect(await balance(org.id)).toBe(100n * M);
    const [entry] = (await listEntries(t.db, org.id)).filter(
      (e) => e.kind === "credit",
    );
    expect(entry?.expiresAt?.toISOString()).toBe("2026-02-28T10:00:00.000Z");
    const [grant] = await t.db
      .select()
      .from(subscriptionCreditGrants)
      .where(eq(subscriptionCreditGrants.stripeInvoiceId, p.inv.id));
    expect(grant?.creditsMicro).toBe(1200n * M); // source des remboursements : le total de l'année
    expect(await tranchesOf(p.inv.id)).toHaveLength(12);
  });

  it("rejouer la facture (autre événement) ne double rien ; le worker verse les mois suivants, une fois chacun", async () => {
    const org = await newOrg();
    const p = await paid(org, ANNUAL);
    await processStripeEvent(
      deps(),
      buildEvent("invoice.paid", p.inv, { created: T0 + 5 }),
    );
    expect(await balance(org.id)).toBe(100n * M);
    expect(await tranchesOf(p.inv.id)).toHaveLength(12);
    await grantDueTranches(t.db, { now: at("2026-04-30T12:00:00Z") });
    await grantDueTranches(t.db, { now: at("2026-04-30T12:00:00Z") });
    expect(await balance(org.id)).toBe(400n * M); // janvier, février, mars, avril
    await grantDueTranches(t.db, { now: at("2027-01-31T10:00:00Z") });
    expect(await balance(org.id)).toBe(1200n * M);
  });

  it("une offre mensuelle garde un seul versement, sans tranche (comportement inchangé)", async () => {
    const org = await newOrg();
    const p = await paid(org, MONTHLY);
    expect(await balance(org.id)).toBe(100n * M);
    expect(await tranchesOf(p.inv.id)).toHaveLength(0);
  });

  it("remboursement partiel (50 %) au 4e mois : ce qui n'est pas encore versé est retiré d'abord, le solde du client n'est pas touché", async () => {
    const org = await newOrg();
    const p = await paid(org, ANNUAL);
    await grantDueTranches(t.db, { now: at("2026-04-30T12:00:00Z") });
    expect(await balance(org.id)).toBe(400n * M);
    const paidCents = Math.round(ANNUAL.priceCents * 1.14975);
    await processStripeEvent(deps(), refund(p, paidCents / 2, paidCents));
    // 50 % de 1 200 $ = 600 $ à retirer : tout vient des 8 mois à venir (800 $), rien du solde.
    expect(await balance(org.id)).toBe(400n * M);
    await grantDueTranches(t.db, { now: at("2027-01-31T10:00:00Z") });
    expect(await balance(org.id)).toBe(600n * M);
    // Le même cumul rejoué ne retire rien de plus.
    await processStripeEvent(deps(), refund(p, paidCents / 2, paidCents));
    await grantDueTranches(t.db, { now: at("2027-01-31T10:00:00Z") });
    expect(await balance(org.id)).toBe(600n * M);
  });

  it("remboursement total au 4e mois : les mois à venir sont annulés et les 4 mois versés sont repris du grand livre", async () => {
    const org = await newOrg();
    const p = await paid(org, ANNUAL);
    await grantDueTranches(t.db, { now: at("2026-04-30T12:00:00Z") });
    const paidCents = Math.round(ANNUAL.priceCents * 1.14975);
    await processStripeEvent(deps(), refund(p, paidCents, paidCents));
    expect(await balance(org.id)).toBe(0n);
    await grantDueTranches(t.db, { now: at("2027-01-31T10:00:00Z") });
    expect(await balance(org.id)).toBe(0n);
    const rows = await tranchesOf(p.inv.id);
    expect(rows.filter((r) => r.status === "pending")).toHaveLength(0);
  });

  it("litige : les mois à venir sont suspendus et le versé repris ; gagné, tout revient ; perdu, le reste est annulé", async () => {
    const won = await newOrg();
    const w = await paid(won, ANNUAL);
    await grantDueTranches(t.db, { now: at("2026-03-31T12:00:00Z") });
    const paidCents = Math.round(ANNUAL.priceCents * 1.14975);
    await processStripeEvent(
      deps(),
      dispute(w, paidCents, "charge.dispute.created"),
    );
    expect(await balance(won.id)).toBe(0n); // 3 mois versés, repris
    await grantDueTranches(t.db, { now: at("2027-01-31T10:00:00Z") });
    expect(await balance(won.id)).toBe(0n); // suspendu : rien de versé pendant le litige
    await processStripeEvent(
      deps(),
      dispute(w, paidCents, "charge.dispute.closed", "won"),
    );
    expect(await balance(won.id)).toBe(300n * M); // les 3 mois repris sont rendus
    await grantDueTranches(t.db, { now: at("2027-01-31T10:00:00Z") });
    expect(await balance(won.id)).toBe(1200n * M);

    const lost = await newOrg();
    const l = await paid(lost, ANNUAL);
    await grantDueTranches(t.db, { now: at("2026-03-31T12:00:00Z") });
    await processStripeEvent(
      deps(),
      dispute(l, paidCents, "charge.dispute.created"),
    );
    await processStripeEvent(
      deps(),
      dispute(l, paidCents, "charge.dispute.closed", "lost"),
    );
    await grantDueTranches(t.db, { now: at("2027-01-31T10:00:00Z") });
    expect(await balance(lost.id)).toBe(0n);
    expect(
      (await tranchesOf(l.inv.id)).filter((r) => r.status === "pending"),
    ).toHaveLength(0);
  });
});

describe("crédits inclus proportionnels au prix réellement payé", () => {
  it("un code de 99 % ne donne que 1 % des crédits (au lieu de 100 %) ; un rabais de 20 % en donne 80 %", async () => {
    const heavy = await newOrg();
    await paid(heavy, MONTHLY, {
      total_excluding_tax: 100,
      amount_paid: 115,
    });
    expect(await balance(heavy.id)).toBe(1n * M);
    const light = await newOrg();
    await paid(light, MONTHLY, {
      total_excluding_tax: 8_000,
      amount_paid: 9_198,
    });
    expect(await balance(light.id)).toBe(80n * M);
    // Sans le champ (anciennes versions d'API), l'octroi complet est conservé.
    const legacy = await newOrg();
    await paid(legacy, MONTHLY, { total_excluding_tax: undefined });
    expect(await balance(legacy.id)).toBe(100n * M);
  });
});
