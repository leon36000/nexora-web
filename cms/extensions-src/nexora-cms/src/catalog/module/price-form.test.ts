import { describe, expect, test } from "bun:test";
import {
  buildPriceBody,
  comparePrices,
  describeChange,
  emptyPriceForm,
  isSamePrice,
  minutesOf,
  parsePercentBps,
  previewForm,
  priceToForm,
  shapeOfRecord,
  timeOf,
} from "./price-form";

const FX = 1_400_000n;
const defaults = { marginBps: 1000, marginFloorBps: 1000 };

const record = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  modelId: "m1",
  upstreamInputUsdMicro: "300000",
  upstreamOutputUsdMicro: "1200000",
  upstreamCacheUsdMicro: null,
  upstreamCacheWriteUsdMicro: null,
  sellInputCadMicro: "462000",
  sellOutputCadMicro: "1848000",
  sellCacheCadMicro: null,
  sellCacheWriteCadMicro: null,
  windows: [],
  marginBps: 1000,
  marginFloorBps: 1000,
  effectiveAt: "2026-10-28T10:00:00.000Z",
  createdAt: "2026-10-28T10:00:00.000Z",
  note: "",
  ...over,
});

describe("saisie", () => {
  test("pourcentages en points de base", () => {
    expect(parsePercentBps("10")).toBe(1000);
    expect(parsePercentBps("7,5")).toBe(750);
    expect(parsePercentBps("7.55")).toBe(755);
    expect(parsePercentBps("0")).toBe(0);
    for (const bad of ["", "abc", "-1", "7.555", "1001"])
      expect(parsePercentBps(bad)).toBeNull();
  });
  test("heures UTC <-> minutes", () => {
    expect(minutesOf("01:00")).toBe(60);
    expect(minutesOf("24:00")).toBe(1440);
    expect(minutesOf("9:00")).toBeNull();
    expect(minutesOf("25:00")).toBeNull();
    expect(timeOf(600)).toBe("10:00");
    expect(timeOf(1440)).toBe("24:00");
  });
});

describe("aperçu du formulaire", () => {
  const ctx = { fxMicro: FX, kind: "chat" as const };
  test("calcule la vente avec la marge et envoie des montants explicites", () => {
    const f = { ...emptyPriceForm(defaults), upIn: "0,30", upOut: "1,20" };
    const p = previewForm(f, ctx);
    expect(p.ok).toBe(true);
    expect(p.base.sell?.input).toBe(462_000n);
    const body = buildPriceBody(f, p);
    expect(body).toEqual({
      upstreamInputUsdMicro: "300000",
      upstreamOutputUsdMicro: "1200000",
      sellInputCadMicro: "462000",
      sellOutputCadMicro: "1848000",
      marginBps: 1000,
      marginFloorBps: 1000,
      note: "",
    });
  });
  test("cache lu et cache écrit : coûts et ventes", () => {
    const f = {
      ...emptyPriceForm(defaults),
      upIn: "0,60",
      upOut: "2,50",
      upCache: "0,10",
      upCacheWrite: "0,75",
    };
    const body = buildPriceBody(f, previewForm(f, ctx)) as Record<
      string,
      string
    >;
    expect(body.upstreamCacheUsdMicro).toBe("100000");
    expect(body.upstreamCacheWriteUsdMicro).toBe("750000");
    expect(body.sellCacheCadMicro).toBe("154000");
    expect(body.sellCacheWriteCadMicro).toBe("1155000");
  });
  test("prix manuel sous le plancher : refus et explication, pas de corps", () => {
    const f = {
      ...emptyPriceForm(defaults),
      upIn: "0,30",
      upOut: "1,20",
      sellIn: "0,44",
    };
    const p = previewForm(f, ctx);
    expect(p.ok).toBe(false);
    expect(p.problems.join(" ")).toContain("plancher");
    expect(buildPriceBody(f, p)).toBeNull();
  });
  test("champs invalides signalés un par un", () => {
    const f = {
      ...emptyPriceForm(defaults),
      upIn: "abc",
      upOut: "",
      upCache: "1,2,3",
      marginPct: "x",
    };
    const p = previewForm(f, ctx);
    expect(Object.keys(p.errors).sort()).toEqual([
      "marginPct",
      "upCache",
      "upIn",
      "upOut",
    ]);
  });
  test("sans taux approuvé, le calcul est impossible et dit pourquoi", () => {
    const f = { ...emptyPriceForm(defaults), upIn: "0,30", upOut: "1,20" };
    const p = previewForm(f, { fxMicro: null, kind: "chat" });
    expect(p.ok).toBe(false);
    expect(p.problems[0]).toContain("taux de change");
  });
  test("plages horaires : prix plus bas seulement, corps avec vente explicite", () => {
    const f = {
      ...emptyPriceForm(defaults),
      upIn: "0,30",
      upOut: "1,20",
      windows: [
        {
          label: "creux",
          days: [0, 6],
          start: "00:00",
          end: "24:00",
          upIn: "0,15",
          upOut: "0,60",
          upCache: "",
          upCacheWrite: "",
          sellIn: "",
          sellOut: "",
          sellCache: "",
          sellCacheWrite: "",
        },
      ],
    };
    const p = previewForm(f, ctx);
    expect(p.ok).toBe(true);
    const body = buildPriceBody(f, p) as { windows: Record<string, unknown>[] };
    expect(body.windows[0]).toEqual({
      label: "creux",
      days: [0, 6],
      startMinute: 0,
      endMinute: 1440,
      upstream: { input: "150000", output: "600000" },
      sell: { input: "231000", output: "924000" },
    });
    const dear = previewForm(
      { ...f, windows: [{ ...f.windows[0], upIn: "0,50" } as never] },
      ctx,
    );
    expect(dear.ok).toBe(false);
    expect(dear.problems.join(" ")).toContain("dépasse");
  });
});

describe("retour au formulaire depuis un prix enregistré", () => {
  test("prix calculé avec la marge : les ventes restent automatiques", () => {
    const f = priceToForm(record(), FX);
    expect(f).toMatchObject({
      upIn: "0,3",
      upOut: "1,2",
      sellIn: "",
      sellOut: "",
      marginPct: "10",
      floorPct: "10",
    });
  });
  test("prix de vente fixé à la main : conservé en saisie manuelle", () => {
    const f = priceToForm(record({ sellInputCadMicro: "500000" }), FX);
    expect(f.sellIn).toBe("0,5");
    expect(f.sellOut).toBe("");
  });
  test("sans taux, toutes les ventes sont gardées telles quelles", () => {
    const f = priceToForm(record(), null);
    expect(f.sellIn).toBe("0,462");
  });
  test("plages : heures et jours repris", () => {
    const w = {
      label: "creux",
      days: [0, 6],
      startMinute: 0,
      endMinute: 1440,
      upstream: {
        input: "150000",
        output: "600000",
        cache: null,
        cacheWrite: null,
      },
      sell: {
        input: "231000",
        output: "924000",
        cache: null,
        cacheWrite: null,
      },
    };
    const f = priceToForm(record({ windows: [w] }), FX);
    expect(f.windows[0]).toMatchObject({
      label: "creux",
      start: "00:00",
      end: "24:00",
      upIn: "0,15",
      sellIn: "",
    });
  });
});

describe("comparaison ancien / nouveau", () => {
  const old = shapeOfRecord(record());
  test("hausse du coût amont avec la marge conservée", () => {
    const f = { ...priceToForm(record(), FX), upIn: "0,36" };
    const p = previewForm(f, { fxMicro: FX, kind: "chat" });
    const rows = comparePrices(old, p.shape, FX);
    const input = rows.find((r) => r.dim === "input");
    expect(input).toMatchObject({
      oldSell: 462_000n,
      newSell: 554_400n,
      sellDeltaBps: 2000,
      oldMarginBps: 1000,
      newMarginBps: 1000,
    });
    expect(rows.find((r) => r.dim === "output")?.sellDeltaBps).toBe(0);
    expect(describeChange(input as NonNullable<typeof input>)).toContain(
      "+20 %",
    );
  });
  test("coût amont en hausse, prix de vente inchangé : la marge fond, sous le plancher", () => {
    const f = { ...priceToForm(record(), FX), upIn: "0,36", sellIn: "0,462" };
    const p = previewForm(f, { fxMicro: FX, kind: "chat" });
    expect(p.ok).toBe(false);
    const rows = comparePrices(old, p.shape, FX);
    const input = rows.find((r) => r.dim === "input");
    expect(input?.newMarginBps).toBe(-834);
    expect(input?.marginDeltaBps).toBe(-1834);
    expect(describeChange(input as NonNullable<typeof input>)).toContain(
      "marge",
    );
  });
  test("première version : rien à comparer", () => {
    const f = { ...emptyPriceForm(defaults), upIn: "0,30", upOut: "1,20" };
    const p = previewForm(f, { fxMicro: FX, kind: "chat" });
    expect(
      comparePrices(null, p.shape, FX).every((r) => r.oldSell === null),
    ).toBe(true);
  });
  test("deux versions identiques : aucune nouvelle version à créer", () => {
    const same = previewForm(priceToForm(record(), FX), {
      fxMicro: FX,
      kind: "chat",
    });
    expect(isSamePrice(old, same.shape)).toBe(true);
    const other = previewForm(
      { ...priceToForm(record(), FX), upOut: "1,30" },
      { fxMicro: FX, kind: "chat" },
    );
    expect(isSamePrice(old, other.shape)).toBe(false);
    // le plancher fait partie du prix
    const floor = previewForm(
      { ...priceToForm(record(), FX), floorPct: "5" },
      { fxMicro: FX, kind: "chat" },
    );
    expect(isSamePrice(old, floor.shape)).toBe(false);
  });
});
