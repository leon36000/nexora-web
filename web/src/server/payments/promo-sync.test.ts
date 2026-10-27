import { eq, promoCodes } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPromo } from "./promo";
import {
  ensureCreditsProducts,
  type ScopeProducts,
  syncAllPromos,
  syncPromo,
} from "./promo-sync";
import { getSettings } from "./settings";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

function fake() {
  let n = 0;
  const coupons = {
    create: vi.fn(async (p: Record<string, unknown>) => ({
      id: `co_${++n}`,
      ...p,
    })),
  };
  const promotionCodes = {
    create: vi.fn(async (p: Record<string, unknown>) => ({
      id: `promo_${++n}`,
      active: true,
      ...p,
    })),
    update: vi.fn(async (id: string, p: Record<string, unknown>) => ({
      id,
      ...p,
    })),
    retrieve: vi.fn(async (id: string) => ({ id, active: true })),
  };
  const products = {
    create: vi.fn(async (p: Record<string, unknown>) => ({
      id: `prod_${++n}`,
      ...p,
    })),
  };
  return {
    coupons,
    promotionCodes,
    products,
    client: { coupons, promotionCodes, products } as never,
  };
}

const products: ScopeProducts = {
  subscriptions: ["prod_sub1", "prod_sub2"],
  vps: ["prod_vps1"],
  credits: ["prod_cr_fr", "prod_cr_en"],
};
const deps = (f: ReturnType<typeof fake>, over = {}) => ({
  db: t.db,
  stripe: f.client,
  products: async () => products,
  now: () => new Date("2026-11-01T00:00:00Z"),
  ...over,
});

let n = 0;
const mk = (over: Record<string, unknown> = {}) =>
  createPromo(
    t.db,
    {
      code: `SYNC-${++n}`,
      kind: "percent",
      percentOff: 25,
      scopes: ["subscriptions"],
      ...over,
    },
    "admin",
  );

describe("synchronisation d'un code avec Stripe", () => {
  it("crée le coupon et le code de promotion et écrit leurs identifiants", async () => {
    const f = fake();
    const p = await mk({
      duration: "repeating",
      durationMonths: 3,
      maxRedemptions: 50,
      expiresAt: "2027-01-01T00:00:00Z",
      firstOrderOnly: true,
      minAmountCents: 5000,
    });
    const out = await syncPromo(deps(f), p);
    expect(out.state).toBe("synced");
    const coupon = f.coupons.create.mock.calls[0]?.[0] as Record<string, any>;
    expect(coupon).toMatchObject({
      percent_off: 25,
      duration: "repeating",
      duration_in_months: 3,
      applies_to: { products: ["prod_sub1", "prod_sub2"] },
      metadata: { promo_code_id: p.id },
    });
    const code = f.promotionCodes.create.mock.calls[0]?.[0] as Record<
      string,
      any
    >;
    expect(code).toMatchObject({
      code: p.code,
      promotion: { type: "coupon", coupon: "co_1" },
      max_redemptions: 50,
      expires_at: Math.floor(Date.parse("2027-01-01T00:00:00Z") / 1000),
      restrictions: {
        first_time_transaction: true,
        minimum_amount: 5000,
        minimum_amount_currency: "cad",
      },
      active: true,
    });
    const [row] = await t.db
      .select()
      .from(promoCodes)
      .where(eq(promoCodes.id, p.id));
    expect(row).toMatchObject({
      stripeCouponId: "co_1",
      stripePromotionCodeId: expect.stringMatching(/^promo_/),
      stripeSyncError: null,
    });
    expect(row?.stripeFingerprint).toBeTruthy();
  });

  it("un code en montant utilise le dollar canadien ; « gratuit » est 100 % ; toutes les portées : aucune restriction de produit", async () => {
    const f = fake();
    await syncPromo(
      deps(f),
      await mk({
        kind: "amount",
        percentOff: null,
        amountOffCents: 1500,
        scopes: ["vps"],
      }),
    );
    expect(f.coupons.create.mock.calls[0]?.[0]).toMatchObject({
      amount_off: 1500,
      currency: "cad",
      applies_to: { products: ["prod_vps1"] },
    });
    const g = fake();
    await syncPromo(
      deps(g),
      await mk({
        kind: "free",
        percentOff: null,
        scopes: ["subscriptions", "vps"],
        duration: "forever",
      }),
    );
    const coupon = g.coupons.create.mock.calls[0]?.[0] as Record<string, any>;
    const all = fake();
    await syncPromo(
      deps(all),
      await mk({ percentOff: 10, scopes: ["subscriptions", "vps", "credits"] }),
    );
    expect(
      (all.coupons.create.mock.calls[0]?.[0] as Record<string, any> | undefined)
        ?.applies_to,
    ).toBeUndefined();
    expect(coupon.percent_off).toBe(100);
    expect(coupon.duration).toBe("forever");
  });

  it("la portée « crédits » se limite aux produits Stripe des crédits", async () => {
    const f = fake();
    await syncPromo(deps(f), await mk({ scopes: ["credits"], percentOff: 10 }));
    expect(f.coupons.create.mock.calls[0]?.[0]).toMatchObject({
      applies_to: { products: ["prod_cr_en", "prod_cr_fr"] },
    });
  });

  it("est idempotent : sans changement, aucun appel de création ; le statut désactivé se propage", async () => {
    const f = fake();
    const p = await mk();
    await syncPromo(deps(f), p);
    f.coupons.create.mockClear();
    f.promotionCodes.create.mockClear();
    const [fresh] = await t.db
      .select()
      .from(promoCodes)
      .where(eq(promoCodes.id, p.id));
    expect((await syncPromo(deps(f), fresh!)).state).toBe("unchanged");
    expect(f.coupons.create).not.toHaveBeenCalled();
    await t.db
      .update(promoCodes)
      .set({ status: "disabled" })
      .where(eq(promoCodes.id, p.id));
    const [off] = await t.db
      .select()
      .from(promoCodes)
      .where(eq(promoCodes.id, p.id));
    const out = await syncPromo(deps(f), off!);
    expect(out.state).toBe("updated");
    expect(f.promotionCodes.update).toHaveBeenCalledWith(
      off!.stripePromotionCodeId,
      { active: false },
    );
  });

  it("quand les produits de la portée changent, désactive l'ancien code et en crée un nouveau pour le restant des utilisations", async () => {
    const f = fake();
    const p = await mk({ maxRedemptions: 10 });
    await syncPromo(deps(f), p);
    const [synced] = await t.db
      .select()
      .from(promoCodes)
      .where(eq(promoCodes.id, p.id));
    const { promoRedemptions, organizations } = await import("@nexora/db");
    await t.db
      .insert(organizations)
      .values({ id: "o-sync", name: "O", slug: "o-sync" })
      .onConflictDoNothing();
    await t.db.insert(promoRedemptions).values(
      [1, 2, 3].map((i) => ({
        promoCodeId: p.id,
        organizationId: "o-sync",
        scope: "subscriptions" as const,
        source: "stripe" as const,
        stripeSessionId: `cs_${p.id}_${i}`,
      })),
    );
    f.promotionCodes.create.mockClear();
    const out = await syncPromo(
      deps(f, {
        products: async () => ({
          ...products,
          subscriptions: ["prod_sub1", "prod_sub2", "prod_sub3"],
        }),
      }),
      synced!,
    );
    expect(out.state).toBe("recreated");
    expect(f.promotionCodes.update).toHaveBeenCalledWith(
      synced!.stripePromotionCodeId,
      { active: false },
    );
    expect(f.promotionCodes.create.mock.calls[0]?.[0]).toMatchObject({
      max_redemptions: 7,
    });
  });

  it("un code du personnel ou d'essai n'existe jamais chez Stripe", async () => {
    const f = fake();
    expect(
      (await syncPromo(deps(f), await mk({ kind: "staff", percentOff: null })))
        .state,
    ).toBe("skipped");
    expect(
      (
        await syncPromo(
          deps(f),
          await mk({ kind: "trial", percentOff: null, trialDays: 14 }),
        )
      ).state,
    ).toBe("skipped");
    expect(f.coupons.create).not.toHaveBeenCalled();
    expect(f.promotionCodes.create).not.toHaveBeenCalled();
  });

  it("aucune offre publiée vers Stripe pour la portée : erreur lisible, rien n'est créé", async () => {
    const f = fake();
    const p = await mk();
    const out = await syncPromo(
      deps(f, { products: async () => ({ ...products, subscriptions: [] }) }),
      p,
    );
    expect(out).toMatchObject({ state: "error", code: "no_products" });
    expect(f.coupons.create).not.toHaveBeenCalled();
    const [row] = await t.db
      .select()
      .from(promoCodes)
      .where(eq(promoCodes.id, p.id));
    expect(row?.stripeSyncError).toMatch(/Publier vers Stripe/);
    expect(row?.stripePromotionCodeId).toBeNull();
  });

  it("une erreur de Stripe est notée sur le code sans citer le message de Stripe", async () => {
    const f = fake();
    f.coupons.create.mockRejectedValueOnce(
      Object.assign(new Error("secret interne sk_test_x"), {
        type: "StripeInvalidRequestError",
      }),
    );
    const p = await mk();
    const out = await syncPromo(deps(f), p);
    expect(out).toMatchObject({ state: "error", code: "stripe_error" });
    const [row] = await t.db
      .select()
      .from(promoCodes)
      .where(eq(promoCodes.id, p.id));
    expect(row?.stripeSyncError).toContain("StripeInvalidRequestError");
    expect(row?.stripeSyncError).not.toContain("sk_test");
  });

  it("syncAllPromos traite tous les codes actifs non synchronisés et rend un bilan", async () => {
    await t.db.update(promoCodes).set({ status: "disabled" });
    const f = fake();
    await mk();
    await mk();
    await mk({ kind: "staff", percentOff: null });
    const out = await syncAllPromos(deps(f));
    expect(out).toMatchObject({ synced: 2, skipped: 1, errors: 0 });
  });
});

describe("produits Stripe des crédits", () => {
  it("crée un produit par langue une seule fois et les range dans les réglages", async () => {
    const f = fake();
    const first = await ensureCreditsProducts(t.db, f.client);
    expect(first).toHaveLength(2);
    const again = await ensureCreditsProducts(t.db, f.client);
    expect(again).toEqual(first);
    expect(f.products.create).toHaveBeenCalledTimes(2);
    const s = await getSettings(t.db);
    expect([s.creditsProductFrId, s.creditsProductEnId]).toEqual(first);
    expect(
      (f.products.create.mock.calls[0]?.[0] as Record<string, any> | undefined)
        ?.name,
    ).toMatch(/Crédits/);
    expect(
      (f.products.create.mock.calls[1]?.[0] as Record<string, any> | undefined)
        ?.name,
    ).toMatch(/credits/i);
  });
});
