import { randomBytes } from "node:crypto";
import {
  billingCustomers,
  eq,
  getAccount,
  organizations,
  processedEvents,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FakePlanSource } from "../billing/plans";
import { DEFAULT_BILLING_CONFIG } from "../ledger/config";
import { buildEvent, TEST_WEBHOOK_SECRET, webhookRequest } from "./testing";
import { handleStripeWebhook, type WebhookRouteDeps } from "./webhook-route";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

const log = { debug() {}, info() {}, warn: vi.fn(), error: vi.fn() } as never;

function deps(over: Partial<WebhookRouteDeps> = {}): WebhookRouteDeps {
  return {
    webhookSecret: async () => TEST_WEBHOOK_SECRET,
    process: {
      db: t.db,
      plans: new FakePlanSource([]),
      config: DEFAULT_BILLING_CONFIG,
      log,
    },
    log,
    ...over,
  };
}

async function org() {
  const id = `org_${randomBytes(5).toString("hex")}`;
  await t.db.insert(organizations).values({ id, name: id, slug: id });
  await t.db
    .insert(billingCustomers)
    .values({ organizationId: id, stripeCustomerId: `cus_${id}` });
  return id;
}

const session = (orgId: string) => ({
  id: `cs_${randomBytes(4).toString("hex")}`,
  mode: "payment",
  payment_status: "paid",
  client_reference_id: orgId,
  customer: `cus_${orgId}`,
  payment_intent: `pi_${randomBytes(4).toString("hex")}`,
  amount_subtotal: 5000,
  amount_total: 5749,
  currency: "cad",
  total_details: { amount_tax: 749 },
  metadata: { kind: "credits", organization_id: orgId },
});

describe("POST /api/stripe/webhook", () => {
  it("accepte un événement correctement signé et crédite le compte", async () => {
    const id = await org();
    const res = await handleStripeWebhook(
      webhookRequest(buildEvent("checkout.session.completed", session(id))),
      deps(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      received: true,
      status: "processed",
    });
    expect((await getAccount(t.db, id)).balanceMicro).toBe(50_000_000n);
  });

  it("rejouer exactement la même requête signée ne double rien", async () => {
    const id = await org();
    const event = buildEvent("checkout.session.completed", session(id));
    const first = await handleStripeWebhook(webhookRequest(event), deps());
    const replay = await handleStripeWebhook(webhookRequest(event), deps());
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ status: "duplicate" });
    expect((await getAccount(t.db, id)).balanceMicro).toBe(50_000_000n);
  });

  it("refuse une signature invalide (400) sans rien traiter", async () => {
    const id = await org();
    const event = buildEvent("checkout.session.completed", session(id));
    const res = await handleStripeWebhook(
      webhookRequest(event, { secret: "whsec_autre_secret" }),
      deps(),
    );
    expect(res.status).toBe(400);
    expect((await getAccount(t.db, id)).balanceMicro).toBe(0n);
    expect(
      await t.db
        .select()
        .from(processedEvents)
        .where(eq(processedEvents.eventId, event.id)),
    ).toHaveLength(0);
  });

  it("refuse un corps modifié après signature", async () => {
    const id = await org();
    const event = buildEvent("checkout.session.completed", session(id));
    const signed = webhookRequest(event);
    const tampered = new Request(signed.url, {
      method: "POST",
      headers: signed.headers,
      body: (await signed.text()).replace("5000", "9999999"),
    });
    const res = await handleStripeWebhook(tampered, deps());
    expect(res.status).toBe(400);
    expect((await getAccount(t.db, id)).balanceMicro).toBe(0n);
  });

  it("refuse sans en-tête de signature", async () => {
    const res = await handleStripeWebhook(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        body: "{}",
      }),
      deps(),
    );
    expect(res.status).toBe(400);
  });

  it("refuse une signature trop ancienne (rejeu d'une capture)", async () => {
    const id = await org();
    const event = buildEvent("checkout.session.completed", session(id));
    const payload = JSON.stringify(event);
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: TEST_WEBHOOK_SECRET,
      timestamp: Math.floor(Date.now() / 1000) - 3600,
    });
    const res = await handleStripeWebhook(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: payload,
      }),
      deps(),
    );
    expect(res.status).toBe(400);
  });

  it("répond 503 si le secret de signature n'est pas configuré (échoue fermé)", async () => {
    const res = await handleStripeWebhook(
      webhookRequest(buildEvent("customer.created", { id: "cus_1" })),
      deps({
        webhookSecret: async () => {
          throw new Error("absent");
        },
      }),
    );
    expect(res.status).toBe(503);
  });

  it("refuse un événement en mode production (livemode) tant que les paiements réels sont désactivés", async () => {
    const event = buildEvent("checkout.session.completed", session("org_x"));
    (event as { livemode: boolean }).livemode = true;
    const res = await handleStripeWebhook(webhookRequest(event), deps());
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "livemode_refused" });
  });

  it("accepte un événement livemode quand le fondateur a autorisé les paiements réels", async () => {
    const id = await org();
    const event = buildEvent("checkout.session.completed", session(id));
    (event as { livemode: boolean }).livemode = true;
    const res = await handleStripeWebhook(
      webhookRequest(event),
      deps({ liveAllowed: async () => true }),
    );
    expect(res.status).toBe(200);
  });

  it("un événement de test reste accepté quand les paiements réels sont autorisés, et la lecture du réglage qui échoue refuse le livemode", async () => {
    const event = buildEvent("checkout.session.completed", session("org_x"));
    (event as { livemode: boolean }).livemode = true;
    const res = await handleStripeWebhook(
      webhookRequest(event),
      deps({
        liveAllowed: async () => {
          throw new Error("base indisponible");
        },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("refuse les autres méthodes que POST", async () => {
    const res = await handleStripeWebhook(
      new Request("http://localhost/api/stripe/webhook", { method: "GET" }),
      deps(),
    );
    expect(res.status).toBe(405);
  });

  it("répond 500 (Stripe renverra) quand le traitement échoue, sans fuite d'information", async () => {
    const id = await org();
    const boom = deps({
      process: {
        db: t.db,
        plans: {
          listPublished: async () => [],
          getByCode: async () => {
            throw new Error("secret interne");
          },
          getByPriceId: async () => {
            throw new Error("secret interne");
          },
        },
        config: DEFAULT_BILLING_CONFIG,
        log,
      },
    });
    const inv = {
      id: "in_boom",
      customer: `cus_${id}`,
      billing_reason: "subscription_create",
      parent: {
        subscription_details: {
          subscription: "sub_boom",
          metadata: { organization_id: id, plan_code: "x" },
        },
      },
      lines: { data: [] },
    };
    const res = await handleStripeWebhook(
      webhookRequest(buildEvent("invoice.paid", inv)),
      boom,
    );
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("secret interne");
  });

  it("répond 200 aux types d'événements non gérés", async () => {
    const res = await handleStripeWebhook(
      webhookRequest(buildEvent("customer.created", { id: "cus_1" })),
      deps(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ignored" });
  });
});
