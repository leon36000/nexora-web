import { describe, expect, it } from "vitest";
import { DEFAULT_MARGIN_BPS } from "../gateway/catalog";
import { type PerMillion, sellFromMargin } from "../gateway/pricing";
import {
  INCLUDED_OUTPUT_SHARE_BPS,
  INCLUDED_TOKENS,
  includedCreditsCents,
  includedTokensUsed,
} from "./included-tokens";

/** Taux de la Banque du Canada du 26/10/2026 (docs/recherche/10) : référence du calcul, le taux approuvé fait foi en production. */
const FX_REFERENCE = 1_402_500n;

/**
 * Coûts amont du catalogue DeepInfra (lu le 29/10/2026), micro-USD par million. Ils servent de référence au calcul du
 * forfait ; la valeur suit le prix PUBLIÉ du modèle par défaut (voir docs/catalogue-deepinfra.md).
 */
const REFERENCE_UPSTREAM: Record<string, { input: bigint; output: bigint }> = {
  "nexora/deepseek-v4.1-flash-1017": { input: 200_000n, output: 600_000n },
  "nexora/glm-5.3": { input: 900_000n, output: 4_000_000n },
};

function salePriceOf(publicId: string): PerMillion {
  const ref = REFERENCE_UPSTREAM[publicId];
  if (!ref) throw new Error("modèle absent de la référence de calcul");
  return {
    input: sellFromMargin(ref.input, FX_REFERENCE, DEFAULT_MARGIN_BPS),
    output: sellFromMargin(ref.output, FX_REFERENCE, DEFAULT_MARGIN_BPS),
    cache: null,
  };
}

describe("forfait de 5 millions de jetons inclus", () => {
  it("5 M de jetons, 70 % d'entrée et 30 % de sortie", () => {
    expect(INCLUDED_TOKENS).toBe(5_000_000);
    expect(INCLUDED_OUTPUT_SHARE_BPS).toBe(3000);
  });

  it("valeur du modèle par défaut (prix DeepInfra, taux de référence, marge de 10 %) : 247 cents", () => {
    const price = salePriceOf("nexora/deepseek-v4.1-flash-1017");
    // 0,30855 $ / M en entrée et 0,92565 $ / M en sortie.
    expect(price).toMatchObject({ input: 308_550n, output: 925_650n });
    expect(includedCreditsCents(price)).toBe(247);
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
  const included = 2_470_000n; // 2,47 $
  it("rien consommé : 0 jeton", () => {
    expect(includedTokensUsed(0n, included)).toBe(0);
  });
  it("la moitié de la valeur : la moitié des jetons nominaux", () => {
    expect(includedTokensUsed(1_235_000n, included)).toBe(2_500_000);
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
