import { randomBytes } from "node:crypto";
import {
  billingCustomers,
  eq,
  organizations,
  subscriptions,
  trialClaims,
  trialDenials,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_BILLING_CONFIG } from "../ledger/config";
import { trialFor } from "../payments/purchase";
import { buildEvent } from "../stripe/testing";
import { FakePlanSource, type SubscriptionPlan } from "./plans";
import {
  normalizeEmailForTrial,
  stripeTrialInspector,
  type TrialInspector,
} from "./trial-guard";
import { processStripeEvent, type WebhookDeps } from "./webhook";

let t: TestDatabase;
const silentLog = { debug() {}, info() {}, warn() {}, error() {} } as never;

const PLAN: SubscriptionPlan = {
  id: "p1",
  code: "workstudio-pro",
  kind: "workstudio",
  interval: "month",
  priceCents: 4900,
  includedCreditsCents: 1000,
  family: "workstudio-pro-famille",
  trialDays: 14,
  trialCard: "default",
  stripeProductId: "prod_1",
  stripePriceId: "price_pro",
  translations: {},
};
const plans = new FakePlanSource([PLAN]);

interface Creds {
  cardFingerprint: string | null;
  email: string | null;
}
const creds = new Map<string, Creds>();
const canceled: string[] = [];
let cancelFails = false;
const inspector: TrialInspector = {
  inspect: async (subscriptionId) => creds.get(subscriptionId) ?? null,
  cancel: async (subscriptionId) => {
    if (cancelFails) throw new Error("Stripe indisponible");
    canceled.push(subscriptionId);
  },
};

function deps(over: Partial<WebhookDeps> = {}): WebhookDeps {
  return {
    db: t.db,
    plans,
    config: DEFAULT_BILLING_CONFIG,
    log: silentLog,
    trials: inspector,
    ...over,
  };
}

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

async function newOrg() {
  const id = `org_${randomBytes(5).toString("hex")}`;
  const customer = `cus_${randomBytes(5).toString("hex")}`;
  await t.db.insert(organizations).values({ id, name: id, slug: id });
  await t.db
    .insert(billingCustomers)
    .values({ organizationId: id, stripeCustomerId: customer });
  return { id, customer };
}

const NOW = Math.floor(new Date("2026-03-15T12:00:00Z").getTime() / 1000);
let n = 0;
function trialingSub(
  org: { id: string; customer: string },
  c: Creds,
  over: Record<string, unknown> = {},
) {
  n += 1;
  const id = `sub_${randomBytes(5).toString("hex")}_${n}`;
  creds.set(id, c);
  return {
    id,
    customer: org.customer,
    status: "trialing",
    cancel_at_period_end: false,
    canceled_at: null,
    metadata: { organization_id: org.id, plan_code: PLAN.code },
    items: {
      data: [
        {
          current_period_start: NOW,
          current_period_end: NOW + 14 * 86_400,
          price: { id: "price_pro" },
        },
      ],
    },
    ...over,
  };
}
const send = (type: string, sub: object, created = NOW) =>
  processStripeEvent(deps(), buildEvent(type, sub, { created }));
const claimsOf = (subId: string) =>
  t.db
    .select()
    .from(trialClaims)
    .where(eq(trialClaims.stripeSubscriptionId, subId));

describe("courriel normalisé pour l'essai", () => {
  it("ignore la casse, les alias +étiquette et, chez Gmail, les points et googlemail", () => {
    expect(normalizeEmailForTrial("  Jeanne.Tremblay+essai@Exemple.CA ")).toBe(
      "jeanne.tremblay@exemple.ca",
    );
    expect(normalizeEmailForTrial("j.e.a.n.n.e+x@gmail.com")).toBe(
      "jeanne@gmail.com",
    );
    expect(normalizeEmailForTrial("Jeanne@GoogleMail.com")).toBe(
      "jeanne@gmail.com",
    );
    // Ailleurs, les points comptent (ce sont deux boîtes différentes).
    expect(normalizeEmailForTrial("a.b@exemple.ca")).not.toBe(
      normalizeEmailForTrial("ab@exemple.ca"),
    );
  });
  it("refuse ce qui n'est pas une adresse", () => {
    for (const bad of ["", "pas-une-adresse", "@x.ca", "a@", "a b@x.ca"])
      expect(normalizeEmailForTrial(bad), bad).toBeNull();
  });
});

describe("webhook : un essai gratuit par carte et par courriel", () => {
  it("le premier essai est inscrit (carte et courriel) et reste actif, ses événements suivants ne l'annulent pas", async () => {
    const org = await newOrg();
    const sub = trialingSub(org, {
      cardFingerprint: "fp_premier",
      email: "alice@exemple.ca",
    });
    await send("customer.subscription.created", sub);
    await send("customer.subscription.updated", sub, NOW + 5);
    expect(canceled).not.toContain(sub.id);
    const claims = await claimsOf(sub.id);
    expect(claims.map((c) => c.kind).sort()).toEqual(["card", "email"]);
    expect(claims.every((c) => c.family === PLAN.family)).toBe(true);
    // Rien en clair dans la base : ni l'empreinte de carte ni le courriel.
    expect(JSON.stringify(claims)).not.toContain("fp_premier");
    expect(JSON.stringify(claims)).not.toContain("alice");
  });

  it("une nouvelle organisation avec la MÊME CARTE (autre courriel) voit son essai annulé, sans toucher au premier", async () => {
    const first = await newOrg();
    const a = trialingSub(first, {
      cardFingerprint: "fp_partagee",
      email: "premier@exemple.ca",
    });
    await send("customer.subscription.created", a);
    const second = await newOrg();
    const b = trialingSub(second, {
      cardFingerprint: "fp_partagee",
      email: "jetable-1@exemple.ca",
    });
    await send("customer.subscription.created", b);
    expect(canceled).toContain(b.id);
    expect(canceled).not.toContain(a.id);
    // Le courriel jetable n'a pas consommé d'essai : seul l'abonnement annulé est consigné.
    expect(await claimsOf(b.id)).toEqual([]);
    const [denial] = await t.db
      .select()
      .from(trialDenials)
      .where(eq(trialDenials.stripeSubscriptionId, b.id));
    expect(denial).toMatchObject({
      organizationId: second.id,
      reason: "card",
      family: PLAN.family,
    });
    // Rejouer l'événement (ou en recevoir un autre) n'appelle pas Stripe une seconde fois.
    const before = canceled.length;
    await send("customer.subscription.updated", b, NOW + 9);
    expect(canceled.length).toBe(before);
  });

  it("le MÊME COURRIEL (alias +étiquette, points Gmail) avec une autre carte voit aussi son essai annulé", async () => {
    const first = await newOrg();
    await send(
      "customer.subscription.created",
      trialingSub(first, {
        cardFingerprint: "fp_carte-1",
        email: "ma.boite@gmail.com",
      }),
    );
    const second = await newOrg();
    const b = trialingSub(second, {
      cardFingerprint: "fp_carte-2",
      email: "maboite+essai2@googlemail.com",
    });
    await send("customer.subscription.created", b);
    expect(canceled).toContain(b.id);
    const [denial] = await t.db
      .select()
      .from(trialDenials)
      .where(eq(trialDenials.stripeSubscriptionId, b.id));
    expect(denial?.reason).toBe("email");
  });

  it("sans carte (essai sans moyen de paiement), le courriel seul limite : un par courriel", async () => {
    const a = trialingSub(await newOrg(), {
      cardFingerprint: null,
      email: "sans.carte@exemple.ca",
    });
    await send("customer.subscription.created", a);
    expect(canceled).not.toContain(a.id);
    expect((await claimsOf(a.id)).map((c) => c.kind)).toEqual(["email"]);
    const b = trialingSub(await newOrg(), {
      cardFingerprint: null,
      email: "Sans.Carte+2@exemple.ca",
    });
    await send("customer.subscription.created", b);
    expect(canceled).toContain(b.id);
  });

  it("la carte arrivée après coup (événement suivant) est inscrite à ce moment", async () => {
    const org = await newOrg();
    const sub = trialingSub(org, {
      cardFingerprint: null,
      email: "tard@exemple.ca",
    });
    await send("customer.subscription.created", sub);
    creds.set(sub.id, {
      cardFingerprint: "fp_tardive",
      email: "tard@exemple.ca",
    });
    await send("customer.subscription.updated", sub, NOW + 20);
    expect((await claimsOf(sub.id)).map((c) => c.kind).sort()).toEqual([
      "card",
      "email",
    ]);
  });

  it("une autre famille d'offre a son propre essai", async () => {
    const other: SubscriptionPlan = {
      ...PLAN,
      id: "p2",
      code: "workstudio-equipe",
      family: "autre-famille",
      stripePriceId: "price_equipe",
    };
    const planSource = new FakePlanSource([PLAN, other]);
    const c = { cardFingerprint: "fp_deux-familles", email: "deux@exemple.ca" };
    const a = trialingSub(await newOrg(), c);
    await processStripeEvent(
      deps({ plans: planSource }),
      buildEvent("customer.subscription.created", a, { created: NOW }),
    );
    const b = trialingSub(await newOrg(), c, {
      metadata: { plan_code: other.code },
    });
    const orgB = await newOrg();
    b.metadata = { organization_id: orgB.id, plan_code: other.code };
    b.customer = orgB.customer;
    await processStripeEvent(
      deps({ plans: planSource }),
      buildEvent("customer.subscription.created", b, { created: NOW + 1 }),
    );
    expect(canceled).not.toContain(b.id);
  });

  it("un abonnement qui n'est pas en essai n'inscrit rien et n'interroge pas Stripe", async () => {
    const org = await newOrg();
    const sub = trialingSub(
      org,
      { cardFingerprint: "fp_actif", email: "actif@exemple.ca" },
      { status: "active" },
    );
    const spy = vi.spyOn(inspector, "inspect");
    await send("customer.subscription.created", sub);
    expect(spy).not.toHaveBeenCalled();
    expect(await claimsOf(sub.id)).toEqual([]);
    spy.mockRestore();
  });

  it("si l'annulation échoue, l'événement échoue (Stripe le renverra) et rien n'est enregistré", async () => {
    const first = await newOrg();
    await send(
      "customer.subscription.created",
      trialingSub(first, {
        cardFingerprint: "fp_echec",
        email: "echec1@exemple.ca",
      }),
    );
    const b = trialingSub(await newOrg(), {
      cardFingerprint: "fp_echec",
      email: "echec2@exemple.ca",
    });
    cancelFails = true;
    await expect(send("customer.subscription.created", b)).rejects.toThrow();
    cancelFails = false;
    const rows = await t.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, b.id));
    expect(rows).toEqual([]);
    // Au renvoi de Stripe, l'annulation réussit.
    await send("customer.subscription.created", b);
    expect(canceled).toContain(b.id);
  });
});

describe("Checkout : l'essai n'est pas offert à un courriel déjà servi", () => {
  const input = (organizationId: string, email?: string) => ({
    plan: PLAN,
    plans,
    organizationId,
    settings: { trialRequiresCard: true },
    ...(email ? { email } : {}),
  });

  it("offre l'essai à un courriel neuf, le refuse à un courriel (normalisé) déjà inscrit", async () => {
    const used = await newOrg();
    await send(
      "customer.subscription.created",
      trialingSub(used, {
        cardFingerprint: "fp_checkout",
        email: "deja.servi@exemple.ca",
      }),
    );
    const fresh = await newOrg();
    expect(
      await trialFor(t.db, input(fresh.id, "tout.neuf@exemple.ca")),
    ).toEqual({ days: 14, requireCard: true });
    expect(
      await trialFor(t.db, input(fresh.id, "Deja.Servi+bis@exemple.ca")),
    ).toBeUndefined();
    // Sans courriel fourni, le comportement d'avant est conservé.
    expect(await trialFor(t.db, input(fresh.id))).toEqual({
      days: 14,
      requireCard: true,
    });
  });
});

describe("lecture et résiliation chez Stripe", () => {
  const card = (fp: string) => ({ id: "pm_1", card: { fingerprint: fp } });
  const fake = (over: {
    sub?: Record<string, unknown>;
    retrieveError?: unknown;
    cancelError?: unknown;
    status?: string;
    methods?: unknown[];
    retrievedPm?: unknown;
  }) => {
    const cancel = vi.fn(async () => {
      if (over.cancelError) throw over.cancelError;
      return {};
    });
    const retrieve = vi.fn(async (_id: string, opts?: unknown) => {
      if (over.retrieveError && opts) throw over.retrieveError;
      if (!opts) return { status: over.status ?? "trialing" };
      return over.sub;
    });
    const stripe = {
      subscriptions: { retrieve, cancel },
      paymentMethods: {
        retrieve: vi.fn(async () => over.retrievedPm),
        list: vi.fn(async () => ({ data: over.methods ?? [] })),
      },
    };
    return { stripe: stripe as never, cancel, retrieve };
  };

  it("lit l'empreinte de la carte par défaut de l'abonnement et le courriel du client", async () => {
    const { stripe } = fake({
      sub: {
        default_payment_method: card("fp_abonnement"),
        customer: { id: "cus_1", email: "a@exemple.ca", invoice_settings: {} },
      },
    });
    expect(await stripeTrialInspector(stripe).inspect("sub_1")).toEqual({
      cardFingerprint: "fp_abonnement",
      email: "a@exemple.ca",
    });
  });

  it("à défaut, utilise la carte par défaut du client, puis la plus récente de ses cartes", async () => {
    const viaCustomer = fake({
      sub: {
        default_payment_method: null,
        customer: {
          id: "cus_1",
          email: "a@exemple.ca",
          invoice_settings: { default_payment_method: "pm_9" },
        },
      },
      retrievedPm: card("fp_client"),
    });
    expect(
      (await stripeTrialInspector(viaCustomer.stripe).inspect("sub_1"))
        ?.cardFingerprint,
    ).toBe("fp_client");
    const viaList = fake({
      sub: {
        default_payment_method: null,
        customer: { id: "cus_1", email: null, invoice_settings: {} },
      },
      methods: [card("fp_liste")],
    });
    expect(await stripeTrialInspector(viaList.stripe).inspect("sub_1")).toEqual(
      { cardFingerprint: "fp_liste", email: null },
    );
  });

  it("un abonnement introuvable (événement de développement) n'est pas une erreur ; une autre panne remonte", async () => {
    const missing = fake({ retrieveError: { code: "resource_missing" } });
    expect(
      await stripeTrialInspector(missing.stripe).inspect("sub_x"),
    ).toBeNull();
    const down = fake({ retrieveError: new Error("réseau") });
    await expect(
      stripeTrialInspector(down.stripe).inspect("sub_x"),
    ).rejects.toThrow("réseau");
  });

  it("résilie sans prorata ni facture ; un abonnement déjà résilié n'est pas une erreur, une autre panne remonte", async () => {
    const ok = fake({});
    await stripeTrialInspector(ok.stripe).cancel("sub_1");
    expect(ok.cancel).toHaveBeenCalledWith("sub_1", {
      prorate: false,
      invoice_now: false,
    });
    const already = fake({
      cancelError: { code: "x", message: "déjà résilié" },
      status: "canceled",
    });
    await expect(
      stripeTrialInspector(already.stripe).cancel("sub_1"),
    ).resolves.toBeUndefined();
    const broken = fake({
      cancelError: new Error("Stripe indisponible"),
      status: "trialing",
    });
    await expect(
      stripeTrialInspector(broken.stripe).cancel("sub_1"),
    ).rejects.toThrow("Stripe indisponible");
  });
});
