/**
 * Démonstration de bout en bout (jalon S4), SANS paiement réel :
 *   inscription (courriel réel vers Mailpit) → vérification → connexion → achat de crédits
 *   (Checkout créé chez stripe-mock) → webhook SIGNÉ → solde crédité → webhook rejoué : rien ne
 *   double → remboursement : débit → 20 réservations concurrentes : jamais de dépassement.
 *
 * Exige la pile de développement (PostgreSQL, Mailpit 8026/1026, stripe-mock 12111). Sans elle,
 * le test est ignoré avec un message explicite (la pile fait partie de `bun run check`).
 */
import { randomBytes } from "node:crypto";
import {
  billingCustomers,
  creditEntries,
  creditPurchases,
  deriveBalance,
  eq,
  getAccount,
  listEntries,
  releaseReservation,
  reserve,
  settleReservation,
  users,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuth, createSmtpMailer, type NexoraAuth } from "../auth/index";
import { DEFAULT_BILLING_CONFIG } from "../ledger/config";
import { handlePublishPlan } from "../stripe/admin-publish";
import { createStripeClient } from "../stripe/client";
import {
  buildEvent,
  TEST_WEBHOOK_SECRET,
  webhookRequest,
} from "../stripe/testing";
import { handleStripeWebhook } from "../stripe/webhook-route";
import {
  e2eHttpReady,
  e2eLocalUrl,
  e2eSmtpReady,
  REQUIRE_E2E,
} from "../testing/e2e-services";
import {
  type BillingHttpDeps,
  handleCreditsCheckout,
  handlePortal,
  handleSubscribeCheckout,
} from "./http";
import { FakePlanSource, type SubscriptionPlan } from "./plans";

const SITE = "http://localhost:3500";
const MAILPIT_API = e2eLocalUrl(
  process.env.NEXORA_E2E_MAILPIT_API_URL ?? "http://127.0.0.1:8026",
  "http:",
  ["127.0.0.1", "localhost", "mailpit"],
  "Mailpit API",
);
const MAILPIT_SMTP = e2eLocalUrl(
  process.env.NEXORA_E2E_MAILPIT_SMTP_URL ?? "smtp://127.0.0.1:1026",
  "smtp:",
  ["127.0.0.1", "localhost", "mailpit"],
  "Mailpit SMTP",
);
const STRIPE_MOCK = e2eLocalUrl(
  process.env.NEXORA_E2E_STRIPE_MOCK_URL ?? "http://127.0.0.1:12111",
  "http:",
  ["127.0.0.1", "localhost", "stripe-mock"],
  "stripe-mock",
);
const PASSWORD = "un-mot-de-passe-solide-42";
const stackUp =
  (await e2eHttpReady(MAILPIT_API, "/api/v1/info")) &&
  (await e2eSmtpReady(MAILPIT_SMTP)) &&
  (await e2eHttpReady(STRIPE_MOCK, "/v1/customers", true));
if (!stackUp && REQUIRE_E2E)
  throw new Error(
    "NEXORA_CI_REQUIRE_E2E=1 mais Mailpit HTTP/SMTP ou stripe-mock est injoignable.",
  );
if (!stackUp)
  console.warn(
    "e2e S4 ignoré : Mailpit HTTP/SMTP ou stripe-mock injoignable. Démarrer la pile de développement.",
  );

const PLAN: SubscriptionPlan = {
  id: "plan-1",
  code: "workstudio-pro",
  kind: "workstudio",
  interval: "month",
  priceCents: 4900,
  includedCreditsCents: 1000,
  family: "f",
  trialDays: 0,
  trialCard: "default",
  stripeProductId: null,
  stripePriceId: "price_pro_mock",
  translations: {
    "fr-CA": {
      name: "WorkStudio Pro",
      description: "Pour les équipes.",
      features: [],
    },
  },
};

describe.skipIf(!stackUp)(
  "S4 de bout en bout (stripe-mock, Mailpit, webhooks signés)",
  () => {
    let t: TestDatabase;
    let auth: NexoraAuth;
    let deps: BillingHttpDeps;
    const stripeCalls: Array<{ params: Record<string, unknown> }> = [];
    const log = { debug() {}, info() {}, warn() {}, error() {} } as never;

    const email = `e2e-${randomBytes(4).toString("hex")}@example.com`;
    let cookie = "";
    let orgId = "";

    beforeAll(async () => {
      t = await createTestDatabase();
      auth = createAuth({
        db: t.db,
        secret: randomBytes(32).toString("hex"),
        baseURL: SITE,
        mailer: createSmtpMailer({
          url: MAILPIT_SMTP.href,
          from: "Nexora <no-reply@nexora.test>",
        }),
        rateLimit: { enabled: false },
      });
      const stripe = createStripeClient({
        secretKey: "sk_test_e2e",
        mockUrl: STRIPE_MOCK.origin,
      });
      // Enregistre les paramètres envoyés à Stripe : stripe-mock les valide contre le schéma OpenAPI officiel.
      const original = stripe.checkout.sessions.create.bind(
        stripe.checkout.sessions,
      );
      (stripe.checkout.sessions as { create: unknown }).create = (
        params: Record<string, unknown>,
      ) => {
        stripeCalls.push({ params });
        return (original as (p: unknown) => unknown)(params);
      };
      deps = {
        db: t.db,
        getSession: async (headers) => {
          const s = await auth.api.getSession({ headers });
          if (!s) return null;
          return {
            userId: s.user.id,
            email: s.user.email,
            activeOrganizationId:
              (s.session as { activeOrganizationId?: string | null })
                .activeOrganizationId ?? null,
          };
        },
        stripe: async () => stripe,
        plans: () => new FakePlanSource([PLAN]),
        config: DEFAULT_BILLING_CONFIG,
        siteUrl: SITE,
        productName: () => "Crédits Nexora",
        log,
      };
    });
    afterAll(async () => {
      await t.drop();
    });

    const authCall = (path: string, body?: unknown, extraCookie?: string) =>
      auth.handler(
        new Request(`${SITE}/api/auth${path}`, {
          method: body ? "POST" : "GET",
          headers: {
            "content-type": "application/json",
            origin: SITE,
            ...(extraCookie ? { cookie: extraCookie } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        }),
      );

    const billingPost = (path: string, fields: Record<string, string>) =>
      new Request(`${SITE}${path}`, {
        method: "POST",
        headers: {
          origin: SITE,
          cookie,
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(fields),
      });

    /** Dernier courriel reçu par Mailpit pour l'adresse (sondage jusqu'à 5 s). */
    async function mailTextFor(to: string): Promise<string> {
      for (let i = 0; i < 25; i++) {
        const search = (await (
          await fetch(
            `${MAILPIT_API.origin}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
          )
        ).json()) as { messages?: Array<{ ID: string }> };
        const id = search.messages?.[0]?.ID;
        if (id) {
          const msg = (await (
            await fetch(`${MAILPIT_API.origin}/api/v1/message/${id}`)
          ).json()) as { Text: string };
          return msg.Text;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      throw new Error("courriel non reçu par Mailpit");
    }

    it("1. inscription : courriel de vérification réellement envoyé (Mailpit), connexion refusée avant vérification", async () => {
      const res = await authCall("/sign-up/email", {
        email,
        password: PASSWORD,
        name: "Camille Tremblay",
        company: "Tremblay et fils",
        locale: "fr",
        callbackURL: "/compte/verification",
      });
      expect(res.status).toBe(200);
      const text = await mailTextFor(email);
      expect(text).toContain("Confirmez votre adresse courriel");
      const link = /https?:\/\/\S+verify-email\S*/.exec(text)?.[0];
      expect(link).toBeDefined();
      const refused = await authCall("/sign-in/email", {
        email,
        password: PASSWORD,
      });
      expect(refused.status).toBe(403);
      // Clic sur le lien reçu.
      const url = new URL(link as string);
      const verified = await auth.handler(
        new Request(`${SITE}${url.pathname}${url.search}`),
      );
      expect([200, 302]).toContain(verified.status);
    });

    it("2. connexion : session avec l'organisation du compte", async () => {
      const res = await authCall("/sign-in/email", {
        email,
        password: PASSWORD,
      });
      expect(res.status).toBe(200);
      cookie = res.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
      const [user] = await t.db
        .select()
        .from(users)
        .where(eq(users.email, email));
      const ctx =
        await t.sql`SELECT organization_id FROM members WHERE user_id = ${user?.id as string}`;
      orgId = ctx[0]?.organization_id as string;
      expect(orgId).toBeTruthy();
    });

    let stripeCustomerId = "";
    let sessionPaymentIntent = "";
    let sessionId = "";
    let totalCents = 0;

    it("3. achat de 50 $ : session Checkout acceptée par stripe-mock (Stripe Tax, adresse requise)", async () => {
      const res = await handleCreditsCheckout(
        billingPost("/api/billing/checkout/credits", {
          amount: "50",
          lang: "fr",
        }),
        deps,
      );
      expect(res.status).toBe(200);
      const { url } = (await res.json()) as { url: string };
      expect(url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
      const sent = stripeCalls.at(-1)?.params as Record<string, any>;
      expect(sent).toMatchObject({
        mode: "payment",
        automatic_tax: { enabled: true },
        billing_address_collection: "required",
        client_reference_id: orgId,
      });
      const [link] = await t.db
        .select()
        .from(billingCustomers)
        .where(eq(billingCustomers.organizationId, orgId));
      expect(link?.stripeCustomerId).toMatch(/^cus_/);
      stripeCustomerId = link?.stripeCustomerId ?? "";
      // Avant le webhook, rien n'est crédité : on ne crédite jamais sur la seule foi du retour navigateur.
      expect((await getAccount(t.db, orgId)).balanceMicro).toBe(0n);

      sessionId = `cs_test_${randomBytes(6).toString("hex")}`;
      sessionPaymentIntent = `pi_${randomBytes(6).toString("hex")}`;
      totalCents = 5749; // 50 $ + TPS 5 % (2,50 $) + TVQ 9,975 % (4,99 $), arrondis par Stripe Tax
    });

    const completedEvent = () => {
      const sent = stripeCalls.at(-1)?.params as {
        metadata: Record<string, string>;
      };
      return buildEvent(
        "checkout.session.completed",
        {
          id: sessionId,
          object: "checkout.session",
          mode: "payment",
          payment_status: "paid",
          status: "complete",
          client_reference_id: orgId,
          customer: stripeCustomerId,
          payment_intent: sessionPaymentIntent,
          amount_subtotal: 5000,
          amount_total: totalCents,
          currency: "cad",
          total_details: { amount_tax: totalCents - 5000 },
          metadata: sent.metadata,
        },
        { id: "evt_e2e_completed_1" },
      );
    };

    it("4. webhook signé : le solde est crédité du montant AVANT taxes", async () => {
      const res = await handleStripeWebhook(webhookRequest(completedEvent()), {
        webhookSecret: async () => TEST_WEBHOOK_SECRET,
        process: {
          db: t.db,
          plans: new FakePlanSource([PLAN]),
          config: DEFAULT_BILLING_CONFIG,
          log,
        },
        log,
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ status: "processed" });
      const acct = await getAccount(t.db, orgId);
      expect(acct.balanceMicro).toBe(50_000_000n);
      const [purchase] = await t.db
        .select()
        .from(creditPurchases)
        .where(eq(creditPurchases.organizationId, orgId));
      expect(purchase).toMatchObject({
        amountSubtotalCents: 5000,
        taxCents: 749,
        amountTotalCents: 5749,
      });
    });

    const route = () => ({
      webhookSecret: async () => TEST_WEBHOOK_SECRET,
      process: {
        db: t.db,
        plans: new FakePlanSource([PLAN]),
        config: DEFAULT_BILLING_CONFIG,
        log,
      },
      log,
    });

    it("5. webhook rejoué (même requête, puis même session sous un nouvel événement) : aucun double crédit", async () => {
      const replay = await handleStripeWebhook(
        webhookRequest(completedEvent()),
        route(),
      );
      expect(await replay.json()).toMatchObject({ status: "duplicate" });
      const again = buildEvent("checkout.session.async_payment_succeeded", {
        ...(JSON.parse(JSON.stringify(completedEvent().data.object)) as object),
      });
      await handleStripeWebhook(webhookRequest(again), route());
      expect((await getAccount(t.db, orgId)).balanceMicro).toBe(50_000_000n);
      expect(
        (await listEntries(t.db, orgId)).filter((e) => e.kind === "credit"),
      ).toHaveLength(1);
    });

    it("6. remboursement total : le grand livre est débité", async () => {
      const event = buildEvent("charge.refunded", {
        id: "ch_e2e_1",
        payment_intent: sessionPaymentIntent,
        amount: totalCents,
        amount_refunded: totalCents,
        currency: "cad",
      });
      const res = await handleStripeWebhook(webhookRequest(event), route());
      expect(res.status).toBe(200);
      expect((await getAccount(t.db, orgId)).balanceMicro).toBe(0n);
      const entries = await listEntries(t.db, orgId);
      expect(entries.map((e) => e.kind)).toEqual(["refund", "credit"]);
      // Rejouer le remboursement ne débite pas deux fois.
      await handleStripeWebhook(webhookRequest(event), route());
      expect((await getAccount(t.db, orgId)).balanceMicro).toBe(0n);
    });

    it("7. 20 réservations concurrentes de 1 $ sur un solde de 10 $ : exactement 10 réussissent, jamais de dépassement", async () => {
      // Nouvel achat de 10 $ par webhook signé.
      const sid = `cs_test_${randomBytes(6).toString("hex")}`;
      const topUp = buildEvent("checkout.session.completed", {
        id: sid,
        mode: "payment",
        payment_status: "paid",
        client_reference_id: orgId,
        customer: stripeCustomerId,
        payment_intent: `pi_${randomBytes(6).toString("hex")}`,
        amount_subtotal: 1000,
        amount_total: 1150,
        currency: "cad",
        total_details: { amount_tax: 150 },
        metadata: { kind: "credits", organization_id: orgId },
      });
      await handleStripeWebhook(webhookRequest(topUp), route());
      expect((await getAccount(t.db, orgId)).balanceMicro).toBe(10_000_000n);

      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          reserve(t.db, {
            organizationId: orgId,
            amountMicro: 1_000_000n,
            idempotencyKey: `e2e:req:${i}`,
            configVersion: "cfg_e2e",
          }),
        ),
      );
      const reserved = results.filter((r) => r.status === "reserved");
      expect(reserved).toHaveLength(10);
      expect(
        results.filter((r) => r.status === "insufficient_funds"),
      ).toHaveLength(10);
      const acct = await getAccount(t.db, orgId);
      expect(acct.heldMicro).toBe(10_000_000n);
      expect(acct.availableMicro).toBe(0n);

      // Règlement de 5 réservations au coût réel (0,40 $), libération des 5 autres.
      for (const [i, r] of reserved.entries()) {
        if (r.status !== "reserved") continue;
        if (i < 5)
          await settleReservation(t.db, {
            organizationId: orgId,
            reservationId: r.reservation.id,
            actualMicro: 400_000n,
          });
        else
          await releaseReservation(t.db, {
            organizationId: orgId,
            reservationId: r.reservation.id,
          });
      }
      const final = await getAccount(t.db, orgId);
      expect(final).toMatchObject({ heldMicro: 0n, balanceMicro: 8_000_000n });
      expect(await deriveBalance(t.db, orgId)).toEqual({
        balanceMicro: 8_000_000n,
        heldMicro: 0n,
      });
    });

    it("8. abonnement (mode séparé), portail client et « Publier vers Stripe » acceptés par stripe-mock", async () => {
      const sub = await handleSubscribeCheckout(
        billingPost("/api/billing/checkout/subscription", {
          plan: "workstudio-pro",
          lang: "fr",
        }),
        deps,
      );
      expect(sub.status).toBe(200);
      expect(stripeCalls.at(-1)?.params).toMatchObject({
        mode: "subscription",
        automatic_tax: { enabled: true },
        line_items: [{ price: "price_pro_mock", quantity: 1 }],
      });
      const portal = await handlePortal(
        billingPost("/api/billing/portal", { lang: "fr" }),
        deps,
      );
      expect(portal.status).toBe(200);
      expect(((await portal.json()) as { url: string }).url).toMatch(
        /^https:\/\//,
      );

      const admin = "a".repeat(40);
      const published = await handlePublishPlan(
        new Request(`${SITE}/api/admin/stripe/publish-plan`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${admin}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ code: "workstudio-pro" }),
        }),
        {
          adminToken: admin,
          plans: new FakePlanSource([{ ...PLAN, stripePriceId: null }]),
          stripe: async () =>
            createStripeClient({
              secretKey: "sk_test_e2e",
              mockUrl: STRIPE_MOCK.origin,
            }),
          log,
        },
      );
      expect(published.status).toBe(200);
      expect(await published.json()).toMatchObject({
        code: "workstudio-pro",
        stripeProductId: expect.stringMatching(/^prod_/),
        stripePriceId: expect.stringMatching(/^price_/),
        priceCreated: true,
      });
    });

    it("9. cohérence finale : solde en cache = somme des écritures ; aucune écriture modifiable", async () => {
      const entries = await t.db
        .select()
        .from(creditEntries)
        .where(eq(creditEntries.organizationId, orgId));
      expect(entries.length).toBeGreaterThan(10);
      expect(await deriveBalance(t.db, orgId)).toEqual({
        balanceMicro: (await getAccount(t.db, orgId)).balanceMicro,
        heldMicro: (await getAccount(t.db, orgId)).heldMicro,
      });
      await expect(
        t.sql`UPDATE credit_entries SET balance_delta_micro = 0 WHERE organization_id = ${orgId}`,
      ).rejects.toThrow(/immuable/);
    });
  },
);
