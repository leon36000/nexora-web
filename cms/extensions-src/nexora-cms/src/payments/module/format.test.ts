import { describe, expect, test } from "bun:test";
import {
  buildBatch,
  buildPromoDefinition,
  centsToDollars,
  describePromo,
  dollarsToCents,
  EMPTY_PROMO_FORM,
  errorMessage,
  type PlanItem,
  type PromoItem,
  planNextStep,
  syncState,
} from "./format";

describe("montants", () => {
  test("dollars -> cents sans nombre à virgule flottante", () => {
    expect(dollarsToCents("129")).toBe(12900);
    expect(dollarsToCents("129,5")).toBe(12950);
    expect(dollarsToCents("0.29")).toBe(29);
    expect(dollarsToCents(" 1 250,00 $ ")).toBe(125000);
    for (const bad of ["", "0", "-5", "abc", "1,234", "12.345", "1e3"])
      expect(dollarsToCents(bad)).toBeNull();
  });
  test("cents -> dollars", () => {
    expect(centsToDollars(12900).replace(/ /g, " ")).toBe("129,00 $");
    expect(centsToDollars(null)).toBe("—");
  });
});

describe("formulaire d'un code promo", () => {
  const form = (over = {}) => ({
    ...EMPTY_PROMO_FORM,
    code: "bienvenue-20",
    percent: "20",
    ...over,
  });

  test("pourcentage : définition normalisée", () => {
    const r = buildPromoDefinition(
      form({
        maxRedemptions: "50",
        expiresOn: "2027-01-31",
        minAmount: "25",
        onePerCustomer: true,
      }),
      true,
    );
    expect(r).toEqual({
      ok: true,
      payload: {
        code: "BIENVENUE-20",
        kind: "percent",
        scopes: ["subscriptions"],
        percentOff: 20,
        duration: "once",
        maxRedemptions: 50,
        expiresAt: "2027-01-31T23:59:59.000Z",
        minAmountCents: 2500,
        firstOrderOnly: false,
        onePerCustomer: true,
      },
    });
  });

  test("montant, essai, gratuit et personnel", () => {
    expect(
      buildPromoDefinition(form({ kind: "amount", amount: "15,50" }), true),
    ).toMatchObject({ ok: true, payload: { amountOffCents: 1550 } });
    expect(
      buildPromoDefinition(form({ kind: "trial", trialDays: "30" }), true),
    ).toMatchObject({ ok: true, payload: { trialDays: 30 } });
    const trialPayload = (
      buildPromoDefinition(form({ kind: "trial", trialDays: "30" }), true) as {
        payload: Record<string, unknown>;
      }
    ).payload;
    expect("duration" in trialPayload).toBe(false);
    expect(
      buildPromoDefinition(form({ kind: "free", duration: "forever" }), true),
    ).toMatchObject({
      ok: true,
      payload: { kind: "free", duration: "forever" },
    });
    expect(
      buildPromoDefinition(
        form({ kind: "staff", scopes: ["subscriptions", "vps", "credits"] }),
        true,
      ).ok,
    ).toBe(true);
  });

  test("erreurs claires en français", () => {
    const bad = buildPromoDefinition(
      form({
        code: "x",
        percent: "150",
        scopes: [],
        expiresOn: "demain",
        maxRedemptions: "0",
      }),
      true,
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors.join(" ")).toMatch(/Code/);
      expect(bad.errors.join(" ")).toMatch(/Pourcentage/);
      expect(bad.errors.join(" ")).toMatch(/portée/);
      expect(bad.errors.join(" ")).toMatch(/expiration/);
      expect(bad.errors.join(" ")).toMatch(/Utilisations/);
    }
    const credits = buildPromoDefinition(
      form({ kind: "free", scopes: ["credits"] }),
      true,
    );
    expect(credits.ok === false && credits.errors.join(" ")).toMatch(/100 %/);
    const trial = buildPromoDefinition(
      form({ kind: "trial", trialDays: "7", scopes: ["vps"] }),
      true,
    );
    expect(trial.ok === false && trial.errors.join(" ")).toMatch(/abonnements/);
    const rep = buildPromoDefinition(form({ duration: "repeating" }), true);
    expect(rep.ok === false && rep.errors.join(" ")).toMatch(/mois/);
  });

  test("lot : préfixe, nombre, longueur ; la définition ne porte pas de code", () => {
    const ok = buildBatch(form({ maxRedemptions: "1" }), {
      prefix: "ete",
      count: "200",
      length: "8",
    });
    expect(ok).toMatchObject({
      ok: true,
      payload: {
        prefix: "ETE",
        count: 200,
        length: 8,
        definition: { kind: "percent", percentOff: 20, maxRedemptions: 1 },
      },
    });
    expect(
      "code" in
        (ok as unknown as { payload: { definition: object } }).payload
          .definition,
    ).toBe(false);
    for (const b of [
      { prefix: "a_b", count: "5", length: "8" },
      { prefix: "", count: "0", length: "8" },
      { prefix: "", count: "9999", length: "8" },
      { prefix: "", count: "5", length: "2" },
    ])
      expect(buildBatch(form(), b).ok).toBe(false);
  });
});

describe("descriptions et états", () => {
  const base: PromoItem = {
    id: "1",
    code: "A",
    label: "",
    kind: "percent",
    percentOff: 20,
    amountOffCents: null,
    trialDays: null,
    scopes: ["vps"],
    duration: "repeating",
    durationMonths: 3,
    maxRedemptions: null,
    expiresAt: null,
    firstOrderOnly: false,
    onePerCustomer: false,
    minAmountCents: null,
    status: "active",
    stripePromotionCodeId: null,
    stripeSyncError: null,
    redemptions: 0,
    discountCents: 0,
  };
  test("description d'un code", () => {
    expect(describePromo(base)).toBe("20 % de rabais, pendant 3 mois");
    expect(describePromo({ ...base, kind: "free", duration: "forever" })).toBe(
      "Gratuit (100 %), pour toujours",
    );
    expect(describePromo({ ...base, kind: "trial", trialDays: 14 })).toBe(
      "Essai de 14 jours",
    );
    expect(describePromo({ ...base, kind: "staff" })).toBe(
      "Offert par l’équipe",
    );
  });
  test("état de synchronisation", () => {
    expect(syncState(base).label).toBe("À synchroniser");
    expect(syncState({ ...base, stripePromotionCodeId: "promo_1" }).label).toBe(
      "Synchronisé",
    );
    expect(syncState({ ...base, stripeSyncError: "x" }).type).toBe("danger");
    expect(syncState({ ...base, kind: "staff" }).label).toBe("Sans Stripe");
  });
});

describe("prochaine étape d'une offre", () => {
  const plan = (over: Partial<PlanItem> = {}): PlanItem => ({
    id: "1",
    code: "p",
    status: "draft",
    interval: "month",
    price_cents: null,
    suggested_price_cents: 3900,
    trial_days: 14,
    included_credits_cents: 1000,
    stripe_product_id: null,
    stripe_price_id: null,
    stripe_synced_at: null,
    ...over,
  });
  test("prix → publication → Stripe → vendable", () => {
    expect(planNextStep(plan()).action).toBe("adopt");
    expect(planNextStep(plan({ suggested_price_cents: null })).action).toBe(
      "none",
    );
    expect(planNextStep(plan({ price_cents: 3900 })).label).toMatch(
      /Publier la fiche/,
    );
    expect(
      planNextStep(plan({ price_cents: 3900, status: "published" })),
    ).toEqual({ label: "Publier vers Stripe", action: "publish" });
    expect(
      planNextStep(
        plan({
          price_cents: 3900,
          status: "published",
          stripe_price_id: "price_1",
        }),
      ).label,
    ).toBe("Vendable");
  });
});

describe("messages d'erreur", () => {
  test("lit le message de Directus ou de l'app, avec les champs en cause", () => {
    expect(
      errorMessage(
        { response: { data: { errors: [{ message: "Non" }] } } },
        "x",
      ),
    ).toBe("Non");
    expect(
      errorMessage(
        { response: { data: { message: "Doublon", issues: ["code : déjà"] } } },
        "x",
      ),
    ).toBe("Doublon (code : déjà)");
    expect(errorMessage(new Error("réseau"), "Échec")).toBe("Échec");
  });
});
