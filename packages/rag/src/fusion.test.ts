import { describe, expect, it } from "vitest";
import { reciprocalRankFusion } from "./fusion.ts";

describe("reciprocalRankFusion", () => {
  it("place en tête ce qui est bien classé dans plusieurs listes", () => {
    const fused = reciprocalRankFusion([
      ["a", "b", "c"],
      ["b", "d", "a"],
    ]);
    expect(fused.map((f) => f.id)).toEqual(["b", "a", "d", "c"]);
  });

  it("calcule 1/(k+rang) cumulé avec k=60 par défaut et renvoie les rangs par liste", () => {
    const [top] = reciprocalRankFusion([["a"], ["a"]]);
    expect(top?.score).toBeCloseTo(2 / 61, 12);
    expect(top?.ranks).toEqual([1, 1]);
  });

  it("garde l'ordre d'apparition en cas d'égalité (résultat déterministe)", () => {
    const fused = reciprocalRankFusion([["x"], ["y"]]);
    expect(fused.map((f) => f.id)).toEqual(["x", "y"]);
  });

  it("applique des poids par liste", () => {
    const fused = reciprocalRankFusion([["a"], ["b"]], { weights: [1, 3] });
    expect(fused.map((f) => f.id)).toEqual(["b", "a"]);
  });

  it("marque null le rang d'une liste où l'élément est absent et ignore les listes vides", () => {
    const fused = reciprocalRankFusion([["a", "b"], []]);
    expect(fused[0]?.ranks).toEqual([1, null]);
    expect(reciprocalRankFusion([])).toEqual([]);
  });

  it("ne compte qu'une fois un identifiant répété dans la même liste", () => {
    const [top] = reciprocalRankFusion([["a", "a"]]);
    expect(top?.score).toBeCloseTo(1 / 61, 12);
  });
});
