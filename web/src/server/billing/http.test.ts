import { randomBytes } from "node:crypto";
import {
  billingCustomers,
  eq,
  getAccount,
  members,
  organizations,
  paymentSettings,
  promoCodes,
  promoRedemptions,
  staffAccounts,
  subscriptions,
  users,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_BILLING_CONFIG } from "../ledger/config";
import {
  type BillingHttpDeps,
  handleCreditsCheckout,
  handlePortal,
  handleSubscribeCheckout,
  type SessionInfo,
} from "./http";
import { FakePlanSource, type SubscriptionPlan } from "./plans";

const SITE = "https://nexora.test";
let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

const id = () => randomBytes(6).toString("hex");

async function account(role: "owner" | "member" = "owner", orgId?: string) {
  const userId = id();
  const org = orgId ?? id();
  await t.db
    .insert(users)
    .values({ id: userId, name: "N", email: `${userId}@example.com` });
  if (!orgId)
    await t.db.insert(organizations).values({ id: org, name: org, slug: org });
  await t.db
    .insert(members)
    .values({ id: id(), organizationId: org, userId, role });
  const session: SessionInfo = {
    userId,
    email: `${userId}@example.com`,
    activeOrganizationId: org,
  };
  return { session, orgId: org };
}

const PLAN: SubscriptionPlan = {
  id: "p1",
  code: "pro",
  kind: "api",
  interval: "month",
  priceCents: 4900,
  includedCreditsCents: 0,
  family: "f",
  trialDays: 0,
  trialCard: "default",
  stripeProductId: "prod_1",
  stripePriceId: "price_pro",
  translations: {},
};
const UNSYNCED: SubscriptionPlan = {
  ...PLAN,
  id: "p2",
  code: "nouveau",
  stripePriceId: null,
};

function setup(session: SessionInfo | null) {
  const checkoutCreate = vi.fn(async (_p: unknown) => ({
    id: "cs_test_1",
    url: "https://checkout.stripe.test/cs_test_1",
  }));
  const portalCreate = vi.fn(async (_p: unknown) => ({
    url: "https://billing.stripe.test/p/1",
  }));
  const stripe = {
    customers: { create: vi.fn(async () => ({ id: `cus_${id()}` })) },
    checkout: { sessions: { create: checkoutCreate } },
    billingPortal: { sessions: { create: portalCreate } },
  };
  const deps: BillingHttpDeps = {
    db: t.db,
    getSession: async () => session,
    stripe: async () => stripe as never,
    plans: () => new FakePlanSource([PLAN, UNSYNCED]),
    config: DEFAULT_BILLING_CONFIG,
    siteUrl: SITE,
    productName: (lang) =>
      lang === "fr" ? "Crédits Nexora" : "Nexora credits",
    log: { debug() {}, info() {}, warn() {}, error() {} } as never,
  };
  return { deps, checkoutCreate, portalCreate, stripe };
}

function post(
  path: string,
  body: Record<string, string>,
  headers: Record<string, string> = {},
  json = false,
) {
  return new Request(`${SITE}${path}`, {
    method: "POST",
    headers: {
      origin: SITE,
      "content-type": json
        ? "application/json"
        : "application/x-www-form-urlencoded",
      ...(json ? { accept: "application/json" } : {}),
      ...headers,
    },
    body: json ? JSON.stringify(body) : new URLSearchParams(body).toString(),
  });
}

describe("facturation : le corps n'est lu qu'après origine, session et rôle", () => {
  /** Requête dont la lecture du corps est espionnée. */
  function spied(headers: Record<string, string>) {
    const request = post(
      "/api/billing/checkout/credits",
      { amount: "20" },
      headers,
    );
    const reads = { count: 0 };
    for (const method of ["formData", "json", "text", "arrayBuffer"] as const) {
      const original = request[method].bind(request);
      (request as unknown as Record<string, unknown>)[method] = (
        ...args: unknown[]
      ) => {
        reads.count++;
        return (original as (...a: unknown[]) => unknown)(...args);
      };
    }
    return { request, reads };
  }

  it("origine étrangère : refusée sans lire le corps", async () => {
    const { session } = await account();
    const { request, reads } = spied({ origin: "https://evil.example" });
    const res = await handleCreditsCheckout(request, setup(session).deps);
    expect(res.status).toBe(403);
    expect(reads.count).toBe(0);
  });

  it("sans session : refusé sans lire le corps ; le retour garde la langue de la page d'origine", async () => {
    const s = setup(null as never);
    s.deps.getSession = async () => null;
    const { request, reads } = spied({ referer: `${SITE}/en/compte` });
    const res = await handleCreditsCheckout(request, s.deps);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/en/compte/connexion");
    expect(reads.count).toBe(0);
  });

  it("corps annoncé démesuré : 413 sans lecture", async () => {
    const { session } = await account();
    const { request, reads } = spied({ "content-length": "5000000" });
    const res = await handleCreditsCheckout(request, setup(session).deps);
    expect(res.status).toBe(413);
    expect(reads.count).toBe(0);
  });
});

describe("facturation : Stripe non configuré ou indisponible", () => {
  it("un montant hors bornes reste refusé en 422 même si Stripe n'est pas configuré", async () => {
    const { session } = await account();
    const s = setup(session);
    s.deps.stripe = async () => {
      throw new Error("Secret Stripe absent");
    };
    for (const amount of ["0", "9,99", "5000.01", "99999"]) {
      const res = await handleCreditsCheckout(
        post("/api/billing/checkout/credits", { amount }, {}, true),
        s.deps,
      );
      expect(res.status, amount).toBe(422);
      expect(await res.json()).toEqual({ error: "invalid_amount" });
    }
  });

  it("un client Stripe impossible à construire donne 503 payment_unavailable, pas une erreur interne", async () => {
    const { session } = await account();
    const s = setup(session);
    s.deps.stripe = async () => {
      throw new Error("Secret Stripe absent");
    };
    for (const [path, body] of [
      ["/api/billing/checkout/credits", { amount: "50" }],
      ["/api/billing/checkout/subscription", { plan: "pro" }],
      ["/api/billing/portal", {}],
    ] as const) {
      const res = await (path.endsWith("credits")
        ? handleCreditsCheckout
        : path.endsWith("subscription")
          ? handleSubscribeCheckout
          : handlePortal)(post(path, body, {}, true), s.deps);
      expect(res.status, path).toBe(503);
      expect(await res.json()).toEqual({ error: "payment_unavailable" });
    }
  });
});

describe("POST /api/billing/checkout/credits", () => {
  it("formulaire : redirige (303) vers la page de paiement Stripe", async () => {
    const { session } = await account();
    const s = setup(session);
    const res = await handleCreditsCheckout(
      post("/api/billing/checkout/credits", { amount: "50", lang: "fr" }),
      s.deps,
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      "https://checkout.stripe.test/cs_test_1",
    );
    const params = s.checkoutCreate.mock.calls[0]?.[0] as Record<string, any>;
    expect(params.line_items[0].price_data.unit_amount).toBe(5000);
  });

  it("JSON : renvoie l'adresse de paiement", async () => {
    const { session } = await account();
    const res = await handleCreditsCheckout(
      post(
        "/api/billing/checkout/credits",
        { amount: "25,50", lang: "en" },
        {},
        true,
      ),
      setup(session).deps,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: "https://checkout.stripe.test/cs_test_1",
    });
  });

  it("l'organisation vient de la session : un identifiant d'organisation fourni est ignoré", async () => {
    const mine = await account();
    const other = await account();
    const s = setup(mine.session);
    await handleCreditsCheckout(
      post("/api/billing/checkout/credits", {
        amount: "50",
        organizationId: other.orgId,
        organization_id: other.orgId,
      }),
      s.deps,
    );
    const params = s.checkoutCreate.mock.calls[0]?.[0] as Record<string, any>;
    expect(params.client_reference_id).toBe(mine.orgId);
    expect(params.metadata.organization_id).toBe(mine.orgId);
  });

  it("une organisation active forgée dans la session est ignorée", async () => {
    const mine = await account();
    const other = await account();
    const s = setup({ ...mine.session, activeOrganizationId: other.orgId });
    await handleCreditsCheckout(
      post("/api/billing/checkout/credits", { amount: "50" }),
      s.deps,
    );
    const params = s.checkoutCreate.mock.calls[0]?.[0] as Record<string, any>;
    expect(params.client_reference_id).toBe(mine.orgId);
  });

  it("sans session : 401 en JSON, redirection vers la connexion pour un formulaire", async () => {
    const s = setup(null);
    const json = await handleCreditsCheckout(
      post("/api/billing/checkout/credits", { amount: "50" }, {}, true),
      s.deps,
    );
    expect(json.status).toBe(401);
    const form = await handleCreditsCheckout(
      // La langue vient de la page d'origine (Referer) : le corps n'est pas lu avant l'authentification.
      post(
        "/api/billing/checkout/credits",
        { amount: "50" },
        { referer: `${SITE}/en/compte` },
      ),
      s.deps,
    );
    expect(form.status).toBe(303);
    expect(form.headers.get("location")).toBe(`${SITE}/en/compte/connexion`);
    expect(s.checkoutCreate).not.toHaveBeenCalled();
  });

  it("refuse une requête d'une autre origine (CSRF)", async () => {
    const { session } = await account();
    const s = setup(session);
    const res = await handleCreditsCheckout(
      post(
        "/api/billing/checkout/credits",
        { amount: "50" },
        { origin: "https://evil.example" },
      ),
      s.deps,
    );
    expect(res.status).toBe(403);
    expect(s.checkoutCreate).not.toHaveBeenCalled();
  });

  it("refuse un simple membre : seul le propriétaire achète", async () => {
    const owner = await account("owner");
    const member = await account("member", owner.orgId);
    const s = setup(member.session);
    const res = await handleCreditsCheckout(
      post("/api/billing/checkout/credits", { amount: "50" }, {}, true),
      s.deps,
    );
    expect(res.status).toBe(403);
    expect(s.checkoutCreate).not.toHaveBeenCalled();
  });

  it("refuse un montant invalide ou hors bornes (422)", async () => {
    const { session } = await account();
    for (const amount of ["", "abc", "5", "99999", "-50", "50.999"]) {
      const s = setup(session);
      const res = await handleCreditsCheckout(
        post("/api/billing/checkout/credits", { amount }, {}, true),
        s.deps,
      );
      expect(res.status, amount).toBe(422);
      expect(s.checkoutCreate).not.toHaveBeenCalled();
    }
  });

  it("limite à 10 créations de paiement par minute et par utilisateur", async () => {
    const { session } = await account();
    const s = setup(session);
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++)
      statuses.push(
        (
          await handleCreditsCheckout(
            post("/api/billing/checkout/credits", { amount: "50" }, {}, true),
            s.deps,
          )
        ).status,
      );
    expect(statuses.slice(0, 10).every((x) => x === 200)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });

  it("répond 502 sans détail quand Stripe échoue", async () => {
    const { session } = await account();
    const s = setup(session);
    s.checkoutCreate.mockRejectedValueOnce(
      Object.assign(new Error("clé sk_test_secrète invalide"), {
        type: "StripeAuthenticationError",
      }),
    );
    const res = await handleCreditsCheckout(
      post("/api/billing/checkout/credits", { amount: "50" }, {}, true),
      s.deps,
    );
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("sk_test");
  });
});

describe("POST /api/billing/checkout/subscription", () => {
  it("crée la session pour un plan publié et synchronisé", async () => {
    const { session } = await account();
    const s = setup(session);
    const res = await handleSubscribeCheckout(
      post("/api/billing/checkout/subscription", { plan: "pro", lang: "fr" }),
      s.deps,
    );
    expect(res.status).toBe(303);
    const params = s.checkoutCreate.mock.calls[0]?.[0] as Record<string, any>;
    expect(params.mode).toBe("subscription");
    expect(params.line_items[0].price).toBe("price_pro");
  });

  it("404 pour un plan inconnu ou non publié, 409 pour un plan sans prix Stripe", async () => {
    const { session } = await account();
    const unknown = await handleSubscribeCheckout(
      post(
        "/api/billing/checkout/subscription",
        { plan: "brouillon" },
        {},
        true,
      ),
      setup(session).deps,
    );
    expect(unknown.status).toBe(404);
    const unsynced = await handleSubscribeCheckout(
      post("/api/billing/checkout/subscription", { plan: "nouveau" }, {}, true),
      setup(session).deps,
    );
    expect(unsynced.status).toBe(409);
  });
});

describe("POST /api/billing/checkout/subscription : pas de double abonnement", () => {
  const sub = (orgId: string, status: string, plan = "pro") =>
    t.db.insert(subscriptions).values({
      organizationId: orgId,
      stripeSubscriptionId: `sub_${id()}`,
      stripeCustomerId: `cus_${id()}`,
      status: status as never,
      planCode: plan,
    });

  it("409 already_subscribed quand l'organisation a déjà ce plan actif ou en retard de paiement", async () => {
    for (const status of ["active", "trialing", "past_due"]) {
      const { session, orgId } = await account();
      await sub(orgId, status);
      const s = setup(session);
      const res = await handleSubscribeCheckout(
        post("/api/billing/checkout/subscription", { plan: "pro" }, {}, true),
        s.deps,
      );
      expect(res.status, status).toBe(409);
      expect(await res.json()).toEqual({ error: "already_subscribed" });
      expect(s.checkoutCreate).not.toHaveBeenCalled();
    }
  });

  it("autorise un plan résilié, un autre plan, ou l'abonnement d'une autre organisation", async () => {
    const { session, orgId } = await account();
    await sub(orgId, "canceled");
    await sub(orgId, "active", "autre-plan");
    const other = await account();
    await sub(other.orgId, "active");
    const s = setup(session);
    const res = await handleSubscribeCheckout(
      post("/api/billing/checkout/subscription", { plan: "pro" }, {}, true),
      s.deps,
    );
    expect(res.status).toBe(200);
    expect(s.checkoutCreate).toHaveBeenCalledOnce();
  });
});

describe("POST /api/billing/portal", () => {
  it("ouvre le portail du client Stripe de l'organisation", async () => {
    const { session, orgId } = await account();
    await t.db
      .insert(billingCustomers)
      .values({ organizationId: orgId, stripeCustomerId: `cus_${id()}` });
    const s = setup(session);
    const res = await handlePortal(
      post("/api/billing/portal", { lang: "fr" }),
      s.deps,
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://billing.stripe.test/p/1");
  });

  it("409 tant que l'organisation n'a jamais payé (aucun client Stripe)", async () => {
    const { session } = await account();
    const res = await handlePortal(
      post("/api/billing/portal", {}, {}, true),
      setup(session).deps,
    );
    expect(res.status).toBe(409);
  });

  it("refuse un simple membre et une autre origine", async () => {
    const owner = await account("owner");
    await t.db
      .insert(billingCustomers)
      .values({ organizationId: owner.orgId, stripeCustomerId: `cus_${id()}` });
    const member = await account("member", owner.orgId);
    expect(
      (
        await handlePortal(
          post("/api/billing/portal", {}, {}, true),
          setup(member.session).deps,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handlePortal(
          post(
            "/api/billing/portal",
            {},
            { origin: "https://evil.example" },
            true,
          ),
          setup(owner.session).deps,
        )
      ).status,
    ).toBe(403);
  });
});

describe("essai gratuit, codes promo, frais de recharge et dons du personnel", () => {
  const sessionParams = (s: ReturnType<typeof setup>) =>
    s.checkoutCreate.mock.calls[0]?.[0] as Record<string, any>;

  async function stripePromo(code: string, over: Record<string, unknown> = {}) {
    const { createPromo } = await import("../payments/promo");
    const row = await createPromo(
      t.db,
      {
        code,
        kind: "percent",
        percentOff: 20,
        scopes: ["subscriptions", "credits"],
        ...over,
      },
      "admin",
    );
    if (row.kind !== "staff" && row.kind !== "trial")
      await t.db
        .update(promoCodes)
        .set({
          stripeCouponId: `co_${code}`,
          stripePromotionCodeId: `promo_${code}`,
        })
        .where(eq(promoCodes.id, row.id));
    return row;
  }

  it("abonnement : l'essai de l'offre est envoyé à Stripe, et un client qui a déjà eu un abonnement à l'offre n'en a plus", async () => {
    const trialPlan = {
      ...PLAN,
      code: "essai-mensuel",
      family: "essai",
      trialDays: 14,
    };
    const { session, orgId } = await account();
    const s = setup(session);
    s.deps.plans = () => new FakePlanSource([trialPlan]);
    const res = await handleSubscribeCheckout(
      post(
        "/api/billing/checkout/subscription",
        { plan: "essai-mensuel" },
        {},
        true,
      ),
      s.deps,
    );
    expect(res.status).toBe(200);
    expect(sessionParams(s).subscription_data.trial_period_days).toBe(14);
    expect(sessionParams(s).allow_promotion_codes).toBe(true);
    await t.db.insert(subscriptions).values({
      organizationId: orgId,
      stripeSubscriptionId: `sub_${id()}`,
      stripeCustomerId: "cus_x",
      planCode: "essai-mensuel",
      status: "canceled",
    });
    const s2 = setup(session);
    s2.deps.plans = () => new FakePlanSource([trialPlan]);
    await handleSubscribeCheckout(
      post(
        "/api/billing/checkout/subscription",
        { plan: "essai-mensuel" },
        {},
        true,
      ),
      s2.deps,
    );
    expect(
      sessionParams(s2).subscription_data.trial_period_days,
    ).toBeUndefined();
  });

  it("une session de paiement expire en 30 minutes (et non 24 h) : un code à usage limité ne peut pas être « réservé » par des sessions laissées ouvertes", async () => {
    const { session } = await account();
    const s = setup(session);
    await handleSubscribeCheckout(
      post("/api/billing/checkout/subscription", { plan: "pro" }, {}, true),
      s.deps,
    );
    const s2 = setup(session);
    await handleCreditsCheckout(
      post("/api/billing/checkout/credits", { amount: "20" }, {}, true),
      s2.deps,
    );
    for (const sess of [s, s2]) {
      const expires = sessionParams(sess).expires_at as number;
      const inSeconds = expires - Math.floor(Date.now() / 1000);
      expect(inSeconds).toBeGreaterThan(29 * 60);
      expect(inSeconds).toBeLessThanOrEqual(30 * 60);
    }
  });

  it("le champ « code promo » de la page Stripe est retiré tant qu'un code « un par client » est actif (Stripe ne sait pas le limiter par client : réutilisable à volonté)", async () => {
    const row = await stripePromo("UNSEUL-FOIS", { onePerCustomer: true });
    const { session } = await account();
    const s = setup(session);
    const res = await handleSubscribeCheckout(
      post("/api/billing/checkout/subscription", { plan: "pro" }, {}, true),
      s.deps,
    );
    expect(res.status).toBe(200);
    expect(sessionParams(s).allow_promotion_codes).toBeUndefined();
    const s2 = setup(session);
    await handleCreditsCheckout(
      post("/api/billing/checkout/credits", { amount: "20" }, {}, true),
      s2.deps,
    );
    expect(sessionParams(s2).allow_promotion_codes).toBeUndefined();
    // Code désactivé : le champ revient.
    await t.db
      .update(promoCodes)
      .set({ status: "disabled" })
      .where(eq(promoCodes.id, row.id));
    const s3 = setup(session);
    await handleSubscribeCheckout(
      post("/api/billing/checkout/subscription", { plan: "pro" }, {}, true),
      s3.deps,
    );
    expect(sessionParams(s3).allow_promotion_codes).toBe(true);
  });

  it("abonnement : un code valide est appliqué par son code de promotion Stripe ; un code refusé arrête l'achat avec son motif", async () => {
    await stripePromo("BIENVENUE-A");
    const { session } = await account();
    const s = setup(session);
    const ok = await handleSubscribeCheckout(
      post(
        "/api/billing/checkout/subscription",
        { plan: "pro", promo: " bienvenue-a " },
        {},
        true,
      ),
      s.deps,
    );
    expect(ok.status).toBe(200);
    expect(sessionParams(s).discounts).toEqual([
      { promotion_code: "promo_BIENVENUE-A" },
    ]);
    expect(sessionParams(s).allow_promotion_codes).toBeUndefined();
    const s2 = setup(session);
    const bad = await handleSubscribeCheckout(
      post(
        "/api/billing/checkout/subscription",
        { plan: "pro", promo: "NEXISTEPAS" },
        {},
        true,
      ),
      s2.deps,
    );
    expect(bad.status).toBe(422);
    expect(await bad.json()).toEqual({ error: "promo_unknown" });
    expect(s2.checkoutCreate).not.toHaveBeenCalled();
    // formulaire : retour au tableau de bord avec le motif
    const s3 = setup(session);
    const form = await handleSubscribeCheckout(
      post("/api/billing/checkout/subscription", {
        plan: "pro",
        promo: "NEXISTEPAS",
      }),
      s3.deps,
    );
    expect(form.headers.get("location")).toContain("erreur=promo_unknown");
  });

  it("crédits : frais de recharge déduits des crédits, produit Stripe dédié et code appliqué", async () => {
    await t.db
      .insert(paymentSettings)
      .values({ id: "default", creditsFeeEnabled: true })
      .onConflictDoUpdate({
        target: paymentSettings.id,
        set: { creditsFeeEnabled: true },
      });
    await stripePromo("CRED-10", { percentOff: 10, scopes: ["credits"] });
    const { session } = await account();
    const s = setup(session);
    (s.stripe as Record<string, unknown>).products = {
      create: vi.fn(async () => ({ id: `prod_${id()}` })),
    };
    const res = await handleCreditsCheckout(
      post(
        "/api/billing/checkout/credits",
        { amount: "100", promo: "CRED-10" },
        {},
        true,
      ),
      s.deps,
    );
    expect(res.status).toBe(200);
    const p = sessionParams(s);
    expect(p.metadata.credits_cents).toBe("9500");
    expect(p.line_items[0].price_data.unit_amount).toBe(10_000);
    expect(p.line_items[0].price_data.product).toMatch(/^prod_/);
    expect(p.discounts).toEqual([{ promotion_code: "promo_CRED-10" }]);
    await t.db.update(paymentSettings).set({ creditsFeeEnabled: false });
  });

  it("crédits : un code en montant qui couvrirait tout l'achat est refusé", async () => {
    await stripePromo("TOUT-20", {
      kind: "amount",
      percentOff: null,
      amountOffCents: 2000,
      scopes: ["credits"],
    });
    const { session } = await account();
    const s = setup(session);
    const res = await handleCreditsCheckout(
      post(
        "/api/billing/checkout/credits",
        { amount: "20", promo: "TOUT-20" },
        {},
        true,
      ),
      s.deps,
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "promo_covers_all" });
  });

  async function staffAccount() {
    const acct = await account();
    await t.db
      .update(users)
      .set({ twoFactorEnabled: true })
      .where(eq(users.id, acct.session.userId));
    await t.db
      .insert(staffAccounts)
      .values({ userId: acct.session.userId, grantedBy: "admin" });
    return acct;
  }

  it("code du personnel : abonnement offert sans appeler Stripe, accès complet, utilisation enregistrée", async () => {
    await stripePromo("EQUIPE-1", {
      kind: "staff",
      percentOff: null,
      scopes: ["subscriptions", "credits", "vps"],
    });
    const { session, orgId } = await staffAccount();
    const s = setup(session);
    const res = await handleSubscribeCheckout(
      post(
        "/api/billing/checkout/subscription",
        { plan: "pro", promo: "EQUIPE-1" },
        {},
        true,
      ),
      s.deps,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      url: expect.stringContaining("offert=abonnement"),
    });
    expect(s.checkoutCreate).not.toHaveBeenCalled();
    expect(s.stripe.customers.create).not.toHaveBeenCalled();
    const [sub] = await t.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, orgId));
    expect(sub).toMatchObject({ status: "gifted", planCode: "pro" });
    const used = await t.db
      .select()
      .from(promoRedemptions)
      .where(eq(promoRedemptions.organizationId, orgId));
    expect(used[0]).toMatchObject({ source: "gift", scope: "subscriptions" });
  });

  it("code du personnel utilisé par un client ordinaire : refusé, rien n'est offert", async () => {
    const { session, orgId } = await account();
    const s = setup(session);
    const res = await handleSubscribeCheckout(
      post(
        "/api/billing/checkout/subscription",
        { plan: "pro", promo: "EQUIPE-1" },
        {},
        true,
      ),
      s.deps,
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "promo_unknown" });
    expect(
      await t.db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.organizationId, orgId)),
    ).toHaveLength(0);
  });

  it("code du personnel : crédits offerts dans la limite du plafond mensuel, puis refus clair", async () => {
    await t.db
      .update(paymentSettings)
      .set({ staffMonthlyCreditCapCents: 5000 });
    const { session, orgId } = await staffAccount();
    const s = setup(session);
    const ok = await handleCreditsCheckout(
      post(
        "/api/billing/checkout/credits",
        { amount: "30", promo: "EQUIPE-1" },
        {},
        true,
      ),
      s.deps,
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({
      url: expect.stringContaining("offert=credits"),
    });
    expect((await getAccount(t.db, orgId)).balanceMicro).toBe(30_000_000n);
    const over = await handleCreditsCheckout(
      post(
        "/api/billing/checkout/credits",
        { amount: "30", promo: "EQUIPE-1" },
        {},
        true,
      ),
      s.deps,
    );
    expect(over.status).toBe(409);
    expect(await over.json()).toEqual({ error: "gift_cap_reached" });
    expect((await getAccount(t.db, orgId)).balanceMicro).toBe(30_000_000n);
    expect(s.checkoutCreate).not.toHaveBeenCalled();
  });
});
