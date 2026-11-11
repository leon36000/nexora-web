import { describe, expect, it } from "vitest";
import { nanoToMicroRounded, usdToNano } from "./upstream-money.ts";

/** Audit F-07 : un coût amont est un entier en nano-USD, converti sans flottant ; jamais arrondi au micro-USD. */
describe("usdToNano", () => {
  it("convertit une chaîne décimale sans flottant", () => {
    expect(usdToNano("0.0000575")).toBe(57_500n);
    expect(usdToNano("12.5")).toBe(12_500_000_000n);
    expect(usdToNano("0")).toBe(0n);
    expect(usdToNano(" 3 ")).toBe(3_000_000_000n);
    expect(usdToNano(".5")).toBe(500_000_000n);
  });

  it("accepte la notation scientifique de LiteLLM (en-tête x-litellm-response-cost : « 5.75e-05 »)", () => {
    expect(usdToNano("5.75e-05")).toBe(57_500n);
    expect(usdToNano("4e-7")).toBe(400n);
    expect(usdToNano("1e-9")).toBe(1n);
    expect(usdToNano("1.5E2")).toBe(150_000_000_000n);
  });

  it("un nombre JSON déjà analysé retrouve la décimale écrite par l'amont", () => {
    expect(usdToNano(0.0000575)).toBe(57_500n);
    expect(usdToNano(0.0000014)).toBe(1_400n);
    // Sous le micro-USD : l'ancien Math.round(cost × 1e6) enregistrait 0 (« appel gratuit »).
    expect(usdToNano(0.0000004)).toBe(400n);
    expect(usdToNano(1e-7)).toBe(100n);
  });

  it("arrondit au nano-USD le plus proche au-delà de la neuvième décimale", () => {
    expect(usdToNano("0.0000000014")).toBe(1n);
    expect(usdToNano("0.0000000015")).toBe(2n);
    expect(usdToNano("0.0000000004")).toBe(0n);
  });

  it("refuse tout ce qui n'est pas un coût (null, jamais 0 : « absent » ne vaut pas « gratuit »)", () => {
    for (const bad of [
      "",
      "abc",
      "None",
      "-1",
      "1,5",
      "1e999",
      "1.2.3",
      Number.NaN,
      Number.POSITIVE_INFINITY,
      -0.5,
      null,
      undefined,
      {},
      true,
    ])
      expect(usdToNano(bad)).toBeNull();
  });
});

describe("nanoToMicroRounded", () => {
  it("garde l'ancienne colonne en micro-USD (arrondi au plus proche) pour les lecteurs existants", () => {
    expect(nanoToMicroRounded(57_500n)).toBe(58n);
    expect(nanoToMicroRounded(400n)).toBe(0n);
    expect(nanoToMicroRounded(500n)).toBe(1n);
    expect(nanoToMicroRounded(0n)).toBe(0n);
  });
});
