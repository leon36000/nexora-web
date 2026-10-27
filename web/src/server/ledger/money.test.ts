import { describe, expect, it } from "vitest";
import {
  addMonths,
  centsToMicro,
  creditsToDebitForRefund,
  microToCents,
  parseCadToCents,
} from "./money";

describe("centsToMicro / microToCents", () => {
  it("convertit les cents en micro-unités sans flottant", () => {
    expect(centsToMicro(1)).toBe(10_000n);
    expect(centsToMicro(2500)).toBe(25_000_000n);
    expect(centsToMicro(0)).toBe(0n);
  });
  it("refuse un nombre non entier ou négatif", () => {
    expect(() => centsToMicro(10.5)).toThrow();
    expect(() => centsToMicro(-1)).toThrow();
    expect(() => centsToMicro(Number.NaN)).toThrow();
  });
  it("microToCents arrondit vers le bas", () => {
    expect(microToCents(25_000_000n)).toBe(2500n);
    expect(microToCents(10_001n)).toBe(1n);
  });
});

describe("creditsToDebitForRefund", () => {
  const base = { creditsMicro: 10_000_000n, amountTotalCents: 1150 };

  it("rembourse proportionnellement au montant payé, taxes comprises", () => {
    // Remboursement de 575 $ sur 1150 $ : la moitié des crédits.
    expect(
      creditsToDebitForRefund({
        ...base,
        cumulativeRefundedCents: 575,
        alreadyDebitedMicro: 0n,
      }),
    ).toBe(5_000_000n);
  });

  it("rembourse tout : débite la totalité des crédits", () => {
    expect(
      creditsToDebitForRefund({
        ...base,
        cumulativeRefundedCents: 1150,
        alreadyDebitedMicro: 0n,
      }),
    ).toBe(10_000_000n);
  });

  it("ne débite que le complément déjà non débité (remboursements successifs)", () => {
    expect(
      creditsToDebitForRefund({
        ...base,
        cumulativeRefundedCents: 805,
        alreadyDebitedMicro: 5_000_000n,
      }),
    ).toBe(2_000_000n);
  });

  it("rejouer le même cumul ne débite rien de plus", () => {
    expect(
      creditsToDebitForRefund({
        ...base,
        cumulativeRefundedCents: 575,
        alreadyDebitedMicro: 5_000_000n,
      }),
    ).toBe(0n);
  });

  it("arrondit en faveur du client (vers le bas) et ne dépasse jamais les crédits achetés", () => {
    expect(
      creditsToDebitForRefund({
        creditsMicro: 10_000_000n,
        amountTotalCents: 1150,
        cumulativeRefundedCents: 1,
        alreadyDebitedMicro: 0n,
      }),
    ).toBe(8_695n);
    expect(
      creditsToDebitForRefund({
        ...base,
        cumulativeRefundedCents: 5000,
        alreadyDebitedMicro: 0n,
      }),
    ).toBe(10_000_000n);
  });

  it("refuse un total payé nul", () => {
    expect(() =>
      creditsToDebitForRefund({
        creditsMicro: 1n,
        amountTotalCents: 0,
        cumulativeRefundedCents: 1,
        alreadyDebitedMicro: 0n,
      }),
    ).toThrow();
  });
});

describe("addMonths", () => {
  it("ajoute des mois civils", () => {
    expect(addMonths(new Date("2026-01-15T10:00:00Z"), 12).toISOString()).toBe(
      "2027-01-15T10:00:00.000Z",
    );
  });
  it("ramène au dernier jour du mois quand le jour n'existe pas", () => {
    expect(addMonths(new Date("2026-01-31T00:00:00Z"), 1).toISOString()).toBe(
      "2026-02-28T00:00:00.000Z",
    );
    expect(addMonths(new Date("2028-02-29T00:00:00Z"), 12).toISOString()).toBe(
      "2029-02-28T00:00:00.000Z",
    );
  });
});

describe("parseCadToCents", () => {
  it("lit des dollars entiers ou avec deux décimales (virgule ou point), sans flottant", () => {
    expect(parseCadToCents("25")).toBe(2500);
    expect(parseCadToCents("25.5")).toBe(2550);
    expect(parseCadToCents("25,50")).toBe(2550);
    expect(parseCadToCents(" 0.07 ")).toBe(7);
    expect(parseCadToCents("19.99")).toBe(1999);
  });
  it("refuse tout le reste", () => {
    for (const bad of [
      "",
      "abc",
      "-5",
      "1e3",
      "12.345",
      "1 000",
      "0x10",
      "9999999",
      "NaN",
      "25$",
    ])
      expect(parseCadToCents(bad)).toBeNull();
  });
});
