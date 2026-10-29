import { describe, expect, it } from "vitest";
import {
  checkPriceSet,
  sellFromMargin as cmsSellFromMargin,
  upstreamCadMicro as cmsUpstreamCad,
  windowProblems as cmsWindowProblems,
} from "../../../../cms/extensions-src/nexora-cms/src/catalog/module/pricing";
import {
  checkPrice,
  sellFromMargin,
  upstreamCadMicro,
  windowProblems,
} from "./pricing";

/**
 * Parité : l'aperçu du prix de vente du module Directus (cms/…/module/pricing.ts) doit rendre EXACTEMENT les mêmes
 * décisions que la garde de publication du serveur, sinon l'écran promettrait un prix que la publication refuse.
 */

// Générateur pseudo-aléatoire déterministe (mulberry32) : un échec se rejoue à l'identique.
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (r: () => number, max: number) => Math.floor(r() * (max + 1));
const big = (r: () => number, max: number) => BigInt(int(r, max));

describe("parité de l'aperçu des prix avec le serveur", () => {
  it("conversion et prix de vente identiques sur 5 000 cas", () => {
    const r = rng(42);
    for (let i = 0; i < 5000; i++) {
      const up = big(r, 50_000_000);
      const fx = 900_000n + big(r, 1_500_000);
      const margin = int(r, 5000);
      expect(cmsUpstreamCad(up, fx)).toBe(upstreamCadMicro(up, fx));
      expect(cmsSellFromMargin(up, fx, margin)).toBe(sellFromMargin(up, fx, margin));
    }
  });

  it("mêmes problèmes de prix (zéro, sous le plancher) sur 5 000 cas, cache compris", () => {
    const r = rng(7);
    const maybe = (v: bigint) => (r() < 0.5 ? null : v);
    for (let i = 0; i < 5000; i++) {
      const fx = 900_000n + big(r, 1_500_000);
      const floor = int(r, 3000);
      const kind = r() < 0.8 ? ("chat" as const) : ("embedding" as const);
      const upstream = {
        input: big(r, 3_000_000),
        output: big(r, 6_000_000),
        cache: maybe(big(r, 600_000)),
        cacheWrite: maybe(big(r, 4_000_000)),
      };
      // Vente proche du seuil : un cas sur deux autour du prix minimal, pour exercer la frontière.
      const near = (cost: bigint) =>
        r() < 0.5
          ? sellFromMargin(cost, fx, floor) + BigInt(int(r, 4)) - 2n
          : big(r, 8_000_000);
      const pos = (v: bigint) => (v < 0n ? 0n : v);
      const sell = {
        input: pos(near(upstream.input)),
        output: pos(near(upstream.output)),
        cache: upstream.cache === null && r() < 0.5 ? null : pos(near(upstream.cache ?? upstream.input)),
        cacheWrite: upstream.cacheWrite === null && r() < 0.5 ? null : pos(near(upstream.cacheWrite ?? upstream.input)),
      };
      const server = checkPrice(
        {
          upstreamInputUsdMicro: upstream.input,
          upstreamOutputUsdMicro: upstream.output,
          upstreamCacheUsdMicro: upstream.cache,
          upstreamCacheWriteUsdMicro: upstream.cacheWrite,
          sellInputCadMicro: sell.input,
          sellOutputCadMicro: sell.output,
          sellCacheCadMicro: sell.cache,
          sellCacheWriteCadMicro: sell.cacheWrite,
          marginFloorBps: floor,
        },
        fx,
        kind,
      );
      const client = checkPriceSet({ upstream, sell }, fx, floor, kind);
      const key = (x: { code: string; field: string }[]) =>
        x.map((i) => `${i.code}:${i.field}`).sort();
      expect(key(client)).toEqual(key(server));
    }
  });

  it("mêmes problèmes de plages horaires sur 2 000 listes", () => {
    const r = rng(99);
    const set = { input: 1n, output: 1n, cache: null, cacheWrite: null };
    for (let i = 0; i < 2000; i++) {
      const windows = Array.from({ length: int(r, 3) }, (_, k) => ({
        label: `p${k}`,
        days: Array.from({ length: int(r, 3) }, () => int(r, 7) - (r() < 0.05 ? 1 : 0)),
        startMinute: int(r, 1500) - 20,
        endMinute: int(r, 1500) - 20,
        upstream: set,
      }));
      expect(cmsWindowProblems(windows)).toEqual(windowProblems(windows));
    }
  });
});
