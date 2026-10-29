import { describe, expect, test } from "bun:test";
import { describeIssue, issueHelp } from "./format";

describe("problèmes de publication", () => {
  test("nomme la plage et la route concernées", () => {
    expect(
      describeIssue({
        code: "below_margin_floor",
        model: "nexora/x",
        field: "cacheWrite",
        window: "creux",
      }),
    ).toBe(
      "nexora/x : prix sous le plancher de marge (cache écrit, plage « creux »)",
    );
    expect(
      describeIssue({
        code: "route_secret_missing",
        model: "nexora/x",
        route: 2,
      }),
    ).toBe(
      "nexora/x : clé du fournisseur de la route de secours n° 2 absente du Coffre",
    );
    expect(
      describeIssue({
        code: "route_below_margin_floor",
        model: "nexora/x",
        route: 1,
        field: "output",
      }),
    ).toBe(
      "nexora/x : la route de secours n° 1 ne tient pas le plancher de marge (sortie)",
    );
  });
  test("chaque problème dit quoi faire", () => {
    for (const code of [
      "fx_missing",
      "price_missing",
      "price_zero",
      "below_margin_floor",
      "provider_missing",
      "provider_disabled",
      "secret_missing",
      "route_provider_missing",
      "route_provider_disabled",
      "route_secret_missing",
      "route_below_margin_floor",
    ])
      expect(issueHelp(code).length).toBeGreaterThan(20);
    expect(issueHelp("secret_missing")).toContain("Coffre");
    expect(issueHelp("inconnu")).toBe("");
  });
});
