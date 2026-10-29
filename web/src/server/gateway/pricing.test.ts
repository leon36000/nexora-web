import { describe, expect, it } from "vitest";
import {
  activeWindow,
  checkPrice,
  costMicro,
  requestCost,
  sellFromMargin,
  tokensValueMicro,
  upstreamCadMicro,
  windowProblems,
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

describe("checkPrice : tarif de cache (M3)", () => {
  const fx = 1_400_000n;
  const base = {
    upstreamInputUsdMicro: 500_000n,
    upstreamOutputUsdMicro: 500_000n,
    upstreamCacheUsdMicro: null as bigint | null,
    sellInputCadMicro: 910_000n,
    sellOutputCadMicro: 910_000n,
    sellCacheCadMicro: null as bigint | null,
    marginFloorBps: 3000,
  };
  it("sans coût amont de cache, le cache amont est facturé au tarif d'entrée : le plancher s'y applique", () => {
    expect(checkPrice({ ...base, sellCacheCadMicro: 1n }, fx, "chat")).toEqual([
      { code: "below_margin_floor", field: "cache" },
    ]);
    expect(
      checkPrice({ ...base, sellCacheCadMicro: 910_000n }, fx, "chat"),
    ).toEqual([]);
  });
  it("un coût amont de cache nul n'autorise pas un tarif de vente de cache à 0 $", () => {
    expect(
      checkPrice(
        { ...base, upstreamCacheUsdMicro: 0n, sellCacheCadMicro: 0n },
        fx,
        "chat",
      ),
    ).toEqual([{ code: "price_zero", field: "cache" }]);
    expect(
      checkPrice(
        { ...base, upstreamCacheUsdMicro: 0n, sellCacheCadMicro: 1n },
        fx,
        "chat",
      ),
    ).toEqual([]);
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

describe("écriture du cache (Kimi) : jetons d'invite écrits en cache, facturés à part", () => {
  const price = { input: 2_000_000n, output: 10_000_000n, cache: 200_000n };

  it("facture l'écriture du cache à son tarif, une seule fois (elle fait partie de l'invite)", () => {
    // 1 000 000 jetons d'invite dont 400 000 lus en cache et 100 000 écrits ; 0 sortie
    const cost = requestCost(
      {
        prompt: 1_000_000,
        completion: 0,
        cached: 400_000,
        cacheWrite: 100_000,
      },
      { ...price, cacheWrite: 4_000_000n },
    );
    // 500 000 × 2 + 400 000 × 0,2 + 100 000 × 4 = 1 000 000 + 80 000 + 400 000 (en micro, par million)
    expect(cost).toBe(1_480_000n);
  });

  it("sans tarif d'écriture, l'écriture est facturée au tarif d'entrée", () => {
    const withWrite = requestCost(
      { prompt: 1_000, completion: 0, cached: 0, cacheWrite: 1_000 },
      price,
    );
    const without = requestCost(
      { prompt: 1_000, completion: 0, cached: 0 },
      price,
    );
    expect(withWrite).toBe(without);
  });

  it("ne compte jamais plus de jetons écrits que d'invite restante", () => {
    const cost = requestCost(
      { prompt: 100, completion: 0, cached: 80, cacheWrite: 500 },
      { ...price, cacheWrite: 4_000_000n },
    );
    // 80 lus + 20 écrits au plus
    expect(cost).toBe(
      requestCost(
        { prompt: 100, completion: 0, cached: 80, cacheWrite: 20 },
        { ...price, cacheWrite: 4_000_000n },
      ),
    );
  });
});

describe("plages horaires de prix (DeepSeek : pointe et creux)", () => {
  // Creux : toute la journée en fin de semaine ; en semaine 00:00–01:00, 04:00–06:00 et 10:00–24:00 UTC
  const offPeak = [
    { label: "creux", days: [0, 6], startMinute: 0, endMinute: 1440 },
    { label: "creux", days: [1, 2, 3, 4, 5], startMinute: 0, endMinute: 60 },
    { label: "creux", days: [1, 2, 3, 4, 5], startMinute: 240, endMinute: 360 },
    {
      label: "creux",
      days: [1, 2, 3, 4, 5],
      startMinute: 600,
      endMinute: 1440,
    },
  ];
  const at = (iso: string) => new Date(iso);

  it("choisit la plage selon le jour et la minute UTC", () => {
    expect(activeWindow(offPeak, at("2026-10-31T02:00:00Z"))?.label).toBe(
      "creux",
    ); // samedi
    expect(activeWindow(offPeak, at("2026-10-28T05:00:00Z"))?.label).toBe(
      "creux",
    ); // mercredi 05 h
    expect(activeWindow(offPeak, at("2026-10-28T02:00:00Z"))).toBeNull(); // mercredi 02 h : pointe
    expect(activeWindow(offPeak, at("2026-10-28T08:30:00Z"))).toBeNull(); // mercredi 08 h 30 : pointe
  });

  it("le début est inclus et la fin exclue", () => {
    expect(activeWindow(offPeak, at("2026-10-28T04:00:00Z"))).not.toBeNull();
    expect(activeWindow(offPeak, at("2026-10-28T01:00:00Z"))).toBeNull();
    expect(activeWindow(offPeak, at("2026-10-28T00:59:59Z"))).not.toBeNull();
  });

  it("valide les plages : bornes, jours, chevauchement", () => {
    expect(windowProblems(offPeak)).toEqual([]);
    expect(
      windowProblems([{ label: "x", days: [], startMinute: 0, endMinute: 60 }]),
    ).not.toEqual([]);
    expect(
      windowProblems([
        { label: "x", days: [1], startMinute: 60, endMinute: 60 },
      ]),
    ).not.toEqual([]);
    expect(
      windowProblems([
        { label: "x", days: [1], startMinute: 0, endMinute: 1441 },
      ]),
    ).not.toEqual([]);
    expect(
      windowProblems([
        { label: "x", days: [7], startMinute: 0, endMinute: 60 },
      ]),
    ).not.toEqual([]);
    expect(
      windowProblems([
        { label: "a", days: [1], startMinute: 0, endMinute: 120 },
        { label: "b", days: [1, 2], startMinute: 60, endMinute: 180 },
      ]),
    ).not.toEqual([]);
  });
});

describe("valeur d'un forfait de jetons inclus (WorkStudio)", () => {
  // GLM 5.3 Flash : 0,231 $ CA en entrée et 0,77 $ CA en sortie par million de jetons
  const flash = { input: 231_000n, output: 770_000n, cache: null };

  it("calcule la valeur de 5 millions de jetons avec une part de sortie donnée, sans nombre à virgule", () => {
    // 70 % entrée, 30 % sortie : 3,5 M × 0,231 + 1,5 M × 0,77 = 0,8085 + 1,155 = 1,9635 $
    expect(tokensValueMicro(5_000_000, flash, 3000)).toBe(1_963_500n);
  });

  it("arrondit vers le haut et refuse une part hors de 0 à 10 000", () => {
    expect(tokensValueMicro(1, flash, 0)).toBe(1n);
    expect(() => tokensValueMicro(1000, flash, -1)).toThrow(RangeError);
    expect(() => tokensValueMicro(1000, flash, 10_001)).toThrow(RangeError);
    expect(tokensValueMicro(0, flash, 3000)).toBe(0n);
  });
});
