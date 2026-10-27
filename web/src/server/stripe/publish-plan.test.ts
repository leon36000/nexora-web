import { describe, expect, it, vi } from "vitest";
import type { SubscriptionPlan } from "../billing/plans";
import { PublishPlanError, publishPlanToStripe } from "./publish-plan";

/** Clé d'idempotence du premier appel de création. */
const keyOf = (create: { mock: { calls: unknown[][] } }): string =>
  (create.mock.calls[0]?.[1] as { idempotencyKey: string } | undefined)
    ?.idempotencyKey ?? "";

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
    "fr-CA": {
      name: "WorkStudio Pro",
      description: "Pour les équipes.",
      features: [],
    },
    "en-CA": { name: "WorkStudio Pro EN", description: null, features: [] },
  },
};

function fake(existingPrice?: Record<string, unknown>) {
  const products = {
    create: vi.fn(async (_p: unknown, _o?: unknown) => ({ id: "prod_new" })),
    update: vi.fn(async (id: string, _p: unknown) => ({ id })),
  };
  const prices = {
    create: vi.fn(async (_p: unknown, _o?: unknown) => ({ id: "price_new" })),
    retrieve: vi.fn(async (_id: string) => existingPrice),
    update: vi.fn(async (id: string, _p: unknown) => ({ id })),
  };
  return { products, prices, client: { products, prices } as never };
}

describe("publier un plan vers Stripe", () => {
  it("crée le produit et le prix d'un nouveau plan et renvoie leurs identifiants", async () => {
    const s = fake();
    const out = await publishPlanToStripe(s.client, PLAN);
    expect(out).toEqual({
      stripeProductId: "prod_new",
      stripePriceId: "price_new",
      productCreated: true,
      priceCreated: true,
      previousPriceArchived: false,
    });
    const product = s.products.create.mock.calls[0]?.[0] as Record<string, any>;
    expect(product).toMatchObject({
      name: "WorkStudio Pro",
      description: "Pour les équipes.",
      metadata: { plan_code: "workstudio-pro" },
    });
    const price = s.prices.create.mock.calls[0]?.[0] as Record<string, any>;
    expect(price).toMatchObject({
      product: "prod_new",
      currency: "cad",
      unit_amount: 4900,
      recurring: { interval: "month" },
      tax_behavior: "exclusive",
      metadata: { plan_code: "workstudio-pro" },
    });
  });

  it("utilise des clés d'idempotence : un rejeu ne duplique ni produit ni prix", async () => {
    const s = fake();
    await publishPlanToStripe(s.client, PLAN);
    const first = [keyOf(s.products.create), keyOf(s.prices.create)];
    const s2 = fake();
    await publishPlanToStripe(s2.client, PLAN);
    const second = [keyOf(s2.products.create), keyOf(s2.prices.create)];
    expect(first).toEqual(second);
    expect(first[0]).toContain("workstudio-pro");
    // Un changement de prix donne une autre clé (sinon Stripe refuserait des paramètres différents).
    const s3 = fake();
    await publishPlanToStripe(s3.client, { ...PLAN, priceCents: 5900 });
    expect(keyOf(s3.prices.create)).not.toBe(first[1]);
  });

  it("met à jour le produit existant et réutilise le prix inchangé", async () => {
    const s = fake({
      id: "price_ok",
      product: "prod_1",
      unit_amount: 4900,
      currency: "cad",
      active: true,
      recurring: { interval: "month" },
    });
    const out = await publishPlanToStripe(s.client, {
      ...PLAN,
      stripeProductId: "prod_1",
      stripePriceId: "price_ok",
    });
    expect(out).toMatchObject({
      stripeProductId: "prod_1",
      stripePriceId: "price_ok",
      productCreated: false,
      priceCreated: false,
    });
    expect(s.products.update).toHaveBeenCalledWith(
      "prod_1",
      expect.objectContaining({ name: "WorkStudio Pro", active: true }),
    );
    expect(s.prices.create).not.toHaveBeenCalled();
  });

  it("un prix changé crée un nouveau prix et archive l'ancien (un prix Stripe est immuable)", async () => {
    const s = fake({
      id: "price_old",
      product: "prod_1",
      unit_amount: 3900,
      currency: "cad",
      active: true,
      recurring: { interval: "month" },
    });
    const out = await publishPlanToStripe(s.client, {
      ...PLAN,
      stripeProductId: "prod_1",
      stripePriceId: "price_old",
    });
    expect(out).toMatchObject({
      stripePriceId: "price_new",
      priceCreated: true,
      previousPriceArchived: true,
    });
    expect(s.prices.update).toHaveBeenCalledWith("price_old", {
      active: false,
    });
  });

  it("un prix archivé ou d'un autre produit est remplacé", async () => {
    for (const existing of [
      {
        id: "price_old",
        product: "prod_1",
        unit_amount: 4900,
        currency: "cad",
        active: false,
        recurring: { interval: "month" },
      },
      {
        id: "price_old",
        product: "prod_AUTRE",
        unit_amount: 4900,
        currency: "cad",
        active: true,
        recurring: { interval: "month" },
      },
      {
        id: "price_old",
        product: "prod_1",
        unit_amount: 4900,
        currency: "cad",
        active: true,
        recurring: { interval: "year" },
      },
    ]) {
      const s = fake(existing);
      const out = await publishPlanToStripe(s.client, {
        ...PLAN,
        stripeProductId: "prod_1",
        stripePriceId: "price_old",
      });
      expect(out.priceCreated).toBe(true);
    }
  });

  it("refuse un prix absent ou nul : jamais 0 $", async () => {
    const s = fake();
    for (const priceCents of [0, -5, 12.5, Number.NaN]) {
      await expect(
        publishPlanToStripe(s.client, { ...PLAN, priceCents }),
      ).rejects.toBeInstanceOf(PublishPlanError);
    }
    expect(s.products.create).not.toHaveBeenCalled();
    expect(s.prices.create).not.toHaveBeenCalled();
  });

  it("à défaut de traduction, nomme le produit d'après le code du plan", async () => {
    const s = fake();
    await publishPlanToStripe(s.client, { ...PLAN, translations: {} });
    const params = s.products.create.mock.calls[0]?.[0] as
      | { name: string }
      | undefined;
    expect(params?.name).toBe("workstudio-pro");
  });
});
