import { organizations, staffAccounts, subscriptions, users } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakePlanSource, type SubscriptionPlan } from "../billing/plans";
import { createPromo } from "./promo";
import { creditFee, resolvePromo, trialFor } from "./purchase";
import { getSettings } from "./settings";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
  await t.db.insert(users).values([
    { id: "u1", name: "A", email: "a@example.com" },
    {
      id: "u-staff",
      name: "S",
      email: "s@example.com",
      twoFactorEnabled: true,
    },
  ]);
  await t.db.insert(organizations).values([
    { id: "o1", name: "A", slug: "o1" },
    { id: "o-staff", name: "S", slug: "o-staff" },
  ]);
  await t.db
    .insert(staffAccounts)
    .values({ userId: "u-staff", grantedBy: "admin" });
});
afterAll(async () => {
  await t.drop();
});

const NOW = new Date("2026-11-01T00:00:00Z");
const base = {
  scope: "subscriptions" as const,
  organizationId: "o1",
  userId: "u1",
  now: NOW,
};

describe("résolution d'un code saisi dans un parcours d'achat", () => {
  it("aucun code saisi : rien à appliquer", async () => {
    expect(await resolvePromo(t.db, { ...base, code: "" })).toEqual({
      kind: "none",
    });
    expect(await resolvePromo(t.db, { ...base, code: undefined })).toEqual({
      kind: "none",
    });
    expect(await resolvePromo(t.db, { ...base, code: "   " })).toEqual({
      kind: "none",
    });
  });

  it("code refusé : le motif est renvoyé", async () => {
    expect(await resolvePromo(t.db, { ...base, code: "INCONNU" })).toEqual({
      kind: "rejected",
      reason: "unknown",
    });
  });

  it("rabais Stripe : le code de promotion passe au Checkout ; 100 % pour toujours dispense de carte", async () => {
    const { promoCodes, eq } = await import("@nexora/db");
    const a = await createPromo(
      t.db,
      {
        code: "RAB-20",
        kind: "percent",
        percentOff: 20,
        scopes: ["subscriptions"],
      },
      "admin",
    );
    const b = await createPromo(
      t.db,
      {
        code: "GRATUIT-VPS",
        kind: "free",
        scopes: ["subscriptions"],
        duration: "forever",
      },
      "admin",
    );
    for (const [row, id] of [
      [a, "promo_a"],
      [b, "promo_b"],
    ] as const)
      await t.db
        .update(promoCodes)
        .set({ stripeCouponId: `co_${id}`, stripePromotionCodeId: id })
        .where(eq(promoCodes.id, row.id));
    const r1 = await resolvePromo(t.db, { ...base, code: "rab-20" });
    expect(r1).toMatchObject({
      kind: "discount",
      promo: { promoCodeId: a.id, stripePromotionCodeId: "promo_a" },
      noPaymentMethodNeeded: false,
    });
    const r2 = await resolvePromo(t.db, { ...base, code: "GRATUIT-VPS" });
    expect(r2).toMatchObject({ kind: "discount", noPaymentMethodNeeded: true });
  });

  it("code d'essai : jours d'essai sans code Stripe", async () => {
    await createPromo(
      t.db,
      {
        code: "ESSAI-30",
        kind: "trial",
        trialDays: 30,
        scopes: ["subscriptions"],
      },
      "admin",
    );
    expect(
      await resolvePromo(t.db, { ...base, code: "ESSAI-30" }),
    ).toMatchObject({
      kind: "discount",
      promo: { stripePromotionCodeId: null, trialDays: 30 },
    });
  });

  it("code du personnel : don pour un compte du personnel, refus pour les autres", async () => {
    await createPromo(
      t.db,
      {
        code: "EQUIPE",
        kind: "staff",
        scopes: ["subscriptions", "vps", "credits"],
      },
      "admin",
    );
    expect(await resolvePromo(t.db, { ...base, code: "EQUIPE" })).toEqual({
      kind: "rejected",
      reason: "unknown",
    });
    const r = await resolvePromo(t.db, {
      ...base,
      organizationId: "o-staff",
      userId: "u-staff",
      code: "EQUIPE",
    });
    expect(r).toMatchObject({ kind: "gift", promo: { code: "EQUIPE" } });
  });
});

describe("frais de recharge des crédits", () => {
  it("désactivés par défaut : les crédits valent le montant payé", async () => {
    const s = await getSettings(t.db);
    expect(creditFee(s, 10_000)).toEqual({ feeCents: 0, creditsCents: 10_000 });
  });
  it("5 % avec un minimum de 1 $, déduits des crédits", () => {
    const s = {
      creditsFeeEnabled: true,
      creditsFeeBps: 500,
      creditsFeeMinCents: 100,
    } as never;
    expect(creditFee(s, 10_000)).toEqual({
      feeCents: 500,
      creditsCents: 9_500,
    });
    expect(creditFee(s, 2_000)).toEqual({ feeCents: 100, creditsCents: 1_900 });
    expect(creditFee(s, 2_001)).toEqual({ feeCents: 100, creditsCents: 1_901 });
    expect(creditFee(s, 50_050)).toEqual({
      feeCents: 2_503,
      creditsCents: 47_547,
    });
  });
  it("jamais de crédits nuls ou négatifs, même avec un minimum élevé", () => {
    const s = {
      creditsFeeEnabled: true,
      creditsFeeBps: 500,
      creditsFeeMinCents: 5_000,
    } as never;
    expect(creditFee(s, 3_000)).toEqual({ feeCents: 2_999, creditsCents: 1 });
  });
});

describe("essai gratuit d'une offre", () => {
  const makePlan = (
    over: Partial<SubscriptionPlan> = {},
  ): SubscriptionPlan => ({
    id: "p",
    code: "equipe-mensuel",
    kind: "workstudio",
    family: "equipe",
    interval: "month",
    priceCents: 12900,
    includedCreditsCents: 0,
    trialDays: 14,
    trialCard: "default",
    stripeProductId: "prod",
    stripePriceId: "price",
    translations: {},
    ...over,
  });
  const plans = (...p: SubscriptionPlan[]) => new FakePlanSource(p);

  it("aucun essai sans durée sur l'offre", async () => {
    const s = await getSettings(t.db);
    expect(
      await trialFor(t.db, {
        plan: makePlan({ trialDays: 0 }),
        plans: plans(makePlan()),
        organizationId: "o1",
        settings: s,
      }),
    ).toBeUndefined();
  });

  it("carte exigée par le réglage général, ou par décision propre à l'offre", async () => {
    const s = await getSettings(t.db);
    expect(
      await trialFor(t.db, {
        plan: makePlan(),
        plans: plans(makePlan()),
        organizationId: "o1",
        settings: s,
      }),
    ).toEqual({ days: 14, requireCard: true });
    expect(
      await trialFor(t.db, {
        plan: makePlan({ trialCard: "not_required" }),
        plans: plans(makePlan()),
        organizationId: "o1",
        settings: s,
      }),
    ).toEqual({ days: 14, requireCard: false });
    expect(
      await trialFor(t.db, {
        plan: makePlan(),
        plans: plans(makePlan()),
        organizationId: "o1",
        settings: { ...s, trialRequiresCard: false },
      }),
    ).toEqual({ days: 14, requireCard: false });
    expect(
      await trialFor(t.db, {
        plan: makePlan({ trialCard: "required" }),
        plans: plans(makePlan()),
        organizationId: "o1",
        settings: { ...s, trialRequiresCard: false },
      }),
    ).toEqual({ days: 14, requireCard: true });
  });

  it("un seul essai par organisation et par offre : aucun nouvel essai après un abonnement, même sur l'autre période de la même offre", async () => {
    const s = await getSettings(t.db);
    const monthly = makePlan();
    const yearly = makePlan({ code: "equipe-annuel", interval: "year" });
    await t.db.insert(subscriptions).values({
      organizationId: "o1",
      stripeSubscriptionId: "sub_old",
      stripeCustomerId: "cus_1",
      planCode: "equipe-annuel",
      status: "canceled",
    });
    expect(
      await trialFor(t.db, {
        plan: monthly,
        plans: plans(monthly, yearly),
        organizationId: "o1",
        settings: s,
      }),
    ).toBeUndefined();
    // une autre offre garde son essai
    const other = makePlan({ code: "affaires-mensuel", family: "affaires" });
    expect(
      await trialFor(t.db, {
        plan: other,
        plans: plans(monthly, yearly, other),
        organizationId: "o1",
        settings: s,
      }),
    ).toEqual({ days: 14, requireCard: true });
  });
});
