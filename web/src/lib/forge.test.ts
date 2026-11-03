import { describe, expect, it } from "vitest";
import { FORGE, forgeUrl } from "./forge";

describe("forgeUrl", () => {
  it("rend l'adresse par défaut sans configuration", () => {
    expect(forgeUrl({})).toBe(FORGE.defaultUrl);
  });
  it("prend GITSPACE_FORGE_URL quand elle est valide", () => {
    expect(forgeUrl({ GITSPACE_FORGE_URL: "https://git.exemple.ca/" })).toBe(
      "https://git.exemple.ca/",
    );
  });
  it("refuse les schémas dangereux et les valeurs invalides", () => {
    expect(forgeUrl({ GITSPACE_FORGE_URL: "javascript:alert(1)" })).toBe(
      FORGE.defaultUrl,
    );
    expect(forgeUrl({ GITSPACE_FORGE_URL: "pas une adresse" })).toBe(
      FORGE.defaultUrl,
    );
  });
});
