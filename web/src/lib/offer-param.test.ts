import { describe, expect, it } from "vitest";
import { parseOffer, withOffer } from "./offer-param";

describe("offre choisie sur la page Tarifs", () => {
  it("accepte un code d'offre en minuscules, chiffres et tirets", () => {
    expect(parseOffer("workstudio-equipe")).toBe("workstudio-equipe");
    expect(parseOffer("equipe-2")).toBe("equipe-2");
  });
  it("refuse tout le reste (jamais une adresse, un script ni une valeur répétée)", () => {
    for (const bad of ["", null, undefined, "A B", "../x", "x".repeat(101), "a/b", "javascript:alert(1)", "é"])
      expect(parseOffer(bad as never)).toBeNull();
  });
  it("ajoute le paramètre à un chemin, avec ou sans requête existante", () => {
    expect(withOffer("/compte", "pro")).toBe("/compte?offre=pro");
    expect(withOffer("/compte?a=1", "pro")).toBe("/compte?a=1&offre=pro");
    expect(withOffer("/compte", null)).toBe("/compte");
  });
});
