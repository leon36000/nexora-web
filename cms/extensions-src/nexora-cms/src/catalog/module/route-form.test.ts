import { describe, expect, test } from "bun:test";
import type { PriceShape } from "./price-form";
import {
  emptyRouteForm,
  moveItem,
  routeBody,
  routeFloorRows,
  validateRouteForm,
} from "./route-form";

const FX = 1_400_000n;
const shape = (over: Partial<PriceShape> = {}): PriceShape => ({
  upstream: {
    input: 300_000n,
    output: 1_200_000n,
    cache: null,
    cacheWrite: null,
  },
  sell: { input: 462_000n, output: 1_848_000n, cache: null, cacheWrite: null },
  marginBps: 1000,
  floorBps: 1000,
  windows: [],
  ...over,
});

describe("formulaire d'une route de secours", () => {
  test("fournisseur et identifiant amont obligatoires", () => {
    expect(Object.keys(validateRouteForm(emptyRouteForm())).sort()).toEqual([
      "providerId",
      "upstreamId",
    ]);
  });
  test("le prix d'entrée et le prix de sortie vont ensemble", () => {
    const f = {
      ...emptyRouteForm(),
      providerId: "p",
      upstreamId: "u",
      upIn: "0,4",
    };
    expect(validateRouteForm(f).upOut).toContain("ensemble");
    expect(validateRouteForm({ ...f, upIn: "", upOut: "1" }).upIn).toContain(
      "ensemble",
    );
    expect(validateRouteForm({ ...f, upOut: "0,9" })).toEqual({});
    expect(
      validateRouteForm({ ...f, upOut: "0,9", upCache: "abc" }).upCache,
    ).toBeDefined();
  });
  test("sans prix propre, la route a le coût du modèle", () => {
    const f = {
      ...emptyRouteForm(),
      providerId: "p",
      upstreamId: "zai-org/GLM-5.3",
      note: "secours",
    };
    expect(routeBody(f)).toEqual({
      providerId: "p",
      upstreamId: "zai-org/GLM-5.3",
      note: "secours",
    });
    expect(
      routeBody({ ...f, upIn: "0,4", upOut: "0,9", upCache: "0,1" }),
    ).toEqual({
      providerId: "p",
      upstreamId: "zai-org/GLM-5.3",
      note: "secours",
      upstreamInputUsdMicro: "400000",
      upstreamOutputUsdMicro: "900000",
      upstreamCacheUsdMicro: "100000",
    });
  });
});

describe("prix plancher d'une route", () => {
  const route = { input: 400_000n, output: 900_000n, cache: null };
  test("prix de vente minimal par poste et verdict contre les ventes actuelles", () => {
    const rows = routeFloorRows(route, shape(), FX, "chat");
    expect(rows.map((r) => [r.dim, r.minSell, r.holds])).toEqual([
      ["input", 616_000n, false],
      ["output", 1_386_000n, true],
    ]);
  });
  test("chaque plage horaire doit aussi tenir le plancher avec ce coût", () => {
    const window = {
      label: "creux",
      days: [0],
      startMinute: 0,
      endMinute: 1440,
      upstream: {
        input: 150_000n,
        output: 600_000n,
        cache: null,
        cacheWrite: null,
      },
      sell: {
        input: 231_000n,
        output: 924_000n,
        cache: null,
        cacheWrite: null,
      },
    };
    const rows = routeFloorRows(
      { input: 100_000n, output: 100_000n, cache: null },
      shape({ windows: [window] }),
      FX,
      "chat",
    );
    // la vente de la plage (0,231 $) tient le plancher sur un coût de 0,10 $ US (0,14 $ CA, minimum 0,154 $)
    expect(rows.every((r) => r.holds)).toBe(true);
    const bad = routeFloorRows(
      { input: 400_000n, output: 100_000n, cache: null },
      shape({ windows: [window] }),
      FX,
      "chat",
    );
    expect(bad.find((r) => r.dim === "input")?.holds).toBe(false);
    expect(bad.find((r) => r.dim === "input")?.failsIn).toEqual([
      "prix de base",
      "plage « creux »",
    ]);
  });
  test("route sans prix propre : aucun contrôle propre (elle suit le coût du modèle)", () => {
    expect(routeFloorRows(null, shape(), FX, "chat")).toEqual([]);
  });
  test("sans prix enregistré ou sans taux, aucun verdict", () => {
    expect(routeFloorRows(route, null, FX, "chat")).toEqual([]);
    expect(routeFloorRows(route, shape(), null, "chat")).toEqual([]);
  });
});

describe("ordre", () => {
  test("monter ou descendre une route", () => {
    expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });
});
