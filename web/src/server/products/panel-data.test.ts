import { describe, expect, it } from "vitest";
import type { OrgEntitlements } from "../billing/entitlements";
import {
  creditsView,
  planView,
  productHints,
  STORAGE_WARNING_PERCENT,
  storageView,
} from "./panel-data";
import { resolveProducts } from "./registry";

const GO = 1_000_000_000;
const storage = (
  over: Partial<OrgEntitlements["storage"]> = {},
): OrgEntitlements["storage"] => ({
  quotaBytes: GO,
  extraBytes: 0,
  usedBytes: 0,
  byProduct: { workstudio: 0, code: 0, rag: 0, creative: 0, bot: 0 },
  ...over,
});
const ent = (over: Partial<OrgEntitlements> = {}): OrgEntitlements => ({
  planCode: "nexora-base",
  interval: "month",
  credits: { subscription: 700, refill: 300, total: 1000 },
  storage: storage(),
  canUseModels: true,
  ...over,
});

describe("espace : barre globale, ventilation et avertissements", () => {
  it("sous 80 % : niveau « ok », pourcentage arrondi vers le bas", () => {
    const v = storageView(storage({ usedBytes: 799_999_999 }), false);
    expect(v.level).toBe("ok");
    expect(v.percent).toBe(79);
    expect(v.totalBytes).toBe(GO);
    expect(v.remainingBytes).toBe(200_000_001);
  });

  it("à 80 % pile : avertissement ; juste en dessous : aucun", () => {
    expect(STORAGE_WARNING_PERCENT).toBe(80);
    expect(storageView(storage({ usedBytes: 800_000_000 }), false).level).toBe(
      "warning",
    );
    expect(storageView(storage({ usedBytes: 799_999_999 }), false).level).toBe(
      "ok",
    );
    expect(
      storageView(storage({ usedBytes: 999_999_999 }), false).percent,
    ).toBe(99);
  });

  it("à 100 % ou plus : plein, message clair ; le pourcentage ne dépasse pas 100", () => {
    const full = storageView(storage({ usedBytes: GO }), false);
    expect(full.level).toBe("full");
    expect(full.percent).toBe(100);
    expect(full.remainingBytes).toBe(0);
    const over = storageView(storage({ usedBytes: GO + 5 }), false);
    expect(over.level).toBe("full");
    expect(over.percent).toBe(100);
    expect(over.remainingBytes).toBe(0);
  });

  it("les Go supplémentaires s'ajoutent au quota", () => {
    const v = storageView(
      storage({ usedBytes: 1_500_000_000, extraBytes: 2 * GO }),
      false,
    );
    expect(v.totalBytes).toBe(3 * GO);
    expect(v.level).toBe("ok");
    expect(v.percent).toBe(50);
  });

  it("sans espace : « aucun » s'il n'y a rien d'écrit, « plein » s'il reste des données (écritures refusées)", () => {
    expect(storageView(storage({ quotaBytes: 0 }), false).level).toBe("none");
    expect(
      storageView(storage({ quotaBytes: 0, usedBytes: 10 }), false).level,
    ).toBe("full");
  });

  it("l'organisation « maison » n'est pas limitée : l'usage est montré, sans pourcentage ni alerte", () => {
    const v = storageView(storage({ quotaBytes: 0, usedBytes: 5 * GO }), true);
    expect(v.level).toBe("house");
    expect(v.percent).toBe(0);
    expect(v.usedBytes).toBe(5 * GO);
  });

  it("ventilation par produit : seulement ce qui occupe de l'espace, du plus gros au plus petit, part du quota total", () => {
    const v = storageView(
      storage({
        usedBytes: 600_000_000,
        byProduct: {
          workstudio: 100_000_000,
          code: 0,
          rag: 400_000_000,
          creative: 0,
          bot: 100_000_000,
        },
      }),
      false,
    );
    expect(v.products.map((p) => p.product)).toEqual([
      "rag",
      "workstudio",
      "bot",
    ]);
    expect(v.products[0]).toMatchObject({ product: "rag", bytes: 400_000_000 });
    expect(v.products[0]?.percentOfTotal).toBe(40);
    // l'égalité garde l'ordre du contrat, pour un affichage stable
    expect(v.products.map((p) => p.bytes)).toEqual([
      400_000_000, 100_000_000, 100_000_000,
    ]);
  });

  it("la ventilation ne dépasse jamais la barre : part bornée à 100", () => {
    const v = storageView(
      storage({
        usedBytes: 3 * GO,
        byProduct: { workstudio: 0, code: 3 * GO, rag: 0, creative: 0, bot: 0 },
      }),
      false,
    );
    expect(v.products[0]?.percentOfTotal).toBe(100);
  });
});

describe("crédits : abonnement et recharge séparés", () => {
  const base = { house: false, blocked: false, subscriptionExpiresAt: null };

  it("reprend les crédits de l'abonnement et de la recharge tels que le contrat les donne", () => {
    const v = creditsView(ent(), {
      ...base,
      subscriptionExpiresAt: new Date("2026-11-30T05:00:00Z"),
    });
    expect(v.level).toBe("ok");
    expect(v.subscription).toBe(700);
    expect(v.refill).toBe(300);
    expect(v.total).toBe(1000);
    expect(v.subscriptionExpiresAt?.toISOString()).toBe(
      "2026-11-30T05:00:00.000Z",
    );
  });

  it("l'échéance n'est montrée que s'il reste des crédits d'abonnement", () => {
    const v = creditsView(
      ent({ credits: { subscription: 0, refill: 50, total: 50 } }),
      { ...base, subscriptionExpiresAt: new Date("2026-11-30T05:00:00Z") },
    );
    expect(v.subscriptionExpiresAt).toBeNull();
  });

  it("zéro crédit : niveau « vide » (recharger ou choisir une offre)", () => {
    const v = creditsView(
      ent({
        credits: { subscription: 0, refill: 0, total: 0 },
        canUseModels: false,
      }),
      base,
    );
    expect(v.level).toBe("empty");
    expect(v.canUseModels).toBe(false);
  });

  it("compte bloqué (solde négatif) : niveau « bloqué », prioritaire sur « vide »", () => {
    const v = creditsView(
      ent({
        credits: { subscription: 0, refill: 0, total: 0 },
        canUseModels: false,
      }),
      { ...base, blocked: true },
    );
    expect(v.level).toBe("blocked");
  });

  it("organisation « maison » : accès gratuit, jamais « vide » même à zéro", () => {
    const v = creditsView(
      ent({
        credits: { subscription: 0, refill: 0, total: 0 },
        canUseModels: true,
      }),
      { ...base, house: true },
    );
    expect(v.level).toBe("free");
  });
});

describe("offre en cours", () => {
  const sub = (over = {}) => ({
    id: "s1",
    planCode: "nexora-base",
    status: "active" as const,
    access: "full" as const,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: new Date("2026-11-30T05:00:00Z"),
    graceEndsAt: null,
    ...over,
  });

  it("sans offre : « aucun abonnement »", () => {
    expect(planView(ent({ planCode: null, interval: null }), [])).toEqual({
      kind: "none",
    });
  });

  it("retrouve l'abonnement de l'offre en vigueur, son rythme et son renouvellement", () => {
    const v = planView(
      ent({ interval: "year", planCode: "nexora-base-annuel" }),
      [sub({ planCode: "nexora-base-annuel" })],
    );
    expect(v).toMatchObject({
      kind: "active",
      code: "nexora-base",
      interval: "year",
    });
    expect(v.kind === "active" && v.renewsAt?.toISOString()).toBe(
      "2026-11-30T05:00:00.000Z",
    );
  });

  it("le suffixe « -annuel » est retiré du code d'affichage ; le code inconnu reste tel quel", () => {
    const v = planView(
      ent({ planCode: "mon-offre-annuel", interval: "year" }),
      [sub({ planCode: "mon-offre-annuel" })],
    );
    expect(v.kind === "active" && v.code).toBe("mon-offre");
  });

  it("résiliation demandée : l'offre se termine à la fin de la période", () => {
    const v = planView(ent(), [sub({ cancelAtPeriodEnd: true })]);
    expect(v).toMatchObject({ kind: "active", ending: true });
  });

  it("paiement en retard (délai de grâce) : le dit, avec la date limite", () => {
    const grace = new Date("2026-11-05T05:00:00Z");
    const v = planView(ent(), [
      sub({ access: "grace", status: "past_due", graceEndsAt: grace }),
    ]);
    expect(v).toMatchObject({ kind: "active", pastDue: true });
    expect(v.kind === "active" && v.graceEndsAt?.toISOString()).toBe(
      grace.toISOString(),
    );
  });

  it("un abonnement d'un autre produit (VPS, sans offre) ne se confond pas avec l'offre", () => {
    const v = planView(ent(), [
      sub({ id: "vps", planCode: null }),
      sub({ id: "s2" }),
    ]);
    expect(v.kind === "active" && v.renewsAt).toBeTruthy();
  });
});

describe("pense-bête des cartes (ce que chaque produit consomme et ce qui manque)", () => {
  const products = resolveProducts({
    env: { NEXORA_PRODUCT_CODE: "1", NEXORA_PRODUCT_RAG: "1" },
    workstudioUrl: "https://ws.example",
  });
  const hints = (e: OrgEntitlements, free = false) =>
    productHints(products, e, { free });

  it("sans crédit, les produits qui appellent un modèle le disent ; ceux qui n'en appellent pas, non", () => {
    const h = hints(
      ent({
        credits: { subscription: 0, refill: 0, total: 0 },
        canUseModels: false,
      }),
    );
    expect(h.workstudio?.needsCredits).toBe(true);
    expect(h.rag?.needsCredits).toBe(true);
    expect(h["privacy-router"]?.needsCredits).toBe(false);
    expect(h.vps?.needsCredits).toBe(false);
  });

  it("avec des crédits, plus aucun produit ne manque de crédits", () => {
    const h = hints(ent());
    for (const p of products) expect(h[p.id]?.needsCredits, p.id).toBe(false);
  });

  it("sans espace, les produits qui écrivent chez Nexora réclament de l'espace ; les autres non", () => {
    const h = hints(ent({ storage: storage({ quotaBytes: 0 }) }));
    expect(h.code?.needsStorage).toBe(true);
    expect(h.rag?.needsStorage).toBe(true);
    expect(h.webpilot?.needsStorage).toBe(false);
    expect(h.vps?.needsStorage).toBe(false);
  });

  it("espace plein : réclame aussi de l'espace ; l'organisation « maison » ne manque jamais de rien", () => {
    const full = hints(ent({ storage: storage({ usedBytes: GO }) }));
    expect(full.rag?.needsStorage).toBe(true);
    const house = hints(
      ent({
        credits: { subscription: 0, refill: 0, total: 0 },
        storage: storage({ quotaBytes: 0 }),
      }),
      true,
    );
    for (const p of products) {
      expect(house[p.id]?.needsCredits, p.id).toBe(false);
      expect(house[p.id]?.needsStorage, p.id).toBe(false);
    }
  });
});
