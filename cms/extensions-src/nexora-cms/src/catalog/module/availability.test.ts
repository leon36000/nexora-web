import { describe, expect, test } from "bun:test";
import {
  canPromote,
  PREVIEW_HELP,
  PREVIEW_LABEL,
  previewSuggestion,
} from "./availability";

describe("case « Aperçu » de l'assistant", () => {
  test("le libellé dit ce que l'aperçu fait et ne fait pas", () => {
    expect(PREVIEW_LABEL).toBe(
      "Aperçu : visible au catalogue, pas encore appelable",
    );
    expect(PREVIEW_HELP).toContain("clé");
    expect(PREVIEW_HELP).toContain("404");
    expect(PREVIEW_HELP).toContain("Passer en service");
  });

  test("suggère l'aperçu quand la clé du fournisseur n'est pas dans le Coffre", () => {
    expect(
      previewSuggestion({
        type: "openai_compatible",
        secretRef: "llm.deepinfra",
        secretPresent: false,
      }),
    ).toContain("llm.deepinfra");
    expect(
      previewSuggestion({
        type: "openai_compatible",
        secretRef: "llm.deepinfra",
        secretPresent: true,
      }),
    ).toBe("");
    // Un fournisseur sans clé requise (Ollama interne) n'a rien à suggérer.
    expect(
      previewSuggestion({
        type: "ollama",
        secretRef: null,
        secretPresent: null,
      }),
    ).toBe("");
    expect(previewSuggestion(undefined)).toBe("");
  });

  test("« Passer en service » n'est proposé qu'à un modèle publié en aperçu", () => {
    expect(canPromote({ status: "published", availability: "preview" })).toBe(
      true,
    );
    expect(canPromote({ status: "published", availability: "live" })).toBe(
      false,
    );
    expect(canPromote({ status: "published" })).toBe(false);
    expect(canPromote({ status: "draft", availability: "preview" })).toBe(
      false,
    );
    expect(canPromote({ status: "retired", availability: "preview" })).toBe(
      false,
    );
  });
});
