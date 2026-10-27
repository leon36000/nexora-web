import {
  creditPurchases,
  organizations,
  promoCodes,
  promoRedemptions,
  staffAccounts,
  subscriptions,
  users,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPromo } from "./promo";
import { PROMO_MESSAGE_KEYS, validatePromo } from "./promo-apply";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
  await t.db.insert(users).values([
    { id: "u-client", name: "Client", email: "client@example.com" },
    {
      id: "u-staff",
      name: "Équipe",
      email: "equipe@example.com",
      twoFactorEnabled: true,
    },
    // Compte du personnel qui n'a pas encore activé sa double authentification.
    { id: "u-staff-nofa", name: "Sans 2FA", email: "sans2fa@example.com" },
  ]);
  await t.db.insert(organizations).values([
    { id: "o-client", name: "Client", slug: "o-client" },
    { id: "o-staff", name: "Équipe", slug: "o-staff" },
  ]);
  await t.db.insert(staffAccounts).values([
    { userId: "u-staff", grantedBy: "admin" },
    { userId: "u-staff-nofa", grantedBy: "admin" },
  ]);
});
afterAll(async () => {
  await t.drop();
});

const NOW = new Date("2026-11-01T12:00:00Z");
let n = 0;
async function promo(over: Record<string, unknown> = {}, synced = true) {
  n += 1;
  const row = await createPromo(
    t.db,
    {
      code: `CODE-${n}`,
      kind: "percent",
      percentOff: 20,
      scopes: ["subscriptions"],
      ...over,
    },
    "admin",
  );
  if (synced && row.kind !== "trial" && row.kind !== "staff")
    await t.db
      .update(promoCodes)
      .set({
        stripeCouponId: `co_${n}`,
        stripePromotionCodeId: `promo_${n}`,
        stripeSyncedAt: NOW,
      })
      .where(eq(promoCodes.id, row.id));
  return row;
}

import { eq } from "@nexora/db";

const ask = (code: string, over: Record<string, unknown> = {}) =>
  validatePromo(t.db, {
    code,
    scope: "subscriptions",
    organizationId: "o-client",
    userId: "u-client",
    now: NOW,
    ...over,
  } as never);

describe("validation côté serveur d'un code saisi", () => {
  it("accepte un code actif et synchronisé, saisi en minuscules avec des espaces", async () => {
    const p = await promo();
    const r = await ask(` ${p.code.toLowerCase()} `);
    expect(r).toMatchObject({ ok: true, gift: false });
    expect(r.ok && r.promo.stripePromotionCodeId).toMatch(/^promo_/);
  });

  it("refuse un code inconnu ou désactivé avec le même message (pas d'énumération)", async () => {
    const p = await promo();
    await t.db
      .update(promoCodes)
      .set({ status: "disabled" })
      .where(eq(promoCodes.id, p.id));
    expect(await ask("INCONNU-9")).toEqual({ ok: false, reason: "unknown" });
    expect(await ask(p.code)).toEqual({ ok: false, reason: "unknown" });
    expect(await ask("%%%")).toEqual({ ok: false, reason: "unknown" });
  });

  it("refuse un code expiré et un code épuisé", async () => {
    const old = await promo({ expiresAt: "2026-10-01T00:00:00Z" });
    expect(await ask(old.code)).toEqual({ ok: false, reason: "expired" });
    const one = await promo({ maxRedemptions: 1 });
    await t.db.insert(promoRedemptions).values({
      promoCodeId: one.id,
      organizationId: "o-staff",
      scope: "subscriptions",
      source: "stripe",
      stripeSessionId: "cs_x",
    });
    expect(await ask(one.code)).toEqual({ ok: false, reason: "exhausted" });
  });

  it("respecte la portée", async () => {
    const p = await promo({ scopes: ["vps"] });
    expect(await ask(p.code)).toEqual({ ok: false, reason: "wrong_scope" });
    expect((await ask(p.code, { scope: "vps" })).ok).toBe(true);
  });

  it("un code du personnel n'est accepté que d'un compte du personnel, et seulement sans Stripe", async () => {
    const p = await promo(
      {
        kind: "staff",
        percentOff: null,
        scopes: ["subscriptions", "vps", "credits"],
      },
      false,
    );
    // Pour qui n'est pas du personnel, le code est indiscernable d'un code qui n'existe pas.
    expect(await ask(p.code)).toEqual({ ok: false, reason: "unknown" });
    const r = await ask(p.code, {
      organizationId: "o-staff",
      userId: "u-staff",
    });
    expect(r).toMatchObject({ ok: true, gift: true });
    // un drapeau retiré ne donne plus rien
    await t.db.update(staffAccounts).set({ revokedAt: NOW });
    expect(
      await ask(p.code, { organizationId: "o-staff", userId: "u-staff" }),
    ).toEqual({
      ok: false,
      reason: "unknown",
    });
    await t.db.update(staffAccounts).set({ revokedAt: null });
  });

  it("un compte du personnel sans double authentification ne peut pas utiliser un code du personnel", async () => {
    const p = await promo(
      { kind: "staff", percentOff: null, scopes: ["subscriptions"] },
      false,
    );
    expect(
      await ask(p.code, { organizationId: "o-staff", userId: "u-staff-nofa" }),
    ).toEqual({ ok: false, reason: "two_factor_required" });
  });

  it("« un par client » : refuse une deuxième utilisation par la même organisation", async () => {
    const p = await promo({ onePerCustomer: true });
    expect((await ask(p.code)).ok).toBe(true);
    await t.db.insert(promoRedemptions).values({
      promoCodeId: p.id,
      organizationId: "o-client",
      scope: "subscriptions",
      source: "stripe",
      stripeSessionId: "cs_y",
    });
    expect(await ask(p.code)).toEqual({ ok: false, reason: "already_used" });
    expect(
      (await ask(p.code, { organizationId: "o-staff", userId: "u-staff" })).ok,
    ).toBe(true);
  });

  it("« première commande seulement » : refuse une organisation qui a déjà acheté", async () => {
    const p = await promo({ firstOrderOnly: true });
    expect(
      (await ask(p.code, { organizationId: "o-staff", userId: "u-staff" })).ok,
    ).toBe(true);
    await t.db.insert(creditPurchases).values({
      organizationId: "o-client",
      stripeCheckoutSessionId: "cs_old",
      amountSubtotalCents: 2000,
      amountTotalCents: 2300,
      creditsMicro: 20_000_000n,
      configVersion: "cfg",
    });
    expect(await ask(p.code)).toEqual({
      ok: false,
      reason: "first_order_only",
    });
  });

  it("un abonnement offert ne compte pas comme une commande payée", async () => {
    const p = await promo({ firstOrderOnly: true });
    await t.db.insert(subscriptions).values({
      organizationId: "o-staff",
      stripeSubscriptionId: "gift_1",
      stripeCustomerId: "gift",
      status: "gifted",
    });
    expect(
      (await ask(p.code, { organizationId: "o-staff", userId: "u-staff" })).ok,
    ).toBe(true);
  });

  it("montant minimum", async () => {
    const p = await promo({ minAmountCents: 5000, scopes: ["credits"] });
    expect(await ask(p.code, { scope: "credits", amountCents: 4000 })).toEqual({
      ok: false,
      reason: "min_amount",
    });
    expect(
      (await ask(p.code, { scope: "credits", amountCents: 5000 })).ok,
    ).toBe(true);
  });

  it("crédits : un rabais en montant qui couvrirait tout l'achat est refusé", async () => {
    const p = await promo({
      kind: "amount",
      percentOff: null,
      amountOffCents: 2000,
      scopes: ["credits"],
    });
    expect(await ask(p.code, { scope: "credits", amountCents: 2000 })).toEqual({
      ok: false,
      reason: "covers_all",
    });
    expect(
      (await ask(p.code, { scope: "credits", amountCents: 2500 })).ok,
    ).toBe(true);
  });

  it("un code pas encore synchronisé avec Stripe n'est pas applicable (jamais un rabais promis mais non appliqué)", async () => {
    const p = await promo({}, false);
    expect(await ask(p.code)).toEqual({ ok: false, reason: "not_ready" });
  });

  it("un code d'essai n'a pas besoin de Stripe", async () => {
    const p = await promo(
      {
        kind: "trial",
        percentOff: null,
        trialDays: 30,
        scopes: ["subscriptions"],
      },
      false,
    );
    const r = await ask(p.code);
    expect(r).toMatchObject({ ok: true, gift: false });
    expect(r.ok && r.promo.trialDays).toBe(30);
  });
});

describe("messages", () => {
  it("chaque motif de refus a un message dans les dictionnaires", async () => {
    const { getAccountDictionary } = await import("@/i18n/account");
    for (const lang of ["fr", "en"] as const) {
      const d = getAccountDictionary(lang).promo.errors;
      for (const k of PROMO_MESSAGE_KEYS)
        expect(d[k], `${lang}:${k}`).toBeTruthy();
    }
  });
});
