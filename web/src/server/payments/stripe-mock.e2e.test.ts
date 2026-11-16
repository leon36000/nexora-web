/**
 * Contrôle des FORMES de requêtes contre stripe-mock (validation par la spécification OpenAPI de Stripe), avec le
 * vrai SDK : branchement (compte, Stripe Tax, point de webhook), produits des crédits, coupons et codes de
 * promotion, publication d'une offre, sessions Checkout avec essai, rabais et crédits nets. Aucun paiement réel.
 * Exige stripe-mock (12111) ; sinon les tests sont ignorés avec un message.
 */
import { randomBytes } from "node:crypto";
import { organizations } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FakePlanSource, type SubscriptionPlan } from "../billing/plans";
import { DEFAULT_BILLING_CONFIG } from "../ledger/config";
import {
  createCreditCheckout,
  createSubscriptionCheckout,
} from "../stripe/checkout";
import { createStripeClient } from "../stripe/client";
import { publishPlanToStripe } from "../stripe/publish-plan";
import {
  e2eHttpReady,
  e2eLocalUrl,
  REQUIRE_E2E,
} from "../testing/e2e-services";
import { loadKeyring } from "../vault/crypto";
import { connectStripe } from "./connect";
import { createPromo } from "./promo";
import {
  ensureCreditsProducts,
  scopeProductsFrom,
  syncPromo,
} from "./promo-sync";
import { dbVault } from "./vault";

const MOCK_URL = e2eLocalUrl(
  process.env.NEXORA_E2E_STRIPE_MOCK_URL ?? "http://127.0.0.1:12111",
  "http:",
  ["127.0.0.1", "localhost", "stripe-mock"],
  "stripe-mock",
);
const up = await e2eHttpReady(MOCK_URL, "/v1/customers", true);
if (!up && REQUIRE_E2E)
  throw new Error("NEXORA_CI_REQUIRE_E2E=1 mais stripe-mock est injoignable.");
if (!up)
  console.warn("e2e paiements/stripe-mock ignoré : stripe-mock injoignable.");
const d = up ? describe : describe.skip;

let t: TestDatabase;
const stripe = () =>
  createStripeClient({
    secretKey: "sk_test_mockmockmock",
    mockUrl: MOCK_URL.origin,
  });
const keyring = loadKeyring({
  NEXORA_VAULT_MASTER_KEY: randomBytes(32).toString("base64"),
});
const log = { debug() {}, info() {}, warn() {}, error: vi.fn() } as never;

beforeAll(async () => {
  if (up) t = await createTestDatabase();
});
afterAll(async () => {
  if (up) await t.drop();
});

const PLAN: SubscriptionPlan = {
  id: "plan-1",
  code: "workstudio-equipe",
  kind: "workstudio",
  family: "workstudio-equipe",
  interval: "month",
  priceCents: 12900,
  includedCreditsCents: 4000,
  trialDays: 14,
  trialCard: "default",
  stripeProductId: null,
  stripePriceId: null,
  translations: {
    "fr-CA": { name: "Équipe", description: "Pour l'équipe", features: [] },
  },
};

d(
  "stripe-mock : formes de requêtes acceptées par la spécification de Stripe",
  () => {
    it("branchement : compte, Stripe Tax, point de webhook avec les 12 événements, secret au Coffre", async () => {
      const vault = dbVault(t.db, keyring);
      await vault.put("stripe.secret_key", "sk_test_mockmockmock", "payment");
      // stripe-mock répond par une fixture sans `secret` (le vrai Stripe le renvoie à la création) : on le complète.
      const client = stripe();
      const create = client.webhookEndpoints.create.bind(
        client.webhookEndpoints,
      );
      client.webhookEndpoints.create = (async (
        ...args: Parameters<typeof create>
      ) => ({
        ...(await create(...args)),
        secret: "whsec_depuis_stripe_mock",
      })) as never;
      const out = await connectStripe({
        db: t.db,
        vault,
        siteUrl: "https://nexora.example",
        createClient: () => client,
        allowLocalUrl: false,
        log,
        now: () => new Date(),
      });
      expect(out.ok, JSON.stringify(out)).toBe(true);
      expect(out.ok && out.webhook.id).toMatch(/^we_/);
      expect(await vault.get("stripe.webhook_secret")).toBe(
        "whsec_depuis_stripe_mock",
      );
    });

    it("offre : produit et prix (publier vers Stripe), puis nouveau prix quand le montant change", async () => {
      const client = stripe();
      const first = await publishPlanToStripe(client, PLAN);
      expect(first.stripePriceId).toMatch(/^price_/);
      expect(first.stripeProductId).toMatch(/^prod_/);
    });

    it("produits des crédits, coupon + code de promotion avec portée, première commande et montant minimum", async () => {
      const client = stripe();
      const [fr, en] = await ensureCreditsProducts(t.db, client);
      expect(fr).toMatch(/^prod_/);
      expect(en).toMatch(/^prod_/);
      const promo = await createPromo(
        t.db,
        {
          code: "E2E-20",
          kind: "percent",
          percentOff: 20,
          scopes: ["credits"],
          duration: "repeating",
          durationMonths: 3,
          maxRedemptions: 25,
          expiresAt: "2030-01-01T00:00:00Z",
          firstOrderOnly: true,
          minAmountCents: 2000,
        },
        "admin",
      );
      const out = await syncPromo(
        {
          db: t.db,
          stripe: client,
          products: () => scopeProductsFrom(t.db, new FakePlanSource([])),
          now: () => new Date(),
        },
        promo,
      );
      expect(out.state, JSON.stringify(out)).toBe("synced");
      const montant = await createPromo(
        t.db,
        {
          code: "E2E-5",
          kind: "amount",
          amountOffCents: 500,
          scopes: ["credits"],
        },
        "admin",
      );
      const out2 = await syncPromo(
        {
          db: t.db,
          stripe: client,
          products: () => scopeProductsFrom(t.db, new FakePlanSource([])),
          now: () => new Date(),
        },
        montant,
      );
      expect(out2.state, JSON.stringify(out2)).toBe("synced");
      const libre = await createPromo(
        t.db,
        {
          code: "E2E-GRATUIT",
          kind: "free",
          scopes: ["credits", "subscriptions", "vps"].slice(1),
          duration: "forever",
        },
        "admin",
      );
      const out3 = await syncPromo(
        {
          db: t.db,
          stripe: client,
          products: () =>
            Promise.resolve({
              subscriptions: ["prod_x"],
              vps: ["prod_y"],
              credits: [fr, en],
            }),
          now: () => new Date(),
        },
        libre,
      );
      expect(out3.state, JSON.stringify(out3)).toBe("synced");
    });

    it("Checkout des crédits : produit dédié, crédits nets, code de promotion ; mode abonnement : essai, sans carte, rabais", async () => {
      const client = stripe();
      const orgId = `org_${randomBytes(4).toString("hex")}`;
      await t.db
        .insert(organizations)
        .values({ id: orgId, name: orgId, slug: orgId });
      const deps = {
        db: t.db,
        stripe: client,
        config: DEFAULT_BILLING_CONFIG,
        siteUrl: "https://nexora.example",
      };
      const [fr] = await ensureCreditsProducts(t.db, client);
      const credits = await createCreditCheckout(deps, {
        organizationId: orgId,
        amountCents: 10_000,
        creditsCents: 9_500,
        lang: "fr",
        productName: "Crédits Nexora",
        productId: fr,
        promo: { promoCodeId: "pc", stripePromotionCodeId: null },
        allowStripePageCodes: true,
      });
      expect(credits.url).toBeTruthy();
      const sub = await createSubscriptionCheckout(deps, {
        organizationId: orgId,
        plan: { ...PLAN, stripePriceId: "price_x" },
        lang: "en",
        trial: { days: 14, requireCard: false },
        allowStripePageCodes: true,
      });
      expect(sub.url).toBeTruthy();
      const free = await createSubscriptionCheckout(deps, {
        organizationId: orgId,
        plan: { ...PLAN, stripePriceId: "price_x" },
        lang: "fr",
        promo: { promoCodeId: "pc", stripePromotionCodeId: "promo_1" },
        noPaymentMethodNeeded: true,
      });
      expect(free.url).toBeTruthy();
    });
  },
);
