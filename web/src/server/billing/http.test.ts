import { randomBytes } from "node:crypto";
import { billingCustomers, members, organizations, users } from "@nexora/db";
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
      post("/api/billing/checkout/credits", { amount: "50", lang: "en" }),
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
