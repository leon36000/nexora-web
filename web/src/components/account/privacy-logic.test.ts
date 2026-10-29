import { describe, expect, it } from "vitest";
import {
  draftFromView,
  linesToList,
  requestFromDraft,
  withLevel,
} from "./privacy-logic";

const view = {
  level: "standard" as const,
  version: 0,
  isDefault: true,
  invalid: false,
  config: {
    maskCategories: ["email", "phone", "credit_card", "sin", "iban", "secret"],
    denyCategories: [],
    allowedHosts: [],
    blockedHosts: [],
    allowedModels: [],
    blockAttachments: false,
  },
  recent: { days: 30, counts: { allow: 0, mask: 0, deny: 0 } },
  versions: [],
};

describe("linesToList", () => {
  it("une entrée par ligne : espaces retirés, lignes vides et doublons écartés", () => {
    expect(linesToList(" a.ca \r\n\n b.ca\na.ca\n  \n")).toEqual([
      "a.ca",
      "b.ca",
    ]);
    expect(linesToList("")).toEqual([]);
  });
});

describe("brouillon du formulaire", () => {
  it("reprend la politique en vigueur", () => {
    const draft = draftFromView({
      ...view,
      level: "renforce",
      config: {
        ...view.config,
        maskCategories: ["email", "secret"],
        denyCategories: ["credit_card"],
        allowedModels: ["mistral-*", "agent/*"],
        blockAttachments: true,
      },
    });
    expect(draft.level).toBe("renforce");
    expect(draft.mask.email).toBe(true);
    expect(draft.mask.phone).toBe(false);
    // Un genre refusé reste « coché » : refuser suppose de le reconnaître.
    expect(draft.mask.credit_card).toBe(true);
    expect(draft.deny.credit_card).toBe(true);
    expect(draft.allowedModels).toBe("mistral-*\nagent/*");
    expect(draft.blockAttachments).toBe(true);
  });

  it("produit la requête : secrets toujours masqués, refus seulement pour les genres reconnus", () => {
    const draft = draftFromView(view);
    draft.mask.email = false;
    draft.deny.email = true; // sans effet : décoché
    draft.deny.credit_card = true;
    draft.deny.secret = true; // sans effet : toujours masqué
    draft.allowedHosts = "Exemple.CA\n*.exemple.ca";
    expect(requestFromDraft(draft)).toEqual({
      level: "standard",
      config: {
        maskCategories: ["phone", "credit_card", "sin", "iban", "secret"],
        denyCategories: ["credit_card"],
        allowedHosts: ["Exemple.CA", "*.exemple.ca"],
        blockedHosts: [],
        allowedModels: [],
        blockAttachments: false,
      },
    });
  });

  it("changer de niveau règle les pièces jointes tant que l'utilisateur n'y a pas touché", () => {
    const draft = draftFromView(view);
    expect(withLevel(draft, "renforce").blockAttachments).toBe(true);
    expect(withLevel(draft, "souverain").blockAttachments).toBe(true);
    expect(
      withLevel({ ...draft, blockAttachments: true }, "standard")
        .blockAttachments,
    ).toBe(false);
    const touched = { ...draft, attachmentsTouched: true };
    expect(withLevel(touched, "renforce").blockAttachments).toBe(false);
  });
});
