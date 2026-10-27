import { describe, expect, it } from "vitest";
import {
  checkPrice,
  costMicro,
  requestCost,
  sellFromMargin,
  upstreamCadMicro,
} from "./pricing";

describe("costMicro", () => {
  it("arrondit toujours vers le haut, jamais à zéro pour un usage réel", () => {
    expect(costMicro(1_000_000, 600_000n)).toBe(600_000n);
    expect(costMicro(1, 600_000n)).toBe(1n); // 0,6 micro-CAD → 1
    expect(costMicro(0, 600_000n)).toBe(0n);
    expect(costMicro(1500, 2_500_000n)).toBe(3_750n);
  });
  it("reste exact au-delà de 2^53", () => {
    const price = 9_007_199_254_740_993n;
    expect(costMicro(2_000_000, price)).toBe(price * 2n);
  });
  it("refuse un nombre de jetons invalide", () => {
    expect(() => costMicro(-1, 1n)).toThrow(RangeError);
    expect(() => costMicro(1.5, 1n)).toThrow(RangeError);
  });
});

describe("requestCost", () => {
  const price = { input: 1_000_000n, output: 3_000_000n, cache: 100_000n };
  it("facture les jetons en cache au tarif de cache", () => {
    // 800 jetons hors cache + 200 en cache + 50 de sortie
    expect(
      requestCost({ prompt: 1000, completion: 50, cached: 200 }, price),
    ).toBe(800n + 20n + 150n);
  });
  it("sans tarif de cache, le tarif d'entrée s'applique", () => {
    expect(
      requestCost(
        { prompt: 1000, completion: 0, cached: 200 },
        { ...price, cache: null },
      ),
    ).toBe(1000n);
  });
  it("ne compte jamais plus de jetons en cache que d'entrée", () => {
    expect(requestCost({ prompt: 10, completion: 0, cached: 99 }, price)).toBe(
      1n,
    );
  });
});

describe("marge et plancher", () => {
  const fx = 1_400_000n; // 1 USD = 1,40 CAD
  it("convertit le coût amont en CAD au taux approuvé (arrondi vers le haut)", () => {
    expect(upstreamCadMicro(500_000n, fx)).toBe(700_000n);
    expect(upstreamCadMicro(1n, fx)).toBe(2n);
  });
  it("calcule un prix de vente à partir d'une marge", () => {
    // 0,70 CAD + 30 % = 0,91 CAD
    expect(sellFromMargin(500_000n, fx, 3000)).toBe(910_000n);
  });
  it("accepte un prix égal au plancher et refuse un centime en dessous", () => {
    const base = {
      upstreamInputUsdMicro: 500_000n,
      upstreamOutputUsdMicro: 1_000_000n,
      upstreamCacheUsdMicro: null,
      sellInputCadMicro: 910_000n,
      sellOutputCadMicro: 1_820_000n,
      sellCacheCadMicro: null,
      marginFloorBps: 3000,
    };
    expect(checkPrice(base, fx, "chat")).toEqual([]);
    expect(
      checkPrice({ ...base, sellOutputCadMicro: 1_819_999n }, fx, "chat"),
    ).toEqual([{ code: "below_margin_floor", field: "output" }]);
  });
  it("refuse 0 $ en entrée, et en sortie pour un modèle de conversation", () => {
    const zero = {
      upstreamInputUsdMicro: 0n,
      upstreamOutputUsdMicro: 0n,
      upstreamCacheUsdMicro: null,
      sellInputCadMicro: 0n,
      sellOutputCadMicro: 0n,
      sellCacheCadMicro: null,
      marginFloorBps: 0,
    };
    expect(checkPrice(zero, fx, "chat").map((e) => e.code)).toEqual([
      "price_zero",
      "price_zero",
    ]);
    // un modèle d'embeddings n'a pas de sortie
    expect(
      checkPrice({ ...zero, sellInputCadMicro: 10n }, fx, "embedding"),
    ).toEqual([]);
  });
  it("vérifie aussi le plancher sur le tarif de cache", () => {
    const p = {
      upstreamInputUsdMicro: 500_000n,
      upstreamOutputUsdMicro: 500_000n,
      upstreamCacheUsdMicro: 100_000n,
      sellInputCadMicro: 910_000n,
      sellOutputCadMicro: 910_000n,
      sellCacheCadMicro: 1n,
      marginFloorBps: 3000,
    };
    expect(checkPrice(p, fx, "chat")).toEqual([
      { code: "below_margin_floor", field: "cache" },
    ]);
  });
});

describe("formatMicro", () => {
  it("écrit un décimal exact", async () => {
    const { formatMicro } = await import("./pricing");
    expect(formatMicro(600_000n)).toBe("0.6");
    expect(formatMicro(12_000_000n)).toBe("12");
    expect(formatMicro(1n)).toBe("0.000001");
    expect(formatMicro(9_007_199_254_740_993n)).toBe("9007199254.740993");
  });
});
