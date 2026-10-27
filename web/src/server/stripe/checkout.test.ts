import { randomBytes } from "node:crypto";
import { billingCustomers, eq, organizations } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SubscriptionPlan } from "../billing/plans";
import { DEFAULT_BILLING_CONFIG } from "../ledger/config";
import {
  CheckoutError,
  createCreditCheckout,
  createPortalSession,
  createSubscriptionCheckout,
} from "./checkout";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

async function newOrg() {
  const id = `org_${randomBytes(5).toString("hex")}`;
  await t.db.insert(organizations).values({ id, name: id, slug: id });
  return id;
}

function fakeStripe() {
  const customers = {
    create: vi.fn(async (_p: unknown, _o?: unknown) => ({
      id: `cus_${randomBytes(4).toString("hex")}`,
    })),
  };
  const sessions = {
    create: vi.fn(async (_p: unknown, _o?: unknown) => ({
      id: "cs_test_1",
      url: "https://checkout.stripe.test/c/pay/cs_test_1",
    })),
  };
  const portal = {
    create: vi.fn(async (_p: unknown) => ({
      url: "https://billing.stripe.test/p/session/xyz",
    })),
  };
  return {
    customers,
    sessions,
    portal,
    client: {
      customers,
      checkout: { sessions },
      billingPortal: { sessions: portal },
    } as never,
  };
}

const PLAN: SubscriptionPlan = {
  id: "p1",
  code: "workstudio-pro",
  kind: "workstudio",
  interval: "month",
  priceCents: 4900,
  includedCreditsCents: 1000,
  stripeProductId: "prod_1",
  stripePriceId: "price_pro",
  translations: {},
};

const base = (stripe: ReturnType<typeof fakeStripe>) => ({
  db: t.db,
  stripe: stripe.client,
  config: DEFAULT_BILLING_CONFIG,
  siteUrl: "https://nexora.test",
});

describe("achat de crédits (paiement unique)", () => {
  it("crée une session Checkout avec Stripe Tax, adresse requise et montant avant taxes", async () => {
    const stripe = fakeStripe();
    const org = await newOrg();
    const out = await createCreditCheckout(base(stripe), {
      organizationId: org,
      amountCents: 5000,
      lang: "fr",
      productName: "Crédits Nexora",
      email: "client@example.com",
    });
    expect(out.url).toContain("checkout.stripe.test");
    const params = stripe.sessions.create.mock.calls[0]?.[0] as Record<
      string,
      any
    >;
    expect(params).toMatchObject({
      mode: "payment",
      automatic_tax: { enabled: true },
      billing_address_collection: "required",
      client_reference_id: org,
      locale: "fr-CA",
      customer_update: { address: "auto", name: "auto" },
      tax_id_collection: { enabled: true },
      invoice_creation: { enabled: true },
    });
    expect(params.line_items).toEqual([
      {
        quantity: 1,
        price_data: {
          currency: "cad",
          unit_amount: 5000,
          tax_behavior: "exclusive",
          product_data: { name: "Crédits Nexora" },
        },
      },
    ]);
    expect(params.metadata).toMatchObject({
      kind: "credits",
      organization_id: org,
      credits_cents: "5000",
    });
    expect(params.metadata.config_version).toMatch(/^cfg_/);
    expect(params.success_url).toBe(
      "https://nexora.test/compte?achat=ok&session_id={CHECKOUT_SESSION_ID}",
    );
    expect(params.cancel_url).toBe("https://nexora.test/compte?achat=annule");
  });

  it("en anglais : adresses sous /en et langue de la page de paiement", async () => {
    const stripe = fakeStripe();
    const org = await newOrg();
    await createCreditCheckout(base(stripe), {
      organizationId: org,
      amountCents: 2000,
      lang: "en",
      productName: "Nexora credits",
    });
    const params = stripe.sessions.create.mock.calls[0]?.[0] as Record<
      string,
      any
    >;
    expect(params.locale).toBe("en");
    expect(params.success_url).toContain("https://nexora.test/en/compte?");
  });

  it("refuse un montant hors bornes, non entier ou non numérique", async () => {
    const stripe = fakeStripe();
    const org = await newOrg();
    for (const amountCents of [0, 999, 500_001, 10.5, Number.NaN, -1000]) {
      await expect(
        createCreditCheckout(base(stripe), {
          organizationId: org,
          amountCents,
          lang: "fr",
          productName: "x",
        }),
      ).rejects.toMatchObject({ code: "invalid_amount" });
    }
    expect(stripe.sessions.create).not.toHaveBeenCalled();
  });

  it("crée un seul client Stripe par organisation, même en concurrence", async () => {
    const stripe = fakeStripe();
    const org = await newOrg();
    const ids = await Promise.all(
      Array.from({ length: 5 }, () =>
        createCreditCheckout(base(stripe), {
          organizationId: org,
          amountCents: 1000,
          lang: "fr",
          productName: "x",
        }),
      ),
    );
    expect(ids).toHaveLength(5);
    const rows = await t.db
      .select()
      .from(billingCustomers)
      .where(eq(billingCustomers.organizationId, org));
    expect(rows).toHaveLength(1);
    // Chaque appel de création porte la clé d'idempotence de l'organisation.
    for (const call of stripe.customers.create.mock.calls)
      expect(call[1]).toEqual({ idempotencyKey: `customer:${org}` });
    // Toutes les sessions utilisent le même client.
    const used = new Set(
      stripe.sessions.create.mock.calls.map(
        (c) => (c[0] as { customer: string }).customer,
      ),
    );
    expect(used.size).toBe(1);
  });
});

describe("abonnement (séparé des crédits)", () => {
  it("crée une session en mode subscription avec le prix Stripe du plan, taxes et adresse requises", async () => {
    const stripe = fakeStripe();
    const org = await newOrg();
    await createSubscriptionCheckout(base(stripe), {
      organizationId: org,
      plan: PLAN,
      lang: "fr",
    });
    const params = stripe.sessions.create.mock.calls[0]?.[0] as Record<
      string,
      any
    >;
    expect(params).toMatchObject({
      mode: "subscription",
      automatic_tax: { enabled: true },
      billing_address_collection: "required",
      client_reference_id: org,
      line_items: [{ price: "price_pro", quantity: 1 }],
      metadata: {
        kind: "subscription",
        organization_id: org,
        plan_code: "workstudio-pro",
      },
      subscription_data: {
        metadata: { organization_id: org, plan_code: "workstudio-pro" },
      },
    });
    expect(params.invoice_creation).toBeUndefined();
    expect(params.success_url).toContain("abonnement=ok");
  });

  it("refuse un plan non synchronisé avec Stripe (aucun prix Stripe)", async () => {
    const stripe = fakeStripe();
    const org = await newOrg();
    await expect(
      createSubscriptionCheckout(base(stripe), {
        organizationId: org,
        plan: { ...PLAN, stripePriceId: null },
        lang: "fr",
      }),
    ).rejects.toMatchObject({ code: "plan_not_synced" });
  });
});

describe("portail client", () => {
  it("ouvre le portail du client Stripe de l'organisation", async () => {
    const stripe = fakeStripe();
    const org = await newOrg();
    await createCreditCheckout(base(stripe), {
      organizationId: org,
      amountCents: 1000,
      lang: "fr",
      productName: "x",
    });
    const out = await createPortalSession(base(stripe), {
      organizationId: org,
      lang: "en",
    });
    expect(out.url).toContain("billing.stripe.test");
    const params = stripe.portal.create.mock.calls[0]?.[0] as Record<
      string,
      any
    >;
    expect(params.return_url).toBe("https://nexora.test/en/compte");
    expect(params.customer).toMatch(/^cus_/);
  });

  it("refuse si l'organisation n'a encore aucun client Stripe", async () => {
    const stripe = fakeStripe();
    const org = await newOrg();
    await expect(
      createPortalSession(base(stripe), { organizationId: org, lang: "fr" }),
    ).rejects.toBeInstanceOf(CheckoutError);
    expect(stripe.portal.create).not.toHaveBeenCalled();
  });
});
