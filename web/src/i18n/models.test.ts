import { describe, expect, it } from "vitest";
import { formatMonth, formatTokensShort, plural } from "./models";

describe("formats des pages de modèles", () => {
  it("jetons en forme courte, arrondis vers le bas comme l'usage", () => {
    expect(formatTokensShort("fr", 8_192)).toBe("8 k");
    expect(formatTokensShort("fr", 32_768)).toBe("32 k");
    expect(formatTokensShort("fr", 131_072)).toBe("131 k");
    expect(formatTokensShort("fr", 1_048_576)).toBe("1 M");
    expect(formatTokensShort("fr", 2_500_000)).toBe("2,5 M");
    expect(formatTokensShort("en", 2_500_000)).toBe("2.5 M");
    expect(formatTokensShort("fr", 512)).toBe("512");
  });

  it("mois en toutes lettres et pluriel selon la langue", () => {
    expect(formatMonth("fr", "2026-03")).toBe("mars 2026");
    expect(formatMonth("en", "2026-03")).toBe("March 2026");
    const forms = { one: "modèle", other: "modèles" };
    expect(plural("fr", 0, forms)).toBe("modèle");
    expect(plural("fr", 1, forms)).toBe("modèle");
    expect(plural("fr", 2, forms)).toBe("modèles");
    expect(plural("en", 0, { one: "model", other: "models" })).toBe("models");
  });
});
