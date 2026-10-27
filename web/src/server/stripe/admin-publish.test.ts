import { describe, expect, it, vi } from "vitest";
import { FakePlanSource, type SubscriptionPlan } from "../billing/plans";
import { handlePublishPlan, type PublishPlanRouteDeps } from "./admin-publish";

const TOKEN = "t".repeat(40);
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
  stripeProductId: null,
  stripePriceId: null,
  translations: {
    "fr-CA": { name: "WorkStudio Pro", description: null, features: [] },
  },
};

function deps(over: Partial<PublishPlanRouteDeps> = {}) {
  const products = {
    create: vi.fn(async () => ({ id: "prod_9" })),
    update: vi.fn(),
  };
  const prices = {
    create: vi.fn(async () => ({ id: "price_9" })),
    retrieve: vi.fn(),
    update: vi.fn(),
  };
  const d: PublishPlanRouteDeps = {
    adminToken: TOKEN,
    plans: new FakePlanSource([PLAN]),
    stripe: async () => ({ products, prices }) as never,
    log: { debug() {}, info() {}, warn() {}, error() {} } as never,
    ...over,
  };
  return { d, products, prices };
}

const req = (body: unknown, token: string | null = TOKEN) =>
  new Request("http://localhost:3500/api/admin/stripe/publish-plan", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

describe("POST /api/admin/stripe/publish-plan", () => {
  it("crée le produit et le prix et renvoie leurs identifiants", async () => {
    const { d } = deps();
    const res = await handlePublishPlan(req({ code: "workstudio-pro" }), d);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      code: "workstudio-pro",
      stripeProductId: "prod_9",
      stripePriceId: "price_9",
      priceCreated: true,
    });
  });

  it("exige le jeton d'administration (401), échoue fermé sans jeton configuré (503)", async () => {
    const { d, products } = deps();
    expect(
      (await handlePublishPlan(req({ code: "workstudio-pro" }, null), d))
        .status,
    ).toBe(401);
    expect(
      (
        await handlePublishPlan(
          req({ code: "workstudio-pro" }, "x".repeat(40)),
          d,
        )
      ).status,
    ).toBe(401);
    const none = deps({ adminToken: undefined });
    expect(
      (await handlePublishPlan(req({ code: "workstudio-pro" }), none.d)).status,
    ).toBe(503);
    expect(products.create).not.toHaveBeenCalled();
  });

  it("404 si le plan n'est pas publié dans Directus", async () => {
    const { d, products } = deps();
    const res = await handlePublishPlan(req({ code: "brouillon" }), d);
    expect(res.status).toBe(404);
    expect(products.create).not.toHaveBeenCalled();
  });

  it("422 pour un corps invalide", async () => {
    const { d } = deps();
    for (const body of [
      {},
      { code: "" },
      { code: 5 },
      { code: "ok", extra: 1 },
    ])
      expect((await handlePublishPlan(req(body), d)).status).toBe(422);
  });

  it("422 quand le prix est invalide (jamais 0 $)", async () => {
    const { d } = deps({
      plans: new FakePlanSource([{ ...PLAN, priceCents: 0 }]),
    });
    expect(
      (await handlePublishPlan(req({ code: "workstudio-pro" }), d)).status,
    ).toBe(422);
  });

  it("502 sans détail quand Stripe échoue", async () => {
    const products = {
      create: vi.fn(async () => {
        throw new Error("sk_test_secret refusé");
      }),
      update: vi.fn(),
    };
    const { d } = deps({
      stripe: async () => ({ products, prices: {} }) as never,
    });
    const res = await handlePublishPlan(req({ code: "workstudio-pro" }), d);
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("sk_test");
  });
});
