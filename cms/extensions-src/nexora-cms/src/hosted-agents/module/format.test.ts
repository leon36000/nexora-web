import { describe, expect, test } from "bun:test";
import { errorMessage, linesToList } from "./format";

describe("errorMessage", () => {
  test("traduit les codes connus et détaille les motifs de refus de publication", () => {
    expect(errorMessage("conflict")).toContain("déjà utilisé");
    const msg = errorMessage("publication_refused", [
      { code: "name_en_missing" },
      { code: "price_missing" },
    ]);
    expect(msg).toContain("nom anglais manquant");
    expect(msg).toContain("aucun prix en vigueur");
  });
  test("signale un code inconnu sans rien inventer", () => {
    expect(errorMessage("x_bizarre")).toBe("Échec de l’opération. (x_bizarre)");
  });
});

describe("linesToList", () => {
  test("une page par ligne, lignes vides ignorées", () => {
    expect(linesToList("/agents\n\n  /workstudio \r\n")).toEqual([
      "/agents",
      "/workstudio",
    ]);
  });
});
