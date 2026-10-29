import { describe, expect, it } from "vitest";
import { AI_MODEL_DRAFTS, MARGIN_BPS } from "../gateway/catalog-ia-seed";
import { type PerMillion, sellFromMargin } from "../gateway/pricing";
import {
  INCLUDED_OUTPUT_SHARE_BPS,
  INCLUDED_TOKENS,
  includedCreditsCents,
  includedTokensUsed,
} from "./included-tokens";

/** Taux de la Banque du Canada du 26/10/2026 (docs/recherche/10) : référence du calcul, le taux approuvé fait foi en production. */
const FX_REFERENCE = 1_402_500n;

function salePriceOf(publicId: string): PerMillion {
  const draft = AI_MODEL_DRAFTS.find((d) => d.model.publicId === publicId);
  if (!draft) throw new Error(`modèle absent de la feuille de départ`);
  return {
    input: sellFromMargin(draft.reference.input, FX_REFERENCE, MARGIN_BPS),
    output: sellFromMargin(draft.reference.output, FX_REFERENCE, MARGIN_BPS),
    cache: null,
  };
}

describe("forfait de 5 millions de jetons inclus", () => {
  it("5 M de jetons, 70 % d'entrée et 30 % de sortie", () => {
    expect(INCLUDED_TOKENS).toBe(5_000_000);
    expect(INCLUDED_OUTPUT_SHARE_BPS).toBe(3000);
  });

  it("valeur du modèle par défaut (tarif de pointe de la feuille de départ, taux de référence, marge de 10 %) : 440 cents", () => {
    const price = salePriceOf("nexora/deepseek-v4.1-flash-1017");
    // 0,462825 $ / M en entrée et 1,8513 $ / M en sortie.
    expect(price).toMatchObject({ input: 462_825n, output: 1_851_300n });
    expect(includedCreditsCents(price)).toBe(440);
  });

  it("un modèle plus cher donne un forfait plus grand en dollars (GLM 5.3) : la valeur suit le prix", () => {
    const cheap = includedCreditsCents(
      salePriceOf("nexora/deepseek-v4.1-flash-1017"),
    );
    const dear = includedCreditsCents(salePriceOf("nexora/glm-5.3"));
    expect(dear).toBeGreaterThan(cheap);
  });

  it("arrondit vers le haut au cent : jamais moins que 5 M de jetons", () => {
    expect(includedCreditsCents({ input: 1n, output: 1n, cache: null })).toBe(
      1,
    );
  });
});

describe("jetons inclus utilisés (équivalent en valeur)", () => {
  const included = 4_400_000n; // 4,40 $
  it("rien consommé : 0 jeton", () => {
    expect(includedTokensUsed(0n, included)).toBe(0);
  });
  it("la moitié de la valeur : la moitié des jetons nominaux", () => {
    expect(includedTokensUsed(2_200_000n, included)).toBe(2_500_000);
  });
  it("tout consommé ou davantage : plafonné à 5 M", () => {
    expect(includedTokensUsed(included, included)).toBe(INCLUDED_TOKENS);
    expect(includedTokensUsed(included * 3n, included)).toBe(INCLUDED_TOKENS);
  });
  it("aucun forfait : 0, jamais de division par zéro", () => {
    expect(includedTokensUsed(100n, 0n)).toBe(0);
  });
  it("valeur négative (remboursement) : ramenée à 0", () => {
    expect(includedTokensUsed(-5n, included)).toBe(0);
  });
});
