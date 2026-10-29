import { describe, expect, test } from "bun:test";
import {
  checkPriceSet,
  explainRow,
  marginBpsOf,
  previewPriceSet,
  previewWindow,
  sellFromMargin,
  upstreamCadMicro,
  windowProblems,
  windowVersusBase,
} from "./pricing";

const FX = 1_400_000n; // 1 $ US = 1,40 $ CA

describe("conversion et marge (entiers seulement)", () => {
  test("coût amont converti au taux approuvé, arrondi vers le haut", () => {
    expect(upstreamCadMicro(300_000n, FX)).toBe(420_000n);
    expect(upstreamCadMicro(1n, FX)).toBe(2n);
  });
  test("prix de vente = coût converti x (1 + marge), arrondi vers le haut", () => {
    expect(sellFromMargin(300_000n, FX, 1000)).toBe(462_000n);
    expect(sellFromMargin(300_000n, FX, 0)).toBe(420_000n);
    expect(sellFromMargin(1_234_567n, FX, 1000)).toBe(1_901_234n);
  });
  test("marge d'un prix de vente, en points de base", () => {
    expect(marginBpsOf(462_000n, 300_000n, FX)).toBe(1000);
    expect(marginBpsOf(420_000n, 300_000n, FX)).toBe(0);
    expect(marginBpsOf(400_000n, 300_000n, FX)).toBe(-477);
    expect(marginBpsOf(10n, 0n, FX)).toBeNull();
  });
});

const base = {
  input: 300_000n,
  output: 1_200_000n,
  cache: null,
  cacheWrite: null,
};
const ctx = {
  fxMicro: FX,
  marginBps: 1000,
  floorBps: 1000,
  kind: "chat" as const,
};

describe("aperçu du prix de vente", () => {
  test("calcule la vente de chaque poste avec la marge visée", () => {
    const p = previewPriceSet(ctx, base);
    expect(p.rows.map((r) => [r.dim, r.sell, r.status])).toEqual([
      ["input", 462_000n, "ok"],
      ["output", 1_848_000n, "ok"],
    ]);
    expect(p.rows[0]?.upstreamCad).toBe(420_000n);
    expect(p.rows[0]?.marginBps).toBe(1000);
    expect(p.sell).toEqual({
      input: 462_000n,
      output: 1_848_000n,
      cache: null,
      cacheWrite: null,
    });
    expect(p.ok).toBe(true);
  });
  test("ajoute les postes cache lu et cache écrit quand le fournisseur les facture", () => {
    const p = previewPriceSet(ctx, {
      ...base,
      cache: 30_000n,
      cacheWrite: 375_000n,
    });
    expect(p.rows.map((r) => r.dim)).toEqual([
      "input",
      "output",
      "cache",
      "cacheWrite",
    ]);
    expect(p.sell?.cache).toBe(46_200n);
    expect(p.sell?.cacheWrite).toBe(577_500n);
  });
  test("un prix manuel sous le plancher est refusé et expliqué", () => {
    const p = previewPriceSet(ctx, base, { input: 440_000n });
    const row = p.rows[0];
    expect(row?.status).toBe("sous_plancher");
    expect(row?.source).toBe("manuel");
    expect(row?.minSell).toBe(462_000n);
    expect(p.ok).toBe(false);
    const text = explainRow(row as NonNullable<typeof row>, 1000);
    expect(text).toContain("4,8 %");
    expect(text).toContain("10 %");
    expect(text).toContain("0,462");
  });
  test("jamais 0 $ en vente (conversation) ; la sortie à 0 $ reste permise pour des embeddings", () => {
    const zero = previewPriceSet(ctx, { ...base, output: 0n });
    expect(zero.rows[1]?.status).toBe("zero");
    const emb = previewPriceSet(
      { ...ctx, kind: "embedding" },
      { ...base, output: 0n },
    );
    expect(emb.rows[1]?.status).toBe("ok");
    expect(emb.ok).toBe(true);
  });
  test("sans taux approuvé, aucun prix de vente calculé", () => {
    const p = previewPriceSet({ ...ctx, fxMicro: null }, base);
    expect(p.ok).toBe(false);
    expect(p.sell).toBeNull();
    expect(p.reason).toBe("fx_missing");
  });
  test("le plancher se vérifie sur le coût du poste (cache sans tarif amont : tarif d'entrée)", () => {
    const issues = checkPriceSet(
      {
        upstream: { ...base, cache: null, cacheWrite: null },
        sell: {
          input: 462_000n,
          output: 1_848_000n,
          cache: 100_000n,
          cacheWrite: null,
        },
      },
      FX,
      1000,
      "chat",
    );
    expect(issues).toEqual([{ code: "below_margin_floor", field: "cache" }]);
  });
});

describe("plages horaires", () => {
  const w = (over = {}) => ({
    label: "creux",
    days: [0, 6],
    startMinute: 0,
    endMinute: 1440,
    upstream: {
      input: 150_000n,
      output: 600_000n,
      cache: null,
      cacheWrite: null,
    },
    ...over,
  });
  test("signale jours vides, minutes invalides et chevauchements", () => {
    expect(windowProblems([w()])).toEqual([]);
    expect(windowProblems([w({ days: [] })])[0]).toContain("aucun jour");
    expect(
      windowProblems([w({ startMinute: 600, endMinute: 600 })])[0],
    ).toContain("minutes invalides");
    expect(
      windowProblems([w(), w({ label: "b", startMinute: 600 })]),
    ).toContain("plages 1 et 2 : chevauchement");
  });
  test("une plage ne peut que baisser le coût et le prix de vente", () => {
    const sellBase = previewPriceSet(ctx, base).sell;
    const low = previewWindow(ctx, base, sellBase, w());
    expect(low.problems).toEqual([]);
    expect(low.sell?.input).toBe(231_000n);
    expect(low.ok).toBe(true);
    const dear = previewWindow(
      ctx,
      base,
      sellBase,
      w({
        upstream: {
          input: 400_000n,
          output: 600_000n,
          cache: null,
          cacheWrite: null,
        },
      }),
    );
    expect(dear.problems[0]).toContain("coût amont");
    expect(dear.ok).toBe(false);
  });
  test("vérifie séparément cache lu et cache écrit contre le tarif d'entrée de base", () => {
    expect(
      windowVersusBase(
        { input: 100n, output: 100n, cache: 150n, cacheWrite: null },
        { input: 200n, output: 200n, cache: null, cacheWrite: null },
      ),
    ).toEqual([]);
    expect(
      windowVersusBase(
        { input: 100n, output: 100n, cache: 250n, cacheWrite: null },
        { input: 200n, output: 200n, cache: null, cacheWrite: null },
      ),
    ).toEqual(["cache"]);
  });
});
