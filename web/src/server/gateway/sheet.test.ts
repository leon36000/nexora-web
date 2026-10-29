import { describe, expect, it } from "vitest";
import { modelRoutingSchema, modelSheetSchema } from "./sheet";

const complete = {
  author: "Z.ai",
  family: "GLM",
  tags: ["raisonnement", "code", "contexte-long", "poids-ouverts"],
  quantization: "fp4",
  homepageUrl: "https://huggingface.co/zai-org/GLM-5.3",
  releasedAt: "2026-08-18",
  knowledgeCutoff: "2026-05",
  license: {
    name: "MIT",
    openWeights: true,
    url: "https://example.com/licence",
  },
  parameters: { totalB: 753, activeB: 40 },
  modalities: { input: ["text"], output: ["text"] },
  benchmarks: [
    {
      name: "SWE-bench Verified",
      score: 78.4,
      unit: "%",
      publisher: "Z.ai",
      sourceUrl: "https://z.ai/blog/glm-5.3",
      measuredAt: "2026-08-18",
      category: "Code",
    },
  ],
  sources: [
    {
      label: "Page officielle",
      url: "https://docs.z.ai/guides",
      readAt: "2026-10-28",
    },
  ],
  notesFr: "",
  notesEn: "",
};

describe("fiche de modèle", () => {
  it("accepte une fiche complète", () => {
    expect(modelSheetSchema.parse(complete)).toEqual(complete);
  });

  it("accepte la sortie « embedding » (modèles de vecteurs)", () => {
    const sheet = {
      modalities: { input: ["text", "image"], output: ["embedding"] },
    };
    expect(modelSheetSchema.parse(sheet)).toEqual(sheet);
  });

  it("accepte une fiche vide (les modèles existants n'ont encore rien)", () => {
    expect(modelSheetSchema.parse({})).toEqual({});
  });

  it("refuse un benchmark sans éditeur de la mesure", () => {
    const { publisher: _p, ...sansEditeur } = complete.benchmarks[0] as Record<
      string,
      unknown
    >;
    expect(() =>
      modelSheetSchema.parse({ ...complete, benchmarks: [sansEditeur] }),
    ).toThrow();
  });

  it("refuse un benchmark dont la source n'est pas en https", () => {
    expect(() =>
      modelSheetSchema.parse({
        ...complete,
        benchmarks: [{ ...complete.benchmarks[0], sourceUrl: "http://z.ai/x" }],
      }),
    ).toThrow();
  });

  it("refuse un score qui n'est pas un nombre fini", () => {
    expect(() =>
      modelSheetSchema.parse({
        ...complete,
        benchmarks: [{ ...complete.benchmarks[0], score: Number.NaN }],
      }),
    ).toThrow();
  });

  it("refuse des paramètres actifs supérieurs au total", () => {
    expect(() =>
      modelSheetSchema.parse({
        ...complete,
        parameters: { totalB: 18, activeB: 320 },
      }),
    ).toThrow();
  });

  it("refuse une date de sortie qui n'existe pas", () => {
    expect(() =>
      modelSheetSchema.parse({ ...complete, releasedAt: "2026-13-45" }),
    ).toThrow();
  });

  it("refuse une étiquette hors du vocabulaire fermé et une quantification mal formée", () => {
    expect(() =>
      modelSheetSchema.parse({ ...complete, tags: ["meilleur-du-monde"] }),
    ).toThrow();
    expect(() =>
      modelSheetSchema.parse({ ...complete, quantization: "FP 8 bits" }),
    ).toThrow();
  });

  it("refuse un champ inconnu (aucune donnée glissée dans la fiche)", () => {
    expect(() =>
      modelSheetSchema.parse({ ...complete, prixSecret: "x" }),
    ).toThrow();
  });
});

describe("consignes de routage amont", () => {
  it("accepte un routage prudent", () => {
    const routing = {
      dataCollection: "deny",
      allowFallbacks: true,
      ignore: ["alibaba"],
      maxPriceUsdMicro: { input: "1400000", output: "4400000" },
    };
    expect(modelRoutingSchema.parse(routing)).toEqual(routing);
  });

  it("refuse un prix plafond négatif ou non entier", () => {
    expect(() =>
      modelRoutingSchema.parse({
        maxPriceUsdMicro: { input: "-1", output: "4" },
      }),
    ).toThrow();
    expect(() =>
      modelRoutingSchema.parse({
        maxPriceUsdMicro: { input: "1.5", output: "4" },
      }),
    ).toThrow();
  });

  it("refuse un identifiant d'hébergeur qui n'est pas un simple code", () => {
    expect(() => modelRoutingSchema.parse({ ignore: ["a b/../c"] })).toThrow();
  });
});
