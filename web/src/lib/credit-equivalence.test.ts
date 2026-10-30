import { describe, expect, it } from "vitest";
import type { PublicModel } from "@/server/gateway/public";
import {
  creditEquivalents,
  perMillionToMicro,
  tokensForCredits,
} from "./credit-equivalence";

const model = (
  id: string,
  inputPerMillion: string,
  outputPerMillion: string,
  over: Partial<PublicModel> = {},
): PublicModel =>
  ({
    id,
    name: id,
    kind: "chat",
    availability: "live",
    inputPerMillion,
    outputPerMillion,
    ...over,
  }) as PublicModel;

describe("prix décimal du catalogue -> micro-CAD", () => {
  it("lit les décimaux exacts, sans virgule flottante", () => {
    expect(perMillionToMicro("0.30855")).toBe(308_550n);
    expect(perMillionToMicro("0.925650")).toBe(925_650n);
    expect(perMillionToMicro("12")).toBe(12_000_000n);
    expect(perMillionToMicro("0.6")).toBe(600_000n);
  });
  it("refuse un prix illisible, négatif ou nul (jamais une division par zéro)", () => {
    for (const bad of ["", "abc", "-1", "0", "0.000000", "1.2.3", "1e3"])
      expect(perMillionToMicro(bad), bad).toBeNull();
  });
  it("tronque au-delà de 6 décimales plutôt que d'arrondir vers le haut", () => {
    expect(perMillionToMicro("0.1234567")).toBe(123_456n);
  });
});

describe("jetons qu'achètent des crédits (1 crédit = 1 ¢ CA = 10 000 micro-CAD)", () => {
  it("1 000 crédits = 10 $ de jetons : 10 $ / prix par million", () => {
    // 10 000 000 micro-CAD ÷ 308 550 micro-CAD par million de jetons = 32,41 M de jetons.
    expect(tokensForCredits(1000, 308_550n)).toBe(32_409_658);
    expect(tokensForCredits(1000, 925_650n)).toBe(10_803_219);
    expect(tokensForCredits(1000, 1_000_000n)).toBe(10_000_000);
  });
  it("proportionnel au nombre de crédits ; un crédit à 1 $ le million donne 10 000 jetons", () => {
    expect(tokensForCredits(1, 1_000_000n)).toBe(10_000);
    expect(tokensForCredits(0, 1_000_000n)).toBe(0);
  });
});

describe("modèles choisis pour illustrer l'équivalence", () => {
  const catalog = [
    model("a/petit", "0.1", "0.2"),
    model("b/moyen", "1", "3"),
    model("c/gros", "5", "15"),
    model("d/defaut", "0.30855", "0.92565"),
    model("e/aperçu", "0.01", "0.02", { availability: "preview" }),
    model("f/embed", "0.01", "0", { kind: "embedding" }),
    model("g/sans-prix", "abc", "1"),
  ];

  it("ne retient que des modèles de discussion appelables, au prix lisible", () => {
    const rows = creditEquivalents(catalog, { credits: 1000, max: 10 });
    expect(rows.map((r) => r.id).sort()).toEqual([
      "a/petit",
      "b/moyen",
      "c/gros",
      "d/defaut",
    ]);
  });

  it("montre le moins cher, le plus cher, un intermédiaire et le modèle par défaut s'il existe, triés du moins cher au plus cher", () => {
    const rows = creditEquivalents(catalog, {
      credits: 1000,
      defaultId: "d/defaut",
      max: 4,
    });
    expect(rows.map((r) => r.id)).toEqual([
      "a/petit",
      "d/defaut",
      "b/moyen",
      "c/gros",
    ]);
  });

  it("calcule entrée et sortie depuis les prix du catalogue", () => {
    const [row] = creditEquivalents([model("b/moyen", "1", "3")], {
      credits: 1000,
      max: 4,
    });
    expect(row).toEqual({
      id: "b/moyen",
      name: "b/moyen",
      inputTokens: 10_000_000,
      outputTokens: 3_333_333,
    });
  });

  it("catalogue vide ou sans modèle exploitable : aucune ligne, jamais d'invention", () => {
    expect(creditEquivalents([], { credits: 1000, max: 4 })).toEqual([]);
    expect(
      creditEquivalents([model("x/y", "abc", "def")], {
        credits: 1000,
        max: 4,
      }),
    ).toEqual([]);
  });

  it("un modèle gratuit en sortie (prix nul) n'a pas d'équivalent en sortie, donc n'est pas montré", () => {
    expect(
      creditEquivalents([model("x/y", "1", "0")], { credits: 1000, max: 4 }),
    ).toEqual([]);
  });
});
