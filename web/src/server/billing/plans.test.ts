import { describe, expect, it, vi } from "vitest";
import {
  createDirectusPlanSource,
  FakePlanSource,
  planConfigVersion,
  type SubscriptionPlan,
} from "./plans";

const row = (over: Record<string, unknown> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  code: "workstudio-pro",
  kind: "workstudio",
  status: "published",
  interval: "month",
  price_cents: 4900,
  included_credits_cents: 1000,
  stripe_product_id: null,
  stripe_price_id: null,
  sort: 1,
  translations: [
    {
      languages_code: "fr-CA",
      name: "WorkStudio Pro",
      description: "Pour les équipes.",
      features: ["a", "b"],
    },
    {
      languages_code: "en-CA",
      name: "WorkStudio Pro",
      description: null,
      features: [],
    },
  ],
  ...over,
});

function fetchReturning(data: unknown[], status = 200) {
  return vi.fn(async (_url: string, _init?: RequestInit) =>
    Response.json({ data }, { status }),
  );
}

const cfg = (f: typeof fetch) => ({
  baseUrl: "http://directus.test",
  token: "reader-token",
  fetch: f,
});

describe("lecteur Directus des abonnements", () => {
  it("demande seulement les plans publiés, avec le jeton lecteur, côté serveur", async () => {
    const f = fetchReturning([row()]);
    const source = createDirectusPlanSource(cfg(f as unknown as typeof fetch));
    const plans = await source.listPublished();
    expect(plans).toHaveLength(1);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(decodeURIComponent(url)).toContain("filter[status][_eq]=published");
    expect(url).toContain("/items/subscription_plans");
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer reader-token",
    );
  });

  it("lit l'offre (famille), l'essai gratuit et le réglage de carte ; la famille retombe sur le code", async () => {
    const f = fetchReturning([
      row({ family: "workstudio-equipe", trial_days: 14, trial_card: "not_required" }),
      row({ code: "seul" }),
    ]);
    const [a, b] = await createDirectusPlanSource(
      cfg(f as unknown as typeof fetch),
    ).listPublished();
    expect(a).toMatchObject({ family: "workstudio-equipe", trialDays: 14, trialCard: "not_required" });
    expect(b).toMatchObject({ family: "seul", trialDays: 0, trialCard: "default" });
    const url = decodeURIComponent((f.mock.calls[0] as [string])[0]);
    expect(url).toContain("trial_days");
    // le prix suggéré n'est jamais demandé par le site
    expect(url).not.toContain("suggested_price_cents");
  });

  it("refuse une durée d'essai hors de 0 à 365 jours (le plan reste lisible sans essai)", async () => {
    const f = fetchReturning([row({ trial_days: 9999 }), row({ code: "n", trial_days: -3 })]);
    const plans = await createDirectusPlanSource(
      cfg(f as unknown as typeof fetch),
    ).listPublished();
    expect(plans.map((p) => p.trialDays)).toEqual([0, 0]);
  });

  it("refiltre côté serveur : un brouillon renvoyé par Directus (sans licence) est écarté", async () => {
    const f = fetchReturning([
      row(),
      row({ code: "brouillon", status: "draft" }),
      row({ code: "archive", status: "archived" }),
    ]);
    const plans = await createDirectusPlanSource(
      cfg(f as unknown as typeof fetch),
    ).listPublished();
    expect(plans.map((p) => p.code)).toEqual(["workstudio-pro"]);
  });

  it("n'accepte jamais un prix absent, nul ou non entier (jamais 0 $)", async () => {
    const f = fetchReturning([
      row({ code: "a", price_cents: 0 }),
      row({ code: "b", price_cents: null }),
      row({ code: "c", price_cents: 49.5 }),
      row({ code: "d", price_cents: 100 }),
    ]);
    const source = createDirectusPlanSource(cfg(f as unknown as typeof fetch));
    const plans = await source.listPublished();
    expect(plans.map((p) => p.code)).toEqual(["d"]);
  });

  it("getByCode et getByPriceId", async () => {
    const f = fetchReturning([
      row({ stripe_price_id: "price_123", stripe_product_id: "prod_1" }),
    ]);
    const source = createDirectusPlanSource(cfg(f as unknown as typeof fetch));
    expect((await source.getByCode("workstudio-pro"))?.stripePriceId).toBe(
      "price_123",
    );
    expect(await source.getByCode("inconnu")).toBeNull();
    expect((await source.getByPriceId("price_123"))?.code).toBe(
      "workstudio-pro",
    );
    expect(await source.getByPriceId("price_x")).toBeNull();
  });

  it("échoue clairement si Directus est indisponible (jamais une liste vide silencieuse)", async () => {
    const f = fetchReturning([], 503);
    await expect(
      createDirectusPlanSource(
        cfg(f as unknown as typeof fetch),
      ).listPublished(),
    ).rejects.toThrow(/Directus/);
  });

  it("n'inclut jamais le jeton dans le message d'erreur", async () => {
    const f = vi.fn(async () => {
      throw new Error("boom reader-token");
    });
    await expect(
      createDirectusPlanSource(
        cfg(f as unknown as typeof fetch),
      ).listPublished(),
    ).rejects.not.toThrow(/reader-token/);
  });
});

describe("version de configuration d'un plan", () => {
  const plan = (over: Partial<SubscriptionPlan> = {}): SubscriptionPlan => ({
    id: "x",
    code: "p",
    kind: "api",
    interval: "month",
    priceCents: 1000,
    includedCreditsCents: 500,
    family: "f",
    trialDays: 0,
    trialCard: "default",
    stripeProductId: null,
    stripePriceId: null,
    translations: {},
    ...over,
  });

  it("est stable et dépend du prix et des crédits inclus, pas du libellé", () => {
    const a = planConfigVersion(plan());
    expect(planConfigVersion(plan())).toBe(a);
    expect(planConfigVersion(plan({ priceCents: 1100 }))).not.toBe(a);
    expect(planConfigVersion(plan({ includedCreditsCents: 0 }))).not.toBe(a);
    expect(
      planConfigVersion(
        plan({
          translations: {
            "fr-CA": { name: "Autre", description: null, features: [] },
          },
        }),
      ),
    ).toBe(a);
  });
});

describe("FakePlanSource (données factices)", () => {
  it("sert les plans fournis", async () => {
    const s = new FakePlanSource([
      {
        id: "x",
        code: "p",
        kind: "api",
        interval: "year",
        priceCents: 1000,
        includedCreditsCents: 0,
        family: "f",
        trialDays: 0,
        trialCard: "default",
        stripeProductId: null,
        stripePriceId: "price_p",
        translations: {},
      },
    ]);
    expect((await s.getByPriceId("price_p"))?.code).toBe("p");
    expect(await s.listPublished()).toHaveLength(1);
  });
});
