import { randomBytes } from "node:crypto";
import { organizations, paymentAudit, users, vaultSecrets } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { FakePlanSource, type SubscriptionPlan } from "../billing/plans";
import { DEFAULT_BILLING_CONFIG } from "../ledger/config";
import { loadKeyring } from "../vault/crypto";
import { handlePaymentsAdmin, type PaymentsAdminDeps } from "./admin-handlers";
import { dbVault } from "./vault";

const TOKEN = "t".repeat(48);
let t: TestDatabase;
const keyring = loadKeyring({
  NEXORA_VAULT_MASTER_KEY: randomBytes(32).toString("base64"),
});
const log = { debug() {}, info() {}, warn() {}, error: vi.fn() } as never;

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});
beforeEach(async () => {
  await t.db.delete(vaultSecrets);
});

const PLAN: SubscriptionPlan = {
  id: "p1",
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

function fakeStripe() {
  let n = 0;
  return {
    accounts: {
      retrieve: vi.fn(async () => ({
        id: "acct_1",
        country: "CA",
        business_profile: { name: "N" },
        settings: {},
      })),
    },
    tax: { settings: { retrieve: vi.fn(async () => ({ status: "active" })) } },
    webhookEndpoints: {
      list: vi.fn(() => ({ autoPagingToArray: async () => [] })),
      create: vi.fn(async (p: Record<string, unknown>) => ({
        id: "we_1",
        secret: "whsec_x1",
        ...p,
      })),
      update: vi.fn(),
      del: vi.fn(),
    },
    products: {
      create: vi.fn(async () => ({ id: `prod_${++n}` })),
      update: vi.fn(),
    },
    prices: {
      create: vi.fn(async () => ({ id: `price_${++n}` })),
      retrieve: vi.fn(),
      update: vi.fn(),
    },
    coupons: { create: vi.fn(async () => ({ id: `co_${++n}` })) },
    promotionCodes: {
      create: vi.fn(async () => ({ id: `promo_${++n}`, active: true })),
      update: vi.fn(),
      retrieve: vi.fn(async () => ({ active: true })),
    },
  };
}

function deps(
  stripe = fakeStripe(),
  over: Partial<PaymentsAdminDeps> = {},
): PaymentsAdminDeps & { stripeApi: ReturnType<typeof fakeStripe> } {
  return {
    db: () => t.db,
    adminToken: TOKEN,
    vault: () => dbVault(t.db, keyring),
    siteUrl: "https://nexora.example",
    createClient: () => stripe as never,
    allowLocalUrl: false,
    stripe: async () => stripe as never,
    plans: () => new FakePlanSource([PLAN]),
    billingConfig: DEFAULT_BILLING_CONFIG,
    log,
    now: () => new Date("2026-11-01T00:00:00Z"),
    ...over,
    stripeApi: stripe,
  };
}

const call = (
  method: string,
  path: string,
  body?: unknown,
  d = deps(),
  token = TOKEN,
) =>
  handlePaymentsAdmin(
    new Request(`http://app/api/admin/payments/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    path.split("?")[0]!.split("/").filter(Boolean),
    d,
  );

describe("authentification", () => {
  it("refuse sans jeton valide et échoue fermé sans jeton configuré", async () => {
    expect(
      (await call("GET", "", undefined, deps(), "x".repeat(48))).status,
    ).toBe(401);
    expect(
      (
        await call(
          "GET",
          "",
          undefined,
          deps(fakeStripe(), { adminToken: undefined }),
        )
      ).status,
    ).toBe(503);
  });
});

describe("vue d'ensemble et réglages", () => {
  it("décrit l'état de Stripe sans jamais renvoyer de secret", async () => {
    await dbVault(t.db, keyring).put(
      "stripe.secret_key",
      "sk_test_secretsecret",
      "payment",
    );
    const res = await call("GET", "");
    const body = await res.json();
    expect(body.stripe).toMatchObject({
      state: "key_unverified",
      keyPresent: true,
    });
    expect(JSON.stringify(body)).not.toContain("sk_test_secretsecret");
    expect(body.settings).toMatchObject({
      liveModeAllowed: false,
      staffMonthlyCreditCapCents: 10_000,
      creditsFeeEnabled: false,
    });
  });

  it("modifie les réglages, journalise, et exige une confirmation explicite pour les paiements réels", async () => {
    const res = await call("PATCH", "settings", {
      staffMonthlyCreditCapCents: 25_000,
      trialRequiresCard: false,
    });
    expect(await res.json()).toMatchObject({
      staffMonthlyCreditCapCents: 25_000,
      trialRequiresCard: false,
    });
    const refused = await call("PATCH", "settings", { liveModeAllowed: true });
    expect(refused.status).toBe(422);
    expect(await refused.json()).toMatchObject({
      error: "confirmation_required",
    });
    const ok = await call("PATCH", "settings", {
      liveModeAllowed: true,
      confirmLive: true,
    });
    expect((await ok.json()).liveModeAllowed).toBe(true);
    await call("PATCH", "settings", { liveModeAllowed: false });
    const audit = await t.db.select().from(paymentAudit);
    expect(
      audit.filter((a) => a.action === "settings.update").length,
    ).toBeGreaterThanOrEqual(3);
    expect((await call("PATCH", "settings", { inconnu: 1 })).status).toBe(422);
    expect(
      (await call("PATCH", "settings", { creditsFeeBps: 99999 })).status,
    ).toBe(422);
  });
});

describe("brancher Stripe", () => {
  it("POST stripe/connect : 422 avec l'action quand la clé manque, 200 puis état « branché » quand elle est collée", async () => {
    const miss = await call("POST", "stripe/connect", {});
    expect(miss.status).toBe(422);
    expect(await miss.json()).toMatchObject({ ok: false, code: "key_missing" });
    await dbVault(t.db, keyring).put(
      "stripe.secret_key",
      "sk_test_abcdefghijkl",
      "payment",
    );
    const ok = await call("POST", "stripe/connect", {});
    const body = await ok.json();
    expect(ok.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      mode: "test",
      status: { state: "connected" },
    });
    expect(JSON.stringify(body)).not.toContain("whsec_x1");
  });
});

describe("publier une offre vers Stripe", () => {
  it("crée le produit et le prix, renvoie les identifiants à écrire dans la fiche", async () => {
    const d = deps();
    const res = await call(
      "POST",
      "plans/publish",
      { code: "workstudio-equipe" },
      d,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      code: "workstudio-equipe",
      stripeProductId: expect.stringMatching(/^prod_/),
      stripePriceId: expect.stringMatching(/^price_/),
      priceCreated: true,
    });
  });
  it("404 pour une offre non publiée, 503 si Stripe n'est pas branché", async () => {
    expect(
      (await call("POST", "plans/publish", { code: "inconnue" })).status,
    ).toBe(404);
    const d = deps(fakeStripe(), {
      stripe: async () => {
        throw new Error("pas de clé");
      },
    });
    const res = await call(
      "POST",
      "plans/publish",
      { code: "workstudio-equipe" },
      d,
    );
    expect(res.status).toBe(503);
  });
});

describe("codes promo", () => {
  const def = {
    code: "bienvenue-20",
    kind: "percent",
    percentOff: 20,
    scopes: ["subscriptions"],
  };

  it("refuse une publication d'offre inconnue du serveur mais pas la création d'un code : la synchronisation attend les produits", async () => {
    const res = await call("POST", "promos", def);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.promo).toMatchObject({
      code: "BIENVENUE-20",
      status: "active",
    });
    // aucune offre n'a encore de produit Stripe : erreur lisible, code non appliquable
    expect(body.sync).toMatchObject({ state: "error", code: "no_products" });
  });

  it("une fois l'offre publiée vers Stripe, le code se synchronise", async () => {
    const withProduct = {
      ...PLAN,
      stripeProductId: "prod_ws",
      stripePriceId: "price_ws",
    };
    const d = deps(fakeStripe(), {
      plans: () => new FakePlanSource([withProduct]),
    });
    const res = await call("POST", "promos", { ...def, code: "SYNC-OK" }, d);
    const body = await res.json();
    expect(body.sync).toMatchObject({ state: "synced" });
    expect(body.promo.stripePromotionCodeId).toMatch(/^promo_/);
  });

  it("valide la définition : 422 avec les champs en cause ; 409 pour un doublon", async () => {
    const bad = await call("POST", "promos", {
      code: "x",
      kind: "percent",
      scopes: ["vps"],
    });
    expect(bad.status).toBe(422);
    expect((await bad.json()).issues.length).toBeGreaterThan(0);
    await call("POST", "promos", { ...def, code: "DOUBLON" });
    expect(
      (await call("POST", "promos", { ...def, code: "doublon" })).status,
    ).toBe(409);
  });

  it("génère un lot sans appeler Stripe, puis le synchronise par paquets", async () => {
    const withProduct = {
      ...PLAN,
      stripeProductId: "prod_ws",
      stripePriceId: "price_ws",
    };
    const d = deps(fakeStripe(), {
      plans: () => new FakePlanSource([withProduct]),
    });
    const res = await call(
      "POST",
      "promos/batch",
      {
        prefix: "ete",
        count: 30,
        length: 6,
        definition: {
          kind: "percent",
          percentOff: 10,
          scopes: ["subscriptions"],
          maxRedemptions: 1,
        },
      },
      d,
    );
    expect(res.status).toBe(201);
    const out = await res.json();
    expect(out.count).toBe(30);
    expect(d.stripeApi.coupons.create).not.toHaveBeenCalled();
    const first = await (
      await call("POST", "promos/sync", { limit: 20 }, d)
    ).json();
    expect(first.processed).toBe(20);
    expect(first.remaining).toBeGreaterThanOrEqual(10);
    let guard = 0;
    let remaining = first.remaining;
    while (remaining > 0 && guard++ < 10)
      remaining = (
        await (await call("POST", "promos/sync", { limit: 20 }, d)).json()
      ).remaining;
    expect(remaining).toBe(0);
  });

  it("liste avec filtre, désactive un code (et propage à Stripe)", async () => {
    const withProduct = {
      ...PLAN,
      stripeProductId: "prod_ws",
      stripePriceId: "price_ws",
    };
    const d = deps(fakeStripe(), {
      plans: () => new FakePlanSource([withProduct]),
    });
    const created = await (
      await call("POST", "promos", { ...def, code: "A-DESACTIVER" }, d)
    ).json();
    const list = await (
      await call("GET", "promos?q=desactiver", undefined, d)
    ).json();
    expect(list.items.map((i: { code: string }) => i.code)).toEqual([
      "A-DESACTIVER",
    ]);
    const off = await (
      await call(
        "PATCH",
        `promos/${created.promo.id}`,
        { status: "disabled" },
        d,
      )
    ).json();
    expect(off.promo.status).toBe("disabled");
    expect(d.stripeApi.promotionCodes.update).toHaveBeenCalledWith(
      created.promo.stripePromotionCodeId,
      { active: false },
    );
    expect(
      (await call("PATCH", "promos/pas-un-uuid", { status: "disabled" }, d))
        .status,
    ).toBe(404);
  });
});

describe("personnel et dons", () => {
  it("pose le drapeau par courriel, liste, retire ; 404 pour un courriel inconnu", async () => {
    await t.db
      .insert(users)
      .values({ id: "u-adm", name: "Équipe", email: "Equipe@Example.com" });
    const on = await call("POST", "staff", {
      email: "equipe@example.com",
      on: true,
      note: "fondateur",
    });
    expect(on.status).toBe(200);
    const list = await (await call("GET", "staff")).json();
    expect(list.items[0]).toMatchObject({
      email: "Equipe@Example.com",
      note: "fondateur",
      revokedAt: null,
    });
    await call("POST", "staff", { email: "equipe@example.com", on: false });
    expect(
      (await (await call("GET", "staff")).json()).items[0].revokedAt,
    ).not.toBeNull();
    expect(
      (await call("POST", "staff", { email: "personne@example.com", on: true }))
        .status,
    ).toBe(404);
  });

  it("liste et révoque un don ; 404 pour un don inconnu", async () => {
    const { grantGiftSubscription, setStaffFlag } = await import("./gifts");
    await t.db
      .insert(organizations)
      .values({ id: "o-adm", name: "O", slug: "o-adm" });
    await setStaffFlag(t.db, { userId: "u-adm", on: true, actor: "admin" });
    const g = await grantGiftSubscription(t.db, {
      organizationId: "o-adm",
      userId: "u-adm",
      planCode: "workstudio-equipe",
      promoCodeId: null,
      now: new Date(),
    });
    expect((await (await call("GET", "gifts")).json()).items).toHaveLength(1);
    const res = await call("POST", `gifts/${g.id}/revoke`, {
      reason: "essai terminé",
    });
    expect((await res.json()).gift).toMatchObject({ status: "revoked" });
    expect(
      (
        await call(
          "POST",
          "gifts/00000000-0000-4000-8000-000000000000/revoke",
          {},
        )
      ).status,
    ).toBe(404);
  });
});

describe("journal et routes inconnues", () => {
  it("expose le journal et refuse une route ou une méthode inconnue", async () => {
    expect(
      (await (await call("GET", "audit")).json()).items.length,
    ).toBeGreaterThan(0);
    expect((await call("GET", "inconnue")).status).toBe(404);
    expect((await call("DELETE", "settings")).status).toBe(405);
  });
});
