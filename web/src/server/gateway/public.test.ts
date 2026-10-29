import { describe, expect, it } from "vitest";
import { toPublicModel } from "./public";
import type { SnapshotModel, SnapshotProvider } from "./snapshot";

const provider: SnapshotProvider = {
  id: "p1",
  code: "deepseek",
  name: "DeepSeek",
  type: "openai_compatible",
  baseUrl: "https://api.deepseek.com/v1",
  litellmBaseUrl: null,
  secretRef: "llm.deepseek",
  region: "autre",
  dataPolicyFr: "",
  dataPolicyEn: "",
  priority: 10,
  enabled: true,
};

const model: SnapshotModel = {
  id: "m1",
  publicId: "nexora/deepseek-v4.1-flash-1017",
  name: "DeepSeek V4.1 Flash 1017",
  descriptionFr: "d",
  descriptionEn: "d",
  kind: "chat",
  providerId: "p1",
  upstreamId: "deepseek-flash",
  contextMax: 1_048_576,
  maxOutputTokens: 393_216,
  capabilities: { streaming: true, vision: true },
  residency: "autre",
  visibility: "public",
  sunsetAt: null,
  sheet: {
    family: "DeepSeek V4.1",
    license: { name: "MIT", openWeights: true },
    benchmarks: [
      {
        name: "DeepSWE v1.1",
        score: 77,
        unit: "%",
        publisher: "DeepSeek",
        sourceUrl:
          "https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash-1017",
      },
    ],
  },
  routing: {
    dataCollection: "deny",
    maxPriceUsdMicro: { input: "300000", output: "1200000" },
  },
  routes: [
    {
      id: "r1",
      providerId: "p2",
      upstreamId: "deepseek/deepseek-v4.1-flash-1017",
      position: 1,
      upstream: { input: "300000", output: "1200000", cache: null },
    },
  ],
  price: {
    id: "pr1",
    upstreamInputUsdMicro: "300000",
    upstreamOutputUsdMicro: "1200000",
    upstreamCacheUsdMicro: "6000",
    sellInputCadMicro: "462000",
    sellOutputCadMicro: "1848000",
    sellCacheCadMicro: "9240",
    upstreamCacheWriteUsdMicro: "300000",
    sellCacheWriteCadMicro: "462000",
    windows: [
      {
        label: "creux",
        days: [0, 6],
        startMinute: 0,
        endMinute: 1440,
        upstream: {
          input: "150000",
          output: "600000",
          cache: "3000",
          cacheWrite: null,
        },
        sell: {
          input: "231000",
          output: "924000",
          cache: "4620",
          cacheWrite: null,
        },
      },
    ],
    marginBps: 1000,
    marginFloorBps: 1000,
    effectiveAt: "2026-10-28T00:00:00.000Z",
    note: "",
  },
};

describe("vue publique d'un modèle", () => {
  it("montre la fiche, le prix de base, l'écriture du cache et les plages horaires en CAD par million", () => {
    const v = toPublicModel(model, provider);
    expect(v?.sheet.family).toBe("DeepSeek V4.1");
    expect(v?.sheet.benchmarks?.[0]).toMatchObject({
      name: "DeepSWE v1.1",
      score: 77,
      publisher: "DeepSeek",
    });
    expect(v?.inputPerMillion).toBe("0.462");
    expect(v?.cacheWritePerMillion).toBe("0.462");
    expect(v?.priceWindows).toEqual([
      {
        label: "creux",
        days: [0, 6],
        startMinute: 0,
        endMinute: 1440,
        inputPerMillion: "0.231",
        outputPerMillion: "0.924",
        cachePerMillion: "0.00462",
      },
    ]);
  });

  it("ne laisse sortir ni routage, ni routes, ni coût amont, ni adresse du fournisseur", () => {
    const text = JSON.stringify(toPublicModel(model, provider));
    for (const secret of [
      "routing",
      "dataCollection",
      "routes",
      "upstream",
      "300000",
      "1200000",
      "api.deepseek.com",
      "llm.deepseek",
      "deepseek-flash",
      "marginBps",
    ])
      expect(text, secret).not.toContain(secret);
  });

  it("garde une fiche vide pour un ancien modèle sans fiche", () => {
    const { sheet: _s, routing: _r, routes: _rt, ...old } = model;
    expect(toPublicModel(old, provider)?.sheet).toEqual({});
  });
});
