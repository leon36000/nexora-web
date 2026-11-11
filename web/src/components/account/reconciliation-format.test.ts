import { describe, expect, it } from "vitest";
import { formatNanoUsd, parseFindingFilters } from "./reconciliation-format";

describe("formatNanoUsd (nano-USD entiers → USD décimal, sans flottant)", () => {
  it("écrit la décimale exacte, sans zéros inutiles", () => {
    expect(formatNanoUsd("57500")).toBe("0.0000575");
    expect(formatNanoUsd("1000000000")).toBe("1.00");
    expect(formatNanoUsd("1600000000")).toBe("1.60");
    expect(formatNanoUsd("1")).toBe("0.000000001");
    expect(formatNanoUsd("0")).toBe("0.00");
  });
  it("garde le signe d'un écart", () => {
    expect(formatNanoUsd("-1600000000")).toBe("-1.60");
  });
  it("valeur absente ou illisible : null (le dictionnaire donne « s. o. »)", () => {
    expect(formatNanoUsd(null)).toBeNull();
    expect(formatNanoUsd("abc")).toBeNull();
  });
});

describe("parseFindingFilters", () => {
  it("accepte seulement les types et états connus ; les valeurs inconnues sont ignorées", () => {
    expect(
      parseFindingFilters({ kind: "token_mismatch", status: "reviewed" }),
    ).toEqual({
      kind: "token_mismatch",
      status: "reviewed",
    });
    expect(parseFindingFilters({ kind: "'; DROP TABLE", status: "x" })).toEqual(
      {
        kind: undefined,
        status: "open",
      },
    );
    expect(parseFindingFilters({ status: "all" })).toEqual({
      kind: undefined,
      status: undefined,
    });
    expect(parseFindingFilters({})).toEqual({
      kind: undefined,
      status: "open",
    });
  });
});
