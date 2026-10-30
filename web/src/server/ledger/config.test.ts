import { describe, expect, it } from "vitest";
import {
  configVersion,
  creditExpiresAt,
  DEFAULT_BILLING_CONFIG,
  loadBillingConfig,
} from "./config";

describe("configuration de facturation", () => {
  it("a des valeurs par défaut conformes à la conception du 30/10 : CAD, crédits de recharge sans expiration", () => {
    const c = loadBillingConfig({});
    expect(c).toMatchObject({
      currency: "cad",
      creditExpiryMonths: 0,
    });
    expect(c.minPurchaseCents).toBeGreaterThan(0);
    expect(c.maxPurchaseCents).toBeGreaterThan(c.minPurchaseCents);
    expect(c.graceDays).toBeGreaterThan(0);
  });

  it("l'expiration est un paramètre (variable d'environnement)", () => {
    expect(
      loadBillingConfig({ BILLING_CREDIT_EXPIRY_MONTHS: "6" })
        .creditExpiryMonths,
    ).toBe(6);
  });

  it("0 mois veut dire « sans expiration » ; une valeur négative est refusée", () => {
    expect(
      loadBillingConfig({ BILLING_CREDIT_EXPIRY_MONTHS: "0" })
        .creditExpiryMonths,
    ).toBe(0);
    expect(() =>
      loadBillingConfig({ BILLING_CREDIT_EXPIRY_MONTHS: "-1" }),
    ).toThrow(/BILLING_CREDIT_EXPIRY_MONTHS/);
  });

  it("creditExpiresAt : null sans expiration, sinon le même jour N mois plus tard", () => {
    const now = new Date("2026-10-30T12:00:00Z");
    expect(creditExpiresAt(now, DEFAULT_BILLING_CONFIG)).toBeNull();
    expect(
      creditExpiresAt(now, {
        ...DEFAULT_BILLING_CONFIG,
        creditExpiryMonths: 6,
      }),
    ).toEqual(new Date("2027-04-30T12:00:00Z"));
  });

  it("refuse une valeur invalide plutôt que de la corriger en silence", () => {
    expect(() =>
      loadBillingConfig({ BILLING_MIN_PURCHASE_CENTS: "abc" }),
    ).toThrow(/BILLING_MIN_PURCHASE_CENTS/);
    expect(() =>
      loadBillingConfig({
        BILLING_MIN_PURCHASE_CENTS: "5000",
        BILLING_MAX_PURCHASE_CENTS: "1000",
      }),
    ).toThrow();
  });

  it("la version de configuration est stable et change avec le contenu", () => {
    const a = configVersion(DEFAULT_BILLING_CONFIG);
    expect(configVersion({ ...DEFAULT_BILLING_CONFIG })).toBe(a);
    expect(a).toMatch(/^cfg_[0-9a-f]{16}$/);
    expect(
      configVersion({ ...DEFAULT_BILLING_CONFIG, creditExpiryMonths: 6 }),
    ).not.toBe(a);
  });

  it("l'ordre des clés n'influence pas la version", () => {
    const { currency, ...rest } = DEFAULT_BILLING_CONFIG;
    expect(configVersion({ ...rest, currency })).toBe(
      configVersion(DEFAULT_BILLING_CONFIG),
    );
  });
});
