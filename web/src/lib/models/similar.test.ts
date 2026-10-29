import { describe, expect, it } from "vitest";
import {
  CODE_70B,
  EMBED_SMALL,
  FIXTURES,
  fixtureModel,
  LONG_CONTEXT,
  MOE_PREVIEW,
  NO_SHEET,
  REASONING_XL,
  VISION_8B_PREVIEW,
} from "./fixtures";
import { similarModels } from "./similar";

const idsOf = (m: Parameters<typeof similarModels>[0], n?: number) =>
  similarModels(m, FIXTURES, n).map((x) => x.id);

describe("modèles similaires", () => {
  it("met d'abord ceux qui partagent le plus d'étiquettes", () => {
    // MOE : code, agents, raisonnement (3 communes). Ensuite une seule étiquette commune chacun, du prix le plus
    // proche (0,30 $) au plus éloigné : VISION (poids ouverts, 0,05 $), LONG (agents, 2 $), REASONING_XL (5 $).
    expect(idsOf(CODE_70B, 4)).toEqual([
      MOE_PREVIEW.id,
      VISION_8B_PREVIEW.id,
      LONG_CONTEXT.id,
      REASONING_XL.id,
    ]);
  });

  it("à étiquettes égales, préfère le prix d'entrée le plus proche", () => {
    // pour REASONING_XL (5 $, « raisonnement ») : CODE (0,30 $) et MOE (0,60 $) la partagent ; MOE est plus proche
    expect(idsOf(REASONING_XL, 2)).toEqual([MOE_PREVIEW.id, CODE_70B.id]);
  });

  it("ne propose jamais le modèle lui-même, ni un autre type", () => {
    expect(idsOf(CODE_70B)).not.toContain(CODE_70B.id);
    expect(idsOf(EMBED_SMALL)).toEqual([]);
    expect(idsOf(CODE_70B)).not.toContain(EMBED_SMALL.id);
  });

  it("sans étiquette commune, ne propose rien (pas de recommandation sans raison)", () => {
    expect(idsOf(NO_SHEET)).toEqual([]);
    // une étiquette « code » : seuls CODE et MOE la portent, MOE (0,60 $) est plus proche de 0,50 $
    expect(
      idsOf(fixtureModel({ id: "nexora/seul", sheet: { tags: ["code"] } }), 5),
    ).toEqual([MOE_PREVIEW.id, CODE_70B.id]);
  });

  it("limite le nombre de résultats", () => {
    expect(idsOf(CODE_70B, 1)).toEqual([MOE_PREVIEW.id]);
    expect(idsOf(VISION_8B_PREVIEW, 10).length).toBeLessThanOrEqual(
      FIXTURES.length - 1,
    );
  });
});
