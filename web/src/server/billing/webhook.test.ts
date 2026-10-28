import { randomBytes } from "node:crypto";
import {
  and,
  billingCustomers,
  creditEntries,
  creditPurchases,
  deriveBalance,
  eq,
  getAccount,
  listEntries,
  organizations,
  processedEvents,
  promoCodes,
  promoRedemptions,
  subscriptions,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_BILLING_CONFIG } from "../ledger/config";
import { buildEvent } from "../stripe/testing";
import {
  FakePlanSource,
  planConfigVersion,
  type SubscriptionPlan,
} from "./plans";
import { processStripeEvent, type WebhookDeps } from "./webhook";

let t: TestDatabase;
const silentLog = { debug() {}, info() {}, warn() {}, error() {} } as never;

const PLAN: SubscriptionPlan = {
  id: "p1",
  code: "workstudio-pro",
  kind: "workstudio",
  interval: "month",
  priceCents: 4900,
  includedCreditsCents: 1000,
  family: "f",
  trialDays: 0,
  trialCard: "default",
  stripeProductId: "prod_1",
  stripePriceId: "price_pro",
  translations: {},
};

function deps(over: Partial<WebhookDeps> = {}): WebhookDeps {
  return {
    db: t.db,
    plans: new FakePlanSource([PLAN]),
    config: DEFAULT_BILLING_CONFIG,
    log: silentLog,
    ...over,
  };
}

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

let seq = 0;
async function newOrg(withCustomer = true) {
  seq += 1;
  const id = `org_${randomBytes(5).toString("hex")}`;
  const customer = `cus_${randomBytes(5).toString("hex")}`;
  await t.db.insert(organizations).values({ id, name: id, slug: id });
  if (withCustomer)
    await t.db
      .insert(billingCustomers)
      .values({ organizationId: id, stripeCustomerId: customer });
  return { id, customer, n: seq };
}

const EVT_TIME = Math.floor(new Date("2026-03-15T12:00:00Z").getTime() / 1000);

function creditSession(
  org: { id: string; customer: string },
  over: Record<string, unknown> = {},
) {
  return {
    id: `cs_test_${randomBytes(5).toString("hex")}`,
    object: "checkout.session",
    mode: "payment",
    payment_status: "paid",
    status: "complete",
    client_reference_id: org.id,
    customer: org.customer,
    payment_intent: `pi_${randomBytes(5).toString("hex")}`,
    amount_subtotal: 10_000,
    amount_total: 11_498, // + TPS 5 % et TVQ 9,975 % (arrondis par Stripe)
    currency: "cad",
    total_details: { amount_tax: 1_498 },
    metadata: { kind: "credits", organization_id: org.id },
    ...over,
  };
}

describe("achat de crédits : checkout.session.completed", () => {
  it("crédite le grand livre du montant avant taxes, avec échéance à 12 mois et version de config", async () => {
    const org = await newOrg();
    const session = creditSession(org);
    const out = await processStripeEvent(
      deps(),
      buildEvent("checkout.session.completed", session, { created: EVT_TIME }),
    );
    expect(out.status).toBe("processed");
    const acct = await getAccount(t.db, org.id);
    expect(acct.balanceMicro).toBe(100_000_000n); // 100,00 $ de crédits, pas 114,98 $
    const [entry] = await listEntries(t.db, org.id);
    expect(entry).toMatchObject({
      kind: "credit",
      source: "purchase",
      externalRef: session.id,
    });
    expect(entry?.configVersion).toMatch(/^cfg_/);
    expect(entry?.expiresAt?.toISOString()).toBe("2027-03-15T12:00:00.000Z");
    const [purchase] = await t.db
      .select()
      .from(creditPurchases)
      .where(eq(creditPurchases.organizationId, org.id));
    expect(purchase).toMatchObject({
      amountSubtotalCents: 10_000,
      taxCents: 1_498,
      amountTotalCents: 11_498,
      creditsMicro: 100_000_000n,
      status: "paid",
    });
  });

  it("accorde les crédits NETS de la métadonnée quand des frais de recharge s'appliquent (jamais plus que le montant payé)", async () => {
    const org = await newOrg();
    await processStripeEvent(
      deps(),
      buildEvent(
        "checkout.session.completed",
        creditSession(org, {
          metadata: {
            kind: "credits",
            organization_id: org.id,
            credits_cents: "9500",
          },
        }),
        { created: EVT_TIME },
      ),
    );
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(95_000_000n);
    const other = await newOrg();
    await processStripeEvent(
      deps(),
      buildEvent(
        "checkout.session.completed",
        creditSession(other, {
          metadata: {
            kind: "credits",
            organization_id: other.id,
            credits_cents: "99999999",
          },
        }),
        { created: EVT_TIME },
      ),
    );
    expect((await getAccount(t.db, other.id)).balanceMicro).toBe(100_000_000n);
  });

  it("rejouer le même événement ne double rien", async () => {
    const org = await newOrg();
    const event = buildEvent("checkout.session.completed", creditSession(org), {
      created: EVT_TIME,
    });
    const first = await processStripeEvent(deps(), event);
    const second = await processStripeEvent(deps(), event);
    const third = await processStripeEvent(deps(), event);
    expect([first.status, second.status, third.status]).toEqual([
      "processed",
      "duplicate",
      "duplicate",
    ]);
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(100_000_000n);
    expect(await listEntries(t.db, org.id)).toHaveLength(1);
  });

  it("rejeux simultanés du même événement : un seul crédit", async () => {
    const org = await newOrg();
    const event = buildEvent("checkout.session.completed", creditSession(org), {
      created: EVT_TIME,
    });
    const results = await Promise.all(
      Array.from({ length: 8 }, () => processStripeEvent(deps(), event)),
    );
    expect(results.filter((r) => r.status === "processed")).toHaveLength(1);
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(100_000_000n);
  });

  it("une session déjà créditée sous un autre événement ne crédite pas deux fois", async () => {
    const org = await newOrg();
    const session = creditSession(org);
    await processStripeEvent(
      deps(),
      buildEvent("checkout.session.completed", session, { created: EVT_TIME }),
    );
    const again = await processStripeEvent(
      deps(),
      buildEvent("checkout.session.async_payment_succeeded", session, {
        created: EVT_TIME + 5,
      }),
    );
    expect(again.status).toBe("processed");
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(100_000_000n);
  });

  it("paiement différé non encore reçu : aucun crédit, puis crédit une fois reçu", async () => {
    const org = await newOrg();
    const pending = creditSession(org, { payment_status: "unpaid" });
    await processStripeEvent(
      deps(),
      buildEvent("checkout.session.completed", pending, { created: EVT_TIME }),
    );
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(0n);
    await processStripeEvent(
      deps(),
      buildEvent(
        "checkout.session.async_payment_succeeded",
        { ...pending, payment_status: "paid" },
        { created: EVT_TIME + 60 },
      ),
    );
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(100_000_000n);
  });

  it("une organisation inconnue n'est pas créditée et l'événement n'échoue pas", async () => {
    const out = await processStripeEvent(
      deps(),
      buildEvent(
        "checkout.session.completed",
        creditSession({ id: "org_inexistante", customer: "cus_z" }),
        { created: EVT_TIME },
      ),
    );
    expect(out.status).toBe("ignored");
  });

  it("n'accepte que le CAD", async () => {
    const org = await newOrg();
    const out = await processStripeEvent(
      deps(),
      buildEvent(
        "checkout.session.completed",
        creditSession(org, { currency: "usd" }),
        { created: EVT_TIME },
      ),
    );
    expect(out.status).toBe("ignored");
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(0n);
  });

  it("l'échec d'un traitement annule tout et l'événement reste rejouable", async () => {
    const org = await newOrg();
    const failing = deps({
      plans: {
        listPublished: async () => [],
        getByCode: async () => {
          throw new Error("Directus indisponible");
        },
        getByPriceId: async () => {
          throw new Error("Directus indisponible");
        },
      },
    });
    const sub = {
      id: `in_${randomBytes(4).toString("hex")}`,
      customer: org.customer,
      billing_reason: "subscription_create",
      amount_paid: PLAN.priceCents,
      parent: {
        subscription_details: {
          subscription: "sub_fail",
          metadata: { organization_id: org.id, plan_code: PLAN.code },
        },
      },
      lines: {
        data: [{ period: { start: EVT_TIME, end: EVT_TIME + 2_592_000 } }],
      },
    };
    const event = buildEvent("invoice.paid", sub, { created: EVT_TIME });
    await expect(processStripeEvent(failing, event)).rejects.toThrow();
    expect(
      await t.db
        .select()
        .from(processedEvents)
        .where(eq(processedEvents.eventId, event.id)),
    ).toHaveLength(0);
    expect(
      await t.db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.organizationId, org.id)),
    ).toHaveLength(0);
    // Le service revient : Stripe renvoie l'événement, il est traité.
    const ok = await processStripeEvent(deps(), event);
    expect(ok.status).toBe("processed");
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(10_000_000n);
  });
});

async function purchaseFor(
  org: { id: string; customer: string },
  over: Record<string, unknown> = {},
) {
  const session = creditSession(org, over);
  await processStripeEvent(
    deps(),
    buildEvent("checkout.session.completed", session, { created: EVT_TIME }),
  );
  return session;
}

const charge = (
  session: { payment_intent: unknown },
  over: Record<string, unknown> = {},
) => ({
  id: "ch_1",
  payment_intent: session.payment_intent,
  amount: 11_498,
  amount_refunded: 11_498,
  currency: "cad",
  ...over,
});

describe("remboursements : charge.refunded", () => {
  it("un remboursement total débite tous les crédits achetés", async () => {
    const org = await newOrg();
    const session = await purchaseFor(org);
    await processStripeEvent(
      deps(),
      buildEvent("charge.refunded", charge(session), {
        created: EVT_TIME + 10,
      }),
    );
    const acct = await getAccount(t.db, org.id);
    expect(acct.balanceMicro).toBe(0n);
    const [purchase] = await t.db
      .select()
      .from(creditPurchases)
      .where(eq(creditPurchases.organizationId, org.id));
    expect(purchase?.status).toBe("refunded");
    const entries = await listEntries(t.db, org.id);
    expect(entries.find((e) => e.kind === "refund")?.purchaseId).toBe(
      purchase?.id,
    );
  });

  it("remboursements partiels successifs : débits proportionnels, sans double compte", async () => {
    const org = await newOrg();
    const session = await purchaseFor(org, {
      amount_subtotal: 10_000,
      amount_total: 11_000,
    });
    await processStripeEvent(
      deps(),
      buildEvent(
        "charge.refunded",
        charge(session, { amount: 11_000, amount_refunded: 5_500 }),
        { created: EVT_TIME + 10 },
      ),
    );
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(50_000_000n);
    await processStripeEvent(
      deps(),
      buildEvent(
        "charge.refunded",
        charge(session, { amount: 11_000, amount_refunded: 11_000 }),
        { created: EVT_TIME + 20 },
      ),
    );
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(0n);
    const [purchase] = await t.db
      .select()
      .from(creditPurchases)
      .where(eq(creditPurchases.organizationId, org.id));
    expect(purchase?.status).toBe("refunded");
  });

  it("rejouer l'événement ne débite pas deux fois", async () => {
    const org = await newOrg();
    const session = await purchaseFor(org);
    const event = buildEvent("charge.refunded", charge(session), {
      created: EVT_TIME + 10,
    });
    await processStripeEvent(deps(), event);
    await processStripeEvent(deps(), event);
    // Même charge notifiée sous un nouvel identifiant d'événement : toujours un seul débit.
    await processStripeEvent(
      deps(),
      buildEvent("charge.refunded", charge(session), {
        created: EVT_TIME + 30,
      }),
    );
    expect(
      (await listEntries(t.db, org.id)).filter((e) => e.kind === "refund"),
    ).toHaveLength(1);
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(0n);
  });

  it("si les crédits sont dépensés, le solde devient négatif et le compte est bloqué", async () => {
    const org = await newOrg();
    const session = await purchaseFor(org);
    // 60 $ dépensés
    const { reserve, settleReservation } = await import("@nexora/db");
    const r = await reserve(t.db, {
      organizationId: org.id,
      amountMicro: 60_000_000n,
      idempotencyKey: `use:${org.id}`,
      configVersion: "cfg_x",
    });
    if (r.status !== "reserved") throw new Error("réservation attendue");
    await settleReservation(t.db, {
      organizationId: org.id,
      reservationId: r.reservation.id,
      actualMicro: 60_000_000n,
    });
    await processStripeEvent(
      deps(),
      buildEvent("charge.refunded", charge(session), {
        created: EVT_TIME + 10,
      }),
    );
    const acct = await getAccount(t.db, org.id);
    expect(acct.balanceMicro).toBe(-60_000_000n);
    expect(acct.blocked).toBe(true);
  });

  it("deux remboursements simultanés du même achat ne reprennent jamais plus que les crédits achetés", async () => {
    const org = await newOrg();
    const session = await purchaseFor(org, {
      amount_subtotal: 10_000,
      amount_total: 11_000,
    });
    await Promise.all([
      processStripeEvent(
        deps(),
        buildEvent(
          "charge.refunded",
          charge(session, { amount: 11_000, amount_refunded: 5_500 }),
          { created: EVT_TIME + 10 },
        ),
      ),
      processStripeEvent(
        deps(),
        buildEvent(
          "charge.refunded",
          charge(session, { amount: 11_000, amount_refunded: 11_000 }),
          { created: EVT_TIME + 11 },
        ),
      ),
    ]);
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(0n);
  });

  it("un remboursement ou un litige reçu AVANT l'achat n'est pas perdu : erreur (Stripe le renvoie), puis traité une fois l'achat connu", async () => {
    const org = await newOrg();
    const session = creditSession(org);
    const fresh = Math.floor(Date.now() / 1000);
    const refund = buildEvent("charge.refunded", charge(session), {
      created: fresh,
    });
    const dispute = buildEvent(
      "charge.dispute.created",
      {
        id: `dp_${String(session.payment_intent)}`,
        charge: "ch_1",
        payment_intent: session.payment_intent,
        amount: 11_498,
        status: "needs_response",
      },
      { created: fresh },
    );
    await expect(processStripeEvent(deps(), refund)).rejects.toThrow();
    await expect(processStripeEvent(deps(), dispute)).rejects.toThrow();
    // L'échec ne laisse aucune trace : le renvoi de Stripe sera traité comme un premier envoi.
    await processStripeEvent(
      deps(),
      buildEvent("checkout.session.completed", session, { created: fresh }),
    );
    expect((await getAccount(t.db, org.id)).balanceMicro).toBeGreaterThan(0n);
    expect((await processStripeEvent(deps(), refund)).status).toBe("processed");
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(0n);
  });

  it("une charge sans achat de crédits connu est ignorée", async () => {
    const out = await processStripeEvent(
      deps(),
      buildEvent("charge.refunded", charge({ payment_intent: "pi_inconnu" }), {
        created: EVT_TIME,
      }),
    );
    expect(out.status).toBe("ignored");
  });
});

describe("litiges : charge.dispute.created / closed", () => {
  // Un litige Stripe a un identifiant unique ; la clé d'idempotence du grand livre en dépend.
  const dispute = (
    session: { payment_intent: unknown; id?: string },
    over: Record<string, unknown> = {},
  ) => ({
    id: `dp_${String(session.payment_intent)}`,
    charge: "ch_1",
    payment_intent: session.payment_intent,
    amount: 11_498,
    status: "needs_response",
    ...over,
  });

  it("débite les crédits de l'achat contesté, une seule fois", async () => {
    const org = await newOrg();
    const session = await purchaseFor(org);
    const event = buildEvent("charge.dispute.created", dispute(session), {
      created: EVT_TIME + 10,
    });
    await processStripeEvent(deps(), event);
    await processStripeEvent(deps(), event);
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(0n);
    const entries = (await listEntries(t.db, org.id)).filter(
      (e) => e.kind === "dispute",
    );
    expect(entries).toHaveLength(1);
    const [purchase] = await t.db
      .select()
      .from(creditPurchases)
      .where(eq(creditPurchases.organizationId, org.id));
    expect(purchase?.status).toBe("disputed");
  });

  it("un litige gagné restitue les crédits retirés", async () => {
    const org = await newOrg();
    const session = await purchaseFor(org);
    await processStripeEvent(
      deps(),
      buildEvent("charge.dispute.created", dispute(session), {
        created: EVT_TIME + 10,
      }),
    );
    const won = buildEvent(
      "charge.dispute.closed",
      dispute(session, { status: "won" }),
      { created: EVT_TIME + 99 },
    );
    await processStripeEvent(deps(), won);
    await processStripeEvent(deps(), won);
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(100_000_000n);
  });

  it("un litige perdu ne change rien de plus", async () => {
    const org = await newOrg();
    const session = await purchaseFor(org);
    await processStripeEvent(
      deps(),
      buildEvent("charge.dispute.created", dispute(session), {
        created: EVT_TIME + 10,
      }),
    );
    await processStripeEvent(
      deps(),
      buildEvent(
        "charge.dispute.closed",
        dispute(session, { status: "lost" }),
        { created: EVT_TIME + 99 },
      ),
    );
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(0n);
  });
});

function invoice(
  org: { id: string; customer: string },
  subId: string,
  over: Record<string, unknown> = {},
) {
  return {
    id: `in_${randomBytes(5).toString("hex")}`,
    customer: org.customer,
    billing_reason: "subscription_create",
    amount_paid: PLAN.priceCents,
    parent: {
      subscription_details: {
        subscription: subId,
        metadata: { organization_id: org.id, plan_code: PLAN.code },
      },
    },
    lines: {
      data: [
        {
          period: { start: EVT_TIME, end: EVT_TIME + 30 * 86_400 },
          pricing: { price_details: { price: "price_pro" } },
        },
      ],
    },
    ...over,
  };
}

function subscriptionObject(
  org: { id: string; customer: string },
  subId: string,
  over: Record<string, unknown> = {},
) {
  return {
    id: subId,
    customer: org.customer,
    status: "active",
    cancel_at_period_end: false,
    canceled_at: null,
    metadata: { organization_id: org.id, plan_code: PLAN.code },
    items: {
      data: [
        {
          current_period_start: EVT_TIME,
          current_period_end: EVT_TIME + 30 * 86_400,
          price: { id: "price_pro" },
        },
      ],
    },
    ...over,
  };
}

async function subRow(orgId: string) {
  const [row] = await t.db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, orgId));
  return row;
}

describe("abonnements : invoice.paid, invoice.payment_failed, customer.subscription.*", () => {
  it("première facture payée : abonnement actif et crédits inclus accordés jusqu'à la fin de période", async () => {
    const org = await newOrg();
    const inv = invoice(org, "sub_a");
    await processStripeEvent(
      deps(),
      buildEvent("invoice.paid", inv, { created: EVT_TIME }),
    );
    const row = await subRow(org.id);
    expect(row).toMatchObject({
      stripeSubscriptionId: "sub_a",
      status: "active",
      planCode: PLAN.code,
      configVersion: planConfigVersion(PLAN),
    });
    const [entry] = await listEntries(t.db, org.id);
    expect(entry).toMatchObject({
      kind: "credit",
      source: "subscription",
      balanceDeltaMicro: 10_000_000n,
      configVersion: planConfigVersion(PLAN),
    });
    expect(entry?.expiresAt?.getTime()).toBe((EVT_TIME + 30 * 86_400) * 1000);
  });

  it("rejouer invoice.paid ne double pas les crédits ; une nouvelle facture (renouvellement) en accorde de nouveaux", async () => {
    const org = await newOrg();
    const inv = invoice(org, "sub_b");
    const event = buildEvent("invoice.paid", inv, { created: EVT_TIME });
    await processStripeEvent(deps(), event);
    await processStripeEvent(deps(), event);
    // Même facture sous un autre événement : même clé d'idempotence.
    await processStripeEvent(
      deps(),
      buildEvent("invoice.paid", inv, { created: EVT_TIME + 1 }),
    );
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(10_000_000n);
    await processStripeEvent(
      deps(),
      buildEvent(
        "invoice.paid",
        invoice(org, "sub_b", { billing_reason: "subscription_cycle" }),
        { created: EVT_TIME + 30 * 86_400 },
      ),
    );
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(20_000_000n);
  });

  it("une facture sans abonnement (reçu d'un achat de crédits) n'accorde rien", async () => {
    const org = await newOrg();
    const out = await processStripeEvent(
      deps(),
      buildEvent(
        "invoice.paid",
        {
          id: "in_one_shot",
          customer: org.customer,
          billing_reason: "manual",
          lines: { data: [] },
        },
        { created: EVT_TIME },
      ),
    );
    expect(out.status).toBe("ignored");
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(0n);
  });

  it("une mise à niveau en cours de période (subscription_update) n'accorde pas de crédits", async () => {
    const org = await newOrg();
    await processStripeEvent(
      deps(),
      buildEvent(
        "invoice.paid",
        invoice(org, "sub_up", { billing_reason: "subscription_update" }),
        { created: EVT_TIME },
      ),
    );
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(0n);
  });

  it("échec de paiement : past_due avec délai de grâce ; paiement ensuite : retour à active", async () => {
    const org = await newOrg();
    await processStripeEvent(
      deps(),
      buildEvent("invoice.paid", invoice(org, "sub_c"), { created: EVT_TIME }),
    );
    await processStripeEvent(
      deps(),
      buildEvent(
        "invoice.payment_failed",
        invoice(org, "sub_c", { billing_reason: "subscription_cycle" }),
        { created: EVT_TIME + 100 },
      ),
    );
    const failed = await subRow(org.id);
    expect(failed?.status).toBe("past_due");
    expect(failed?.graceEndsAt).not.toBeNull();
    await processStripeEvent(
      deps(),
      buildEvent(
        "invoice.paid",
        invoice(org, "sub_c", { billing_reason: "subscription_cycle" }),
        { created: EVT_TIME + 200 },
      ),
    );
    const ok = await subRow(org.id);
    expect(ok?.status).toBe("active");
    expect(ok?.graceEndsAt).toBeNull();
  });

  it("customer.subscription.updated met à jour période, annulation programmée et prix", async () => {
    const org = await newOrg();
    await processStripeEvent(
      deps(),
      buildEvent(
        "customer.subscription.updated",
        subscriptionObject(org, "sub_d", { cancel_at_period_end: true }),
        {
          created: EVT_TIME,
        },
      ),
    );
    const row = await subRow(org.id);
    expect(row).toMatchObject({
      status: "active",
      cancelAtPeriodEnd: true,
      stripePriceId: "price_pro",
      planCode: PLAN.code,
    });
    expect(row?.currentPeriodEnd?.getTime()).toBe(
      (EVT_TIME + 30 * 86_400) * 1000,
    );
  });

  it("customer.subscription.deleted : canceled, et une facture tardive ne le réactive pas", async () => {
    const org = await newOrg();
    await processStripeEvent(
      deps(),
      buildEvent(
        "customer.subscription.updated",
        subscriptionObject(org, "sub_e"),
        { created: EVT_TIME },
      ),
    );
    await processStripeEvent(
      deps(),
      buildEvent(
        "customer.subscription.deleted",
        subscriptionObject(org, "sub_e", { status: "canceled" }),
        {
          created: EVT_TIME + 100,
        },
      ),
    );
    expect((await subRow(org.id))?.status).toBe("canceled");
    await processStripeEvent(
      deps(),
      buildEvent(
        "invoice.paid",
        invoice(org, "sub_e", { billing_reason: "subscription_cycle" }),
        {
          created: EVT_TIME + 200,
        },
      ),
    );
    expect((await subRow(org.id))?.status).toBe("canceled");
  });

  it("un événement livré en retard n'écrase pas un état plus récent", async () => {
    const org = await newOrg();
    await processStripeEvent(
      deps(),
      buildEvent(
        "customer.subscription.updated",
        subscriptionObject(org, "sub_f", { status: "past_due" }),
        {
          created: EVT_TIME + 500,
        },
      ),
    );
    await processStripeEvent(
      deps(),
      buildEvent(
        "customer.subscription.updated",
        subscriptionObject(org, "sub_f", { status: "active" }),
        {
          created: EVT_TIME + 100,
        },
      ),
    );
    expect((await subRow(org.id))?.status).toBe("past_due");
  });

  it("checkout.session.completed (abonnement) crée la ligne et lie le client Stripe", async () => {
    const org = await newOrg(false);
    await processStripeEvent(
      deps(),
      buildEvent(
        "checkout.session.completed",
        {
          id: "cs_sub_1",
          mode: "subscription",
          payment_status: "paid",
          client_reference_id: org.id,
          customer: org.customer,
          subscription: "sub_g",
          currency: "cad",
          metadata: {
            kind: "subscription",
            organization_id: org.id,
            plan_code: PLAN.code,
          },
        },
        { created: EVT_TIME },
      ),
    );
    const [link] = await t.db
      .select()
      .from(billingCustomers)
      .where(eq(billingCustomers.organizationId, org.id));
    expect(link?.stripeCustomerId).toBe(org.customer);
    const row = await subRow(org.id);
    expect(row).toMatchObject({
      stripeSubscriptionId: "sub_g",
      status: "incomplete",
      planCode: PLAN.code,
    });
    // Aucun crédit à ce stade : ils viennent d'invoice.paid.
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(0n);
  });

  it("invoice.paid avant checkout.session.completed : la ligne est créée, rien n'est perdu", async () => {
    const org = await newOrg();
    await processStripeEvent(
      deps(),
      buildEvent("invoice.paid", invoice(org, "sub_h"), { created: EVT_TIME }),
    );
    await processStripeEvent(
      deps(),
      buildEvent(
        "checkout.session.completed",
        {
          id: "cs_sub_2",
          mode: "subscription",
          payment_status: "paid",
          client_reference_id: org.id,
          customer: org.customer,
          subscription: "sub_h",
          currency: "cad",
          metadata: { organization_id: org.id, plan_code: PLAN.code },
        },
        { created: EVT_TIME + 2 },
      ),
    );
    expect((await subRow(org.id))?.status).toBe("active");
  });

  it("un client Stripe inconnu est ignoré sans erreur", async () => {
    const out = await processStripeEvent(
      deps(),
      buildEvent(
        "customer.subscription.updated",
        {
          id: "sub_zzz",
          customer: "cus_inconnu",
          status: "active",
          metadata: {},
          items: { data: [] },
        },
        { created: EVT_TIME },
      ),
    );
    expect(out.status).toBe("ignored");
  });
});

// ---------------------------------------------------------------------------------------------
// I2 : remboursement et litige sur une facture d'abonnement ; M4 : crédits seulement si payé
// ---------------------------------------------------------------------------------------------

/** `invoice_payment.paid` : seul événement qui relie une facture à son paiement (API 2026-09-30). */
function invoicePayment(
  inv: { id: string },
  over: Record<string, unknown> = {},
) {
  return {
    id: `inpay_${randomBytes(5).toString("hex")}`,
    object: "invoice_payment",
    invoice: inv.id,
    status: "paid",
    currency: "cad",
    amount_paid: PLAN.priceCents,
    payment: { type: "payment_intent", payment_intent: `pi_${inv.id}` },
    ...over,
  };
}

const paymentIntentOf = (inv: { id: string }) => `pi_${inv.id}`;

/** Abonnement payé : facture + lien paiement ; renvoie la facture. */
async function paidSubscription(
  org: { id: string; customer: string },
  subId: string,
  over: Record<string, unknown> = {},
) {
  const inv = invoice(org, subId, over);
  await processStripeEvent(
    deps(),
    buildEvent("invoice.paid", inv, { created: EVT_TIME }),
  );
  await processStripeEvent(
    deps(),
    buildEvent("invoice_payment.paid", invoicePayment(inv), {
      created: EVT_TIME,
    }),
  );
  return inv;
}

const subCharge = (
  inv: { id: string },
  amountRefunded: number,
  over: Record<string, unknown> = {},
) => ({
  id: `ch_${inv.id}`,
  payment_intent: paymentIntentOf(inv),
  amount: PLAN.priceCents,
  amount_refunded: amountRefunded,
  currency: "cad",
  ...over,
});

async function spend(orgId: string, micro: bigint) {
  const { reserve, settleReservation } = await import("@nexora/db");
  const r = await reserve(t.db, {
    organizationId: orgId,
    amountMicro: micro,
    idempotencyKey: `use:${orgId}:${micro}`,
    configVersion: "cfg_x",
  });
  if (r.status !== "reserved") throw new Error("réservation attendue");
  await settleReservation(t.db, {
    organizationId: orgId,
    reservationId: r.reservation.id,
    actualMicro: micro,
  });
}

describe("I2 : remboursement d'une facture d'abonnement", () => {
  it("un remboursement total reprend les crédits inclus", async () => {
    const org = await newOrg();
    const inv = await paidSubscription(org, "sub_r1");
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(10_000_000n);
    const out = await processStripeEvent(
      deps(),
      buildEvent("charge.refunded", subCharge(inv, 4_900), {
        created: EVT_TIME + 10,
      }),
    );
    expect(out.status).toBe("processed");
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(0n);
    const refund = (await listEntries(t.db, org.id)).find(
      (e) => e.kind === "refund",
    );
    expect(refund).toMatchObject({
      source: "stripe_refund",
      balanceDeltaMicro: -10_000_000n,
    });
  });

  it("un remboursement partiel donne un débit proportionnel, puis le complément sans double compte", async () => {
    const org = await newOrg();
    const inv = await paidSubscription(org, "sub_r2");
    await processStripeEvent(
      deps(),
      buildEvent("charge.refunded", subCharge(inv, 1_225), {
        created: EVT_TIME + 10,
      }),
    );
    // 1 225 / 4 900 = 25 % de 10 $ = 2,50 $
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(7_500_000n);
    await processStripeEvent(
      deps(),
      buildEvent("charge.refunded", subCharge(inv, 4_900), {
        created: EVT_TIME + 20,
      }),
    );
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(0n);
  });

  it("la proportion se calcule sur le montant payé, taxes comprises", async () => {
    const org = await newOrg();
    const inv = await paidSubscription(org, "sub_r3", { amount_paid: 5_634 });
    await processStripeEvent(
      deps(),
      buildEvent(
        "invoice_payment.paid",
        invoicePayment(inv, { amount_paid: 5_634 }),
        { created: EVT_TIME },
      ),
    );
    await processStripeEvent(
      deps(),
      buildEvent("charge.refunded", subCharge(inv, 2_817, { amount: 5_634 }), {
        created: EVT_TIME + 10,
      }),
    );
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(5_000_000n);
  });

  it("rejeu (même événement ou même cumul sous un autre événement) : un seul débit", async () => {
    const org = await newOrg();
    const inv = await paidSubscription(org, "sub_r4");
    const event = buildEvent("charge.refunded", subCharge(inv, 4_900), {
      created: EVT_TIME + 10,
    });
    await processStripeEvent(deps(), event);
    await processStripeEvent(deps(), event);
    await processStripeEvent(
      deps(),
      buildEvent("charge.refunded", subCharge(inv, 4_900), {
        created: EVT_TIME + 30,
      }),
    );
    expect(
      (await listEntries(t.db, org.id)).filter((e) => e.kind === "refund"),
    ).toHaveLength(1);
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(0n);
  });

  it("crédits consommés : le solde devient négatif et le compte est bloqué (D7)", async () => {
    const org = await newOrg();
    const inv = await paidSubscription(org, "sub_r5");
    await spend(org.id, 8_000_000n);
    await processStripeEvent(
      deps(),
      buildEvent("charge.refunded", subCharge(inv, 4_900), {
        created: EVT_TIME + 10,
      }),
    );
    const acct = await getAccount(t.db, org.id);
    expect(acct.balanceMicro).toBe(-8_000_000n);
    expect(acct.blocked).toBe(true);
  });

  it("le lien paiement peut arriver avant la facture", async () => {
    const org = await newOrg();
    const inv = invoice(org, "sub_r6");
    await processStripeEvent(
      deps(),
      buildEvent("invoice_payment.paid", invoicePayment(inv), {
        created: EVT_TIME,
      }),
    );
    await processStripeEvent(
      deps(),
      buildEvent("invoice.paid", inv, { created: EVT_TIME + 1 }),
    );
    await processStripeEvent(
      deps(),
      buildEvent("charge.refunded", subCharge(inv, 4_900), {
        created: EVT_TIME + 10,
      }),
    );
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(0n);
  });

  it("le lien paiement par une charge (sans PaymentIntent) permet aussi la reprise", async () => {
    const org = await newOrg();
    const inv = invoice(org, "sub_r7");
    await processStripeEvent(
      deps(),
      buildEvent("invoice.paid", inv, { created: EVT_TIME }),
    );
    await processStripeEvent(
      deps(),
      buildEvent(
        "invoice_payment.paid",
        invoicePayment(inv, { payment: { type: "charge", charge: "ch_old" } }),
        { created: EVT_TIME },
      ),
    );
    await processStripeEvent(
      deps(),
      buildEvent(
        "charge.refunded",
        {
          id: "ch_old",
          payment_intent: null,
          amount: 4_900,
          amount_refunded: 4_900,
          currency: "cad",
        },
        { created: EVT_TIME + 10 },
      ),
    );
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(0n);
  });

  it("n'affecte pas un achat de crédits de la même organisation", async () => {
    const org = await newOrg();
    await purchaseFor(org);
    const inv = await paidSubscription(org, "sub_r8");
    await processStripeEvent(
      deps(),
      buildEvent("charge.refunded", subCharge(inv, 4_900), {
        created: EVT_TIME + 10,
      }),
    );
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(100_000_000n);
  });

  it("la relecture de invoice_payment.paid ne crée ni crédit ni débit de plus", async () => {
    const org = await newOrg();
    const inv = await paidSubscription(org, "sub_r9");
    const link = buildEvent("invoice_payment.paid", invoicePayment(inv), {
      created: EVT_TIME + 2,
    });
    await processStripeEvent(deps(), link);
    await processStripeEvent(deps(), link);
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(10_000_000n);
    await processStripeEvent(
      deps(),
      buildEvent("charge.refunded", subCharge(inv, 4_900), {
        created: EVT_TIME + 10,
      }),
    );
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(0n);
  });

  it("anciennes versions d'API : la facture porte son PaymentIntent, sans invoice_payment.paid", async () => {
    const org = await newOrg();
    const inv = invoice(org, "sub_r10");
    await processStripeEvent(
      deps(),
      buildEvent(
        "invoice.paid",
        { ...inv, payment_intent: paymentIntentOf(inv) },
        { created: EVT_TIME },
      ),
    );
    await processStripeEvent(
      deps(),
      buildEvent("charge.refunded", subCharge(inv, 4_900), {
        created: EVT_TIME + 10,
      }),
    );
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(0n);
  });

  it("deux événements simultanés sur le même paiement ne reprennent jamais plus que les crédits accordés", async () => {
    const org = await newOrg();
    const inv = await paidSubscription(org, "sub_r11");
    await Promise.all([
      processStripeEvent(
        deps(),
        buildEvent("charge.refunded", subCharge(inv, 2_450), {
          created: EVT_TIME + 10,
        }),
      ),
      processStripeEvent(
        deps(),
        buildEvent("charge.refunded", subCharge(inv, 4_900), {
          created: EVT_TIME + 11,
        }),
      ),
    ]);
    // Quel que soit l'ordre : au plus 10 $ repris au total (le prorata de 50 % puis le complément).
    const debited = (await listEntries(t.db, org.id))
      .filter((e) => e.kind === "refund")
      .reduce((sum, e) => sum - e.balanceDeltaMicro, 0n);
    expect(debited).toBeLessThanOrEqual(10_000_000n);
    expect(
      (await getAccount(t.db, org.id)).balanceMicro,
    ).toBeGreaterThanOrEqual(0n);
  });
});

describe("I2 : litige sur une facture d'abonnement", () => {
  const subDispute = (
    inv: { id: string },
    over: Record<string, unknown> = {},
  ) => ({
    id: `dp_${inv.id}`,
    charge: `ch_${inv.id}`,
    payment_intent: paymentIntentOf(inv),
    amount: PLAN.priceCents,
    status: "needs_response",
    ...over,
  });

  it("l'ouverture d'un litige reprend les crédits inclus, une seule fois", async () => {
    const org = await newOrg();
    const inv = await paidSubscription(org, "sub_d1");
    const event = buildEvent("charge.dispute.created", subDispute(inv), {
      created: EVT_TIME + 10,
    });
    await processStripeEvent(deps(), event);
    await processStripeEvent(deps(), event);
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(0n);
    expect(
      (await listEntries(t.db, org.id)).filter((e) => e.kind === "dispute"),
    ).toHaveLength(1);
  });

  it("crédits consommés : solde négatif ; litige gagné : crédits restitués avec la même échéance", async () => {
    const org = await newOrg();
    const inv = await paidSubscription(org, "sub_d2");
    await spend(org.id, 8_000_000n);
    await processStripeEvent(
      deps(),
      buildEvent("charge.dispute.created", subDispute(inv), {
        created: EVT_TIME + 10,
      }),
    );
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(-8_000_000n);
    await processStripeEvent(
      deps(),
      buildEvent("charge.dispute.closed", subDispute(inv, { status: "won" }), {
        created: EVT_TIME + 99,
      }),
    );
    const entries = await listEntries(t.db, org.id);
    const back = entries.find((e) => e.source === "dispute_reversal");
    expect(back?.balanceDeltaMicro).toBe(10_000_000n);
    expect(back?.expiresAt?.getTime()).toBe((EVT_TIME + 30 * 86_400) * 1000);
    // Les 8 $ consommés restent consommés : seuls les crédits retirés reviennent.
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(2_000_000n);
  });

  it("un litige perdu ne retire rien de plus", async () => {
    const org = await newOrg();
    const inv = await paidSubscription(org, "sub_d3");
    await processStripeEvent(
      deps(),
      buildEvent("charge.dispute.created", subDispute(inv), {
        created: EVT_TIME + 10,
      }),
    );
    await processStripeEvent(
      deps(),
      buildEvent("charge.dispute.closed", subDispute(inv, { status: "lost" }), {
        created: EVT_TIME + 99,
      }),
    );
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(0n);
  });

  it("remboursement puis litige sur la même facture : plafonné aux crédits inclus", async () => {
    const org = await newOrg();
    const inv = await paidSubscription(org, "sub_d4");
    await processStripeEvent(
      deps(),
      buildEvent("charge.refunded", subCharge(inv, 2_450), {
        created: EVT_TIME + 10,
      }),
    );
    await processStripeEvent(
      deps(),
      buildEvent("charge.dispute.created", subDispute(inv), {
        created: EVT_TIME + 20,
      }),
    );
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(0n);
  });
});

describe("M4 : les crédits inclus ne s'accordent que sur une facture payée", () => {
  it("une facture d'abonnement à 0 $ (solde client, rabais total) n'accorde rien", async () => {
    const org = await newOrg();
    await processStripeEvent(
      deps(),
      buildEvent("invoice.paid", invoice(org, "sub_m1", { amount_paid: 0 }), {
        created: EVT_TIME,
      }),
    );
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(0n);
    // L'abonnement est tout de même actif : seuls les crédits dépendent du paiement.
    expect((await subRow(org.id))?.status).toBe("active");
  });

  it("un montant payé absent de la facture n'accorde rien", async () => {
    const org = await newOrg();
    const { amount_paid: _omit, ...inv } = invoice(org, "sub_m2");
    await processStripeEvent(
      deps(),
      buildEvent("invoice.paid", inv, { created: EVT_TIME }),
    );
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(0n);
  });

  it("annuler puis se réabonner : seul le nouvel abonnement payé accorde des crédits", async () => {
    const org = await newOrg();
    await paidSubscription(org, "sub_m3a");
    await processStripeEvent(
      deps(),
      buildEvent(
        "customer.subscription.deleted",
        subscriptionObject(org, "sub_m3a", { status: "canceled" }),
        { created: EVT_TIME + 100 },
      ),
    );
    // Réabonnement couvert par un solde client : facture à 0 $, pas de nouveaux crédits.
    await processStripeEvent(
      deps(),
      buildEvent("invoice.paid", invoice(org, "sub_m3b", { amount_paid: 0 }), {
        created: EVT_TIME + 200,
      }),
    );
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(10_000_000n);
    // Réabonnement réellement payé : les crédits sont accordés.
    await processStripeEvent(
      deps(),
      buildEvent("invoice.paid", invoice(org, "sub_m3c"), {
        created: EVT_TIME + 300,
      }),
    );
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(20_000_000n);
  });
});

describe("types d'événements non gérés", () => {
  it("ne sont ni traités ni enregistrés", async () => {
    const event = buildEvent("customer.created", { id: "cus_x" });
    const out = await processStripeEvent(deps(), event);
    expect(out.status).toBe("ignored");
    expect(
      await t.db
        .select()
        .from(processedEvents)
        .where(eq(processedEvents.eventId, event.id)),
    ).toHaveLength(0);
  });
});

describe("cohérence globale", () => {
  it("après tous ces événements, chaque compte égale la somme de ses écritures", async () => {
    const orgs = await t.db.select().from(organizations);
    for (const o of orgs) {
      const derived = await deriveBalance(t.db, o.id);
      const acct = await getAccount(t.db, o.id);
      expect(derived).toEqual({
        balanceMicro: acct.balanceMicro,
        heldMicro: acct.heldMicro,
      });
    }
    // Les écritures d'achat ne portent pas de montant sans achat associé.
    const orphan = await t.db
      .select()
      .from(creditEntries)
      .where(and(eq(creditEntries.source, "purchase")));
    for (const e of orphan) expect(e.externalRef).toMatch(/^cs_/);
  });
});

describe("codes promo : enregistrement des utilisations", () => {
  async function promo(
    code: string,
    stripePromotionCodeId: string | null = null,
  ) {
    const [row] = await t.db
      .insert(promoCodes)
      .values({
        code,
        kind: "percent",
        percentOff: 20,
        scopes: ["credits", "subscriptions", "vps"],
        stripePromotionCodeId,
      })
      .returning();
    return row!;
  }

  it("un achat de crédits avec un code enregistre l'utilisation et le rabais, une seule fois même si l'événement est rejoué", async () => {
    const org = await newOrg();
    const p = await promo(`WH-${org.n}`);
    const session = creditSession(org, {
      amount_subtotal: 10_000,
      amount_total: 9_200,
      total_details: { amount_tax: 1_200, amount_discount: 2_000 },
      metadata: {
        kind: "credits",
        organization_id: org.id,
        promo_code_id: p.id,
      },
    });
    const evt = buildEvent("checkout.session.completed", session, {
      created: EVT_TIME,
    });
    await processStripeEvent(deps(), evt);
    await processStripeEvent(deps(), evt);
    const rows = await t.db
      .select()
      .from(promoRedemptions)
      .where(eq(promoRedemptions.promoCodeId, p.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organizationId: org.id,
      scope: "credits",
      source: "stripe",
      discountCents: 2_000,
      stripeSessionId: session.id,
    });
    // les crédits valent toujours le montant avant rabais et taxes
    expect((await getAccount(t.db, org.id)).balanceMicro).toBe(100_000_000n);
  });

  it("un abonnement (essai ou rabais) enregistre l'utilisation à la fin de la session", async () => {
    const org = await newOrg();
    const p = await promo(`WS-${org.n}`);
    await processStripeEvent(
      deps(),
      buildEvent(
        "checkout.session.completed",
        {
          id: `cs_sub_${org.n}`,
          mode: "subscription",
          payment_status: "no_payment_required",
          client_reference_id: org.id,
          customer: org.customer,
          subscription: `sub_${org.n}`,
          total_details: { amount_discount: 0 },
          metadata: {
            kind: "subscription",
            organization_id: org.id,
            plan_code: "workstudio-pro",
            promo_code_id: p.id,
          },
        },
        { created: EVT_TIME },
      ),
    );
    const [r] = await t.db
      .select()
      .from(promoRedemptions)
      .where(eq(promoRedemptions.promoCodeId, p.id));
    expect(r).toMatchObject({
      scope: "subscriptions",
      stripeSubscriptionId: `sub_${org.n}`,
      discountCents: 0,
    });
  });

  it("un code saisi sur la page Stripe est retrouvé par son code de promotion Stripe (résolution facultative)", async () => {
    const org = await newOrg();
    const p = await promo(`WP-${org.n}`, `promo_page_${org.n}`);
    const resolve = vi.fn(async () => `promo_page_${org.n}`);
    await processStripeEvent(
      deps({ resolveSessionPromotion: resolve }),
      buildEvent(
        "checkout.session.completed",
        creditSession(org, {
          total_details: { amount_tax: 1_000, amount_discount: 1_000 },
          amount_total: 10_000,
        }),
        { created: EVT_TIME },
      ),
    );
    expect(resolve).toHaveBeenCalledTimes(1);
    const rows = await t.db
      .select()
      .from(promoRedemptions)
      .where(eq(promoRedemptions.promoCodeId, p.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.discountCents).toBe(1_000);
  });

  it("sans rabais ni code : rien n'est enregistré et la résolution n'est pas appelée ; un échec de résolution ne bloque jamais le paiement", async () => {
    const org = await newOrg();
    const resolve = vi.fn(async () => {
      throw new Error("réseau");
    });
    await processStripeEvent(
      deps({ resolveSessionPromotion: resolve }),
      buildEvent("checkout.session.completed", creditSession(org), {
        created: EVT_TIME,
      }),
    );
    expect(resolve).not.toHaveBeenCalled();
    const org2 = await newOrg();
    const out = await processStripeEvent(
      deps({ resolveSessionPromotion: resolve }),
      buildEvent(
        "checkout.session.completed",
        creditSession(org2, {
          total_details: { amount_tax: 1_000, amount_discount: 500 },
        }),
        { created: EVT_TIME },
      ),
    );
    expect(out.status).toBe("processed");
    expect((await getAccount(t.db, org2.id)).balanceMicro).toBe(100_000_000n);
  });
});
