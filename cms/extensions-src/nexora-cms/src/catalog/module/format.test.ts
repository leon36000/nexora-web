import { describe, expect, test } from "bun:test";
import {
  describeDiff,
  describeIssue,
  formatDecimalMicro,
  parseDecimalMicro,
} from "./format";

describe("montants décimaux", () => {
  test("convertit sans passer par un nombre à virgule flottante", () => {
    expect(parseDecimalMicro("0,6")).toBe("600000");
    expect(parseDecimalMicro("0.60")).toBe("600000");
    expect(parseDecimalMicro("12")).toBe("12000000");
    expect(parseDecimalMicro("0.000001")).toBe("1");
    expect(parseDecimalMicro("123456789012.123456")).toBe("123456789012123456");
  });
  test("refuse les formats invalides", () => {
    for (const bad of ["", "abc", "-1", "1,2,3", "0.1234567", "1e3"])
      expect(parseDecimalMicro(bad)).toBeNull();
  });
  test("aller-retour", () => {
    for (const v of ["0,6", "12", "0,000001", "1,82"])
      expect(formatDecimalMicro(parseDecimalMicro(v))).toBe(v);
    expect(formatDecimalMicro(null)).toBe("");
  });
});

describe("libellés", () => {
  test("décrit les problèmes de publication", () => {
    expect(describeIssue({ code: "price_missing", model: "nexora/x" })).toBe(
      "nexora/x : prix absent",
    );
    expect(
      describeIssue({
        code: "below_margin_floor",
        model: "nexora/x",
        field: "output",
      }),
    ).toBe("nexora/x : prix sous le plancher de marge (sortie)");
    expect(describeIssue({ code: "fx_missing" })).toBe(
      "aucun taux de change approuvé",
    );
  });
  test("décrit les différences", () => {
    expect(describeDiff({ kind: "model_added", model: "nexora/x" })).toBe(
      "Modèle ajouté : nexora/x",
    );
    expect(
      describeDiff({
        kind: "model_changed",
        model: "nexora/x",
        changes: [{ field: "price.sellInputCadMicro" }],
      }),
    ).toContain("price.sellInputCadMicro");
  });
});
