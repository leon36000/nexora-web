import {
  creditEntries,
  eq,
  getAccount,
  giftGrants,
  jobs,
  organizations,
  paymentAudit,
  promoRedemptions,
  staffAccounts,
  subscriptions,
  users,
  vpsOrders,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { type Fixture, seedFixture } from "@nexora/vps/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_BILLING_CONFIG } from "../ledger/config";
import {
  cancelGiftSubscription,
  GiftError,
  grantGiftCredits,
  grantGiftSubscription,
  grantGiftVps,
  isGiftSubscriptionRef,
  listGifts,
  monthlyGiftedCents,
  revokeGift,
  setStaffFlag,
} from "./gifts";
import { createPromo } from "./promo";

let t: TestDatabase;
let fx: Fixture;
let code: string;
let promoId: string;
beforeAll(async () => {
  t = await createTestDatabase();
  await t.db.insert(users).values([
    {
      id: "u-staff",
      name: "Équipe",
      email: "equipe@example.com",
      twoFactorEnabled: true,
    },
    {
      id: "u-client",
      name: "Client",
      email: "client@example.com",
      twoFactorEnabled: true,
    },
  ]);
  await t.db
    .insert(organizations)
    .values([{ id: "o-staff", name: "Équipe", slug: "o-staff" }]);
  fx = await seedFixture(t.db, { simPort: 1 });
  const p = await createPromo(
    t.db,
    {
      code: "EQUIPE-GRATUIT",
      kind: "staff",
      scopes: ["subscriptions", "vps", "credits"],
    },
    "admin",
  );
  code = p.code;
  promoId = p.id;
});
afterAll(async () => {
  await t.drop();
});

const NOW = new Date("2026-11-10T15:00:00Z");

describe("drapeau « personnel »", () => {
  it("se pose et se retire depuis l'admin, avec journal, et refuse un compte inconnu", async () => {
    await setStaffFlag(t.db, {
      userId: "u-staff",
      on: true,
      actor: "admin",
      note: "fondateur",
    });
    const [row] = await t.db
      .select()
      .from(staffAccounts)
      .where(eq(staffAccounts.userId, "u-staff"));
    expect(row).toMatchObject({ note: "fondateur", revokedAt: null });
    await setStaffFlag(t.db, { userId: "u-staff", on: false, actor: "admin" });
    const [off] = await t.db
      .select()
      .from(staffAccounts)
      .where(eq(staffAccounts.userId, "u-staff"));
    expect(off?.revokedAt).not.toBeNull();
    await setStaffFlag(t.db, { userId: "u-staff", on: true, actor: "admin" });
    const [on] = await t.db
      .select()
      .from(staffAccounts)
      .where(eq(staffAccounts.userId, "u-staff"));
    expect(on?.revokedAt).toBeNull();
    await expect(
      setStaffFlag(t.db, { userId: "inconnu", on: true, actor: "admin" }),
    ).rejects.toMatchObject({ code: "not_found" });
    const actions = (await t.db.select().from(paymentAudit)).map(
      (a) => a.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining(["staff.grant", "staff.revoke"]),
    );
  });
});

describe("double authentification obligatoire pour le personnel", () => {
  it("un compte du personnel sans double authentification ne peut rien offrir (abonnement, crédits, VPS)", async () => {
    await t.db.insert(users).values({
      id: "u-staff-nofa",
      name: "Sans 2FA",
      email: "sans2fa@example.com",
    });
    await t.db
      .insert(staffAccounts)
      .values({ userId: "u-staff-nofa", grantedBy: "admin" });
    await expect(
      grantGiftSubscription(t.db, {
        organizationId: "o-staff",
        userId: "u-staff-nofa",
        planCode: "workstudio-equipe",
        promoCodeId: promoId,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "two_factor_required" });
    await t.db
      .delete(staffAccounts)
      .where(eq(staffAccounts.userId, "u-staff-nofa"));
  });
});

describe("abonnement offert (sans Stripe)", () => {
  it("crée un abonnement « offert » à accès complet, une utilisation du code et un don révocable", async () => {
    const g = await grantGiftSubscription(t.db, {
      organizationId: "o-staff",
      userId: "u-staff",
      planCode: "workstudio-equipe",
      promoCodeId: promoId,
      now: NOW,
    });
    const [sub] = await t.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, "o-staff"));
    expect(sub).toMatchObject({
      status: "gifted",
      planCode: "workstudio-equipe",
    });
    expect(isGiftSubscriptionRef(sub!.stripeSubscriptionId)).toBe(true);
    expect(g).toMatchObject({
      kind: "subscription",
      status: "active",
      subscriptionRef: sub!.stripeSubscriptionId,
    });
    const red = await t.db
      .select()
      .from(promoRedemptions)
      .where(eq(promoRedemptions.promoCodeId, promoId));
    expect(red[0]).toMatchObject({ source: "gift", scope: "subscriptions" });
  });

  it("refuse un second don du même plan tant que le premier court", async () => {
    await expect(
      grantGiftSubscription(t.db, {
        organizationId: "o-staff",
        userId: "u-staff",
        planCode: "workstudio-equipe",
        promoCodeId: promoId,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "already_gifted" });
  });

  it("refuse un compte qui n'est pas du personnel", async () => {
    await expect(
      grantGiftSubscription(t.db, {
        organizationId: "o-staff",
        userId: "u-client",
        planCode: "autre",
        promoCodeId: promoId,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "not_staff" });
  });

  it("la révocation résilie l'abonnement offert et le journalise ; rejouée, elle ne change rien", async () => {
    const [g] = await t.db
      .select()
      .from(giftGrants)
      .where(eq(giftGrants.kind, "subscription"));
    const out = await revokeGift(t.db, g!.id, {
      actor: "admin",
      reason: "fin du test",
      now: NOW,
      config: DEFAULT_BILLING_CONFIG,
    });
    expect(out.status).toBe("revoked");
    const [sub] = await t.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, g!.subscriptionRef!));
    expect(sub).toMatchObject({ status: "canceled" });
    expect(sub?.canceledAt).not.toBeNull();
    const again = await revokeGift(t.db, g!.id, {
      actor: "admin",
      now: NOW,
      config: DEFAULT_BILLING_CONFIG,
    });
    expect(again.status).toBe("revoked");
    // après révocation, un nouveau don du même plan est possible
    await grantGiftSubscription(t.db, {
      organizationId: "o-staff",
      userId: "u-staff",
      planCode: "workstudio-equipe",
      promoCodeId: promoId,
      now: NOW,
    });
  });
});

describe("crédits offerts plafonnés par mois", () => {
  it("inscrit les crédits au grand livre avec le motif, dans la limite du plafond du mois", async () => {
    const g = await grantGiftCredits(t.db, {
      organizationId: "o-staff",
      userId: "u-staff",
      amountCents: 6000,
      promoCodeId: promoId,
      capCents: 10_000,
      config: DEFAULT_BILLING_CONFIG,
      now: NOW,
      reason: "démonstration client",
    });
    expect((await getAccount(t.db, "o-staff")).balanceMicro).toBe(60_000_000n);
    const [entry] = await t.db
      .select()
      .from(creditEntries)
      .where(eq(creditEntries.externalRef, g.id));
    expect(entry).toMatchObject({ source: "staff_gift", kind: "credit" });
    expect(entry?.metadata).toMatchObject({
      reason: "démonstration client",
      grantId: g.id,
    });
    expect(await monthlyGiftedCents(t.db, "u-staff", NOW)).toBe(6000);
  });

  it("refuse un don qui dépasserait le plafond, en disant ce qu'il reste", async () => {
    const err = await grantGiftCredits(t.db, {
      organizationId: "o-staff",
      userId: "u-staff",
      amountCents: 4001,
      promoCodeId: promoId,
      capCents: 10_000,
      config: DEFAULT_BILLING_CONFIG,
      now: NOW,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(GiftError);
    expect(err).toMatchObject({ code: "cap_reached", remainingCents: 4000 });
    expect((await getAccount(t.db, "o-staff")).balanceMicro).toBe(60_000_000n);
  });

  it("le plafond repart avec le mois suivant, et un plafond de 0 bloque tout", async () => {
    const next = new Date("2026-12-01T00:00:01Z");
    await grantGiftCredits(t.db, {
      organizationId: "o-staff",
      userId: "u-staff",
      amountCents: 10_000,
      promoCodeId: promoId,
      capCents: 10_000,
      config: DEFAULT_BILLING_CONFIG,
      now: next,
    });
    await expect(
      grantGiftCredits(t.db, {
        organizationId: "o-staff",
        userId: "u-staff",
        amountCents: 1,
        promoCodeId: promoId,
        capCents: 0,
        config: DEFAULT_BILLING_CONFIG,
        now: new Date("2027-02-01T00:00:00Z"),
      }),
    ).rejects.toMatchObject({ code: "cap_reached", remainingCents: 0 });
  });

  it("deux dons simultanés ne dépassent jamais le plafond", async () => {
    await setStaffFlag(t.db, { userId: "u-client", on: true, actor: "admin" });
    await t.db
      .insert(organizations)
      .values({ id: "o-conc", name: "C", slug: "o-conc" });
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        grantGiftCredits(t.db, {
          organizationId: "o-conc",
          userId: "u-client",
          amountCents: 3000,
          promoCodeId: promoId,
          capCents: 10_000,
          config: DEFAULT_BILLING_CONFIG,
          now: NOW,
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(await monthlyGiftedCents(t.db, "u-client", NOW)).toBe(9000);
  });

  it("révoquer un don de crédits reprend ce qui reste, sans rendre le solde négatif", async () => {
    const [g] = await t.db
      .select()
      .from(giftGrants)
      .where(eq(giftGrants.organizationId, "o-conc"));
    const out = await revokeGift(t.db, g!.id, {
      actor: "admin",
      reason: "erreur",
      now: NOW,
      config: DEFAULT_BILLING_CONFIG,
    });
    expect(out.status).toBe("revoked");
    expect((await getAccount(t.db, "o-conc")).balanceMicro).toBe(60_000_000n);
    expect(await monthlyGiftedCents(t.db, "u-client", NOW)).toBe(6000);
  });
});

describe("VPS offert (même provisionnement, sans Stripe)", () => {
  it("crée la commande, l'abonnement offert, et met le provisionnement en file", async () => {
    const g = await grantGiftVps(t.db, {
      organizationId: "o-staff",
      userId: "u-staff",
      promoCodeId: promoId,
      now: NOW,
      order: {
        idempotencyKey: "gift-vps-1",
        planCode: fx.planCode,
        appCode: fx.appCode,
        term: "month",
        sshPublicKey:
          "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl",
        maxPerOrganization: 5,
      },
    });
    const [order] = await t.db
      .select()
      .from(vpsOrders)
      .where(eq(vpsOrders.id, g.vpsOrderId!));
    expect(order).toMatchObject({
      status: "paid",
      stripeSubscriptionId: g.subscriptionRef,
    });
    expect(isGiftSubscriptionRef(order!.stripeSubscriptionId!)).toBe(true);
    const queued = await t.db
      .select()
      .from(jobs)
      .where(eq(jobs.idempotencyKey, `vps-provision:${order!.id}`));
    expect(queued).toHaveLength(1);
  });

  it("l'annulation par le client d'un VPS offert résilie l'abonnement offert (aucun appel à Stripe)", async () => {
    const [g] = await t.db
      .select()
      .from(giftGrants)
      .where(eq(giftGrants.kind, "vps"));
    const out = await cancelGiftSubscription(t.db, {
      subscriptionRef: g!.subscriptionRef!,
      actor: "customer",
      now: NOW,
    });
    expect(out).toBe(true);
    const [sub] = await t.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, g!.subscriptionRef!));
    expect(sub?.status).toBe("canceled");
    const [grant] = await t.db
      .select()
      .from(giftGrants)
      .where(eq(giftGrants.id, g!.id));
    expect(grant?.status).toBe("revoked");
  });
});

describe("liste des dons", () => {
  it("renvoie les dons avec leur état", async () => {
    const list = await listGifts(t.db, {});
    expect(list.length).toBeGreaterThanOrEqual(4);
    expect(list.every((g) => ["active", "revoked"].includes(g.status))).toBe(
      true,
    );
  });
});

describe("dons simultanés (courses)", () => {
  it("un code à une seule utilisation ne sert qu'une fois, même demandé cinq fois en parallèle", async () => {
    const p = await createPromo(
      t.db,
      {
        code: "UNE-SEULE",
        kind: "staff",
        scopes: ["subscriptions"],
        maxRedemptions: 1,
      },
      "admin",
    );
    const orgs = [1, 2, 3, 4, 5].map((n) => `o-race-${n}`);
    await t.db
      .insert(organizations)
      .values(orgs.map((id) => ({ id, name: id, slug: id })));
    const results = await Promise.allSettled(
      orgs.map((organizationId) =>
        grantGiftSubscription(t.db, {
          organizationId,
          userId: "u-staff",
          planCode: "workstudio-equipe",
          promoCodeId: p.id,
          now: NOW,
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refused = results.filter((r) => r.status === "rejected");
    expect(refused).toHaveLength(4);
    expect((refused[0] as PromiseRejectedResult).reason).toMatchObject({
      code: "code_exhausted",
    });
  });

  it("deux dons identiques simultanés à la même organisation : un seul actif", async () => {
    await t.db
      .insert(organizations)
      .values({ id: "o-dup", name: "Dup", slug: "o-dup" });
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        grantGiftSubscription(t.db, {
          organizationId: "o-dup",
          userId: "u-staff",
          planCode: "workstudio-equipe",
          promoCodeId: null,
          now: NOW,
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const active = await t.db
      .select()
      .from(giftGrants)
      .where(eq(giftGrants.organizationId, "o-dup"));
    expect(active.filter((g) => g.status === "active")).toHaveLength(1);
  });
});
