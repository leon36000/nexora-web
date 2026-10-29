import { describe, expect, it } from "vitest";
import {
  benchmarkKey,
  buildRankings,
  commonBenchmarks,
  groupBenchmarks,
  scorePercent,
} from "./benchmarks";
import {
  CODE_70B,
  FIXTURES,
  fixtureModel,
  LONG_CONTEXT,
  MOE_PREVIEW,
  REASONING_XL,
  VISION_8B_PREVIEW,
} from "./fixtures";

const bench = (over: Partial<Parameters<typeof scorePercent>[0]> = {}) => ({
  name: "B",
  score: 50,
  unit: "%",
  publisher: "P",
  sourceUrl: "https://example.org/b",
  ...over,
});

describe("mesures d'un modèle", () => {
  it("regroupe par catégorie dans l'ordre d'apparition, les mesures sans catégorie à la fin", () => {
    const groups = groupBenchmarks(CODE_70B.sheet.benchmarks ?? []);
    expect(groups.map((g) => g.category)).toEqual([
      "Code",
      "Raisonnement",
      null,
    ]);
    expect(groups[2]?.items.map((b) => b.name)).toEqual(["Arène-test"]);
    expect(groupBenchmarks([])).toEqual([]);
  });

  it("ne trace une barre que pour un pourcentage entre 0 et 100", () => {
    expect(scorePercent(bench({ score: 61.5 }))).toBe(61.5);
    expect(scorePercent(bench({ score: 0 }))).toBe(0);
    expect(scorePercent(bench({ score: 100 }))).toBe(100);
    expect(scorePercent(bench({ score: 140 }))).toBeNull();
    expect(scorePercent(bench({ score: -3 }))).toBeNull();
    expect(scorePercent(bench({ unit: "Elo", score: 1250 }))).toBeNull();
    expect(scorePercent(bench({ unit: "points", score: 50 }))).toBeNull();
  });

  it("identifie une épreuve par son nom et son unité, sans égard à la casse ni aux accents", () => {
    expect(benchmarkKey(bench({ name: " Arène-Test " }))).toBe(
      benchmarkKey(bench({ name: "arene-test" })),
    );
    expect(benchmarkKey(bench({ unit: "%" }))).not.toBe(
      benchmarkKey(bench({ unit: "Elo" })),
    );
  });
});

describe("classements par épreuve", () => {
  it("ne garde que les épreuves publiées pour au moins trois modèles", () => {
    const rankings = buildRankings(FIXTURES);
    expect(rankings.map((r) => r.name)).toEqual(["SWE-test"]);
    expect(buildRankings(FIXTURES, 2).map((r) => r.name)).toEqual([
      "SWE-test",
      "Arène-test",
      "GPQA-test",
    ]);
  });

  it("trie par résultat décroissant puis par nom, et garde l'éditeur de la mesure et sa source", () => {
    const [swe] = buildRankings(FIXTURES);
    expect(swe?.rows.map((r) => r.model.id)).toEqual([
      REASONING_XL.id,
      CODE_70B.id,
      MOE_PREVIEW.id,
      LONG_CONTEXT.id,
      VISION_8B_PREVIEW.id,
    ]);
    expect(swe?.rows[1]?.benchmark).toMatchObject({
      score: 61.5,
      publisher: "Éditeur A",
      sourceUrl: "https://example.org/mesures/swe-a",
    });
    expect(swe?.category).toBe("Code");
    expect(swe?.publishers).toHaveLength(4);
    expect(swe?.slug).toBe("swe-test");
  });

  it("écarte les épreuves dont le résultat se lit à l'envers (durées, coûts)", () => {
    const slow = ["a", "b", "c"].map((x) =>
      fixtureModel({
        id: `nexora/lent-${x}`,
        name: `Lent ${x}`,
        sheet: {
          benchmarks: [
            {
              name: "Latence",
              score: 100,
              unit: "ms",
              publisher: "P",
              sourceUrl: "https://example.org/l",
            },
          ],
        },
      }),
    );
    expect(buildRankings(slow)).toEqual([]);
  });

  it("compte un modèle une seule fois même s'il a deux mesures de la même épreuve", () => {
    const twice = (id: string) =>
      fixtureModel({
        id: `nexora/${id}`,
        name: id,
        sheet: {
          benchmarks: ["P1", "P2"].map((publisher) => ({
            name: "E",
            score: 10,
            unit: "%",
            publisher,
            sourceUrl: `https://example.org/${publisher}`,
          })),
        },
      });
    expect(buildRankings([twice("x"), twice("y")])).toEqual([]);
    const three = buildRankings([twice("x"), twice("y"), twice("z")]);
    expect(three[0]?.rows).toHaveLength(6);
  });

  it("ne classe rien pour un catalogue sans mesure", () => {
    expect(buildRankings([])).toEqual([]);
    expect(buildRankings([fixtureModel()])).toEqual([]);
  });
});

describe("comparaison côte à côte", () => {
  it("garde les épreuves présentes chez au moins deux modèles comparés, dans l'ordre des colonnes", () => {
    const rows = commonBenchmarks([CODE_70B, MOE_PREVIEW, VISION_8B_PREVIEW]);
    expect(rows.map((r) => r.name)).toEqual([
      "SWE-test",
      "GPQA-test",
      "Arène-test",
    ]);
    const swe = rows[0];
    expect(swe?.cells.map((c) => c?.score)).toEqual([61.5, 55, 21]);
    const gpqa = rows[1];
    expect(gpqa?.cells.map((c) => c?.score)).toEqual([70, 68, undefined]);
    expect(gpqa?.cells[2]).toBeNull();
  });

  it("ne signale un meilleur résultat que si l'éditeur et l'unité sont les mêmes partout", () => {
    const [swe, gpqa] = commonBenchmarks([CODE_70B, MOE_PREVIEW]);
    expect(swe?.comparable).toBe(true);
    expect(swe?.best).toBe(0);
    // GPQA : deux éditeurs différents -> pas comparable strictement, aucun « meilleur »
    expect(gpqa?.comparable).toBe(false);
    expect(gpqa?.best).toBeNull();
    const mixed = commonBenchmarks([CODE_70B, VISION_8B_PREVIEW]);
    expect(mixed[0]?.comparable).toBe(false);
  });

  it("n'a aucune ligne si les modèles n'ont aucune épreuve en commun", () => {
    expect(commonBenchmarks([VISION_8B_PREVIEW, fixtureModel()])).toEqual([]);
    expect(commonBenchmarks([CODE_70B])).toEqual([]);
  });
});
