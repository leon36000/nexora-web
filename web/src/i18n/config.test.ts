import { describe, expect, it } from "vitest";
import { localizePath, stripLangPrefix } from "./config";

describe("adresses localisées", () => {
  it("la page Tarifs a deux adresses : /tarifs en français, /en/pricing en anglais", () => {
    expect(localizePath("fr", "/tarifs")).toBe("/tarifs");
    expect(localizePath("en", "/tarifs")).toBe("/en/pricing");
  });
  it("le chemin neutre est retrouvé depuis l'adresse anglaise (sélecteur de langue, navigation)", () => {
    expect(stripLangPrefix("/en/pricing")).toBe("/tarifs");
    expect(stripLangPrefix("/tarifs")).toBe("/tarifs");
    expect(stripLangPrefix("/en/tarifs")).toBe("/tarifs");
  });
  it("les autres chemins ne changent pas", () => {
    expect(localizePath("en", "/vps")).toBe("/en/vps");
    expect(localizePath("en", "/")).toBe("/en");
    expect(localizePath("fr", "/vps/")).toBe("/vps");
    expect(stripLangPrefix("/en/vps")).toBe("/vps");
    expect(stripLangPrefix("/en")).toBe("/");
    // une page Directus qui s'appellerait « pricing » en français n'est pas touchée
    expect(stripLangPrefix("/pricing")).toBe("/pricing");
  });
});
