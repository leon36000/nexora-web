import { describe, expect, it } from "vitest";
import { CONTACT_SUBJECTS, resolveContactSubject } from "./contact-subject";

const prefills = { "apps-webpilot": "Liste d’attente : Nexora WebPilot." };

describe("sujet du formulaire de contact (?sujet=)", () => {
  it("garde les sujets existants des pages (démonstration, étude, diagnostic, Vision, Croissance)", () => {
    expect(resolveContactSubject("demonstration", prefills)).toEqual({
      need: "opsys-ai",
    });
    expect(resolveContactSubject("etude-deploiement", prefills).need).toBe(
      "installation",
    );
    expect(resolveContactSubject("diagnostic", prefills).need).toBe(
      "diagnostic",
    );
    expect(resolveContactSubject("pilote-vision", prefills).need).toBe(
      "vision",
    );
    expect(resolveContactSubject("acces-croissance", prefills).need).toBe(
      "croissance",
    );
  });

  it("un sujet d'une fiche Nexora Apps présélectionne un besoin et préremplit le message", () => {
    expect(resolveContactSubject("apps-webpilot", prefills)).toEqual({
      need: CONTACT_SUBJECTS["apps-webpilot"],
      message: "Liste d’attente : Nexora WebPilot.",
    });
  });

  it("ne renvoie rien pour un sujet absent, inconnu ou hostile (aucune propriété héritée)", () => {
    expect(resolveContactSubject(null, prefills)).toEqual({});
    expect(resolveContactSubject("", prefills)).toEqual({});
    expect(resolveContactSubject("inconnu", prefills)).toEqual({});
    for (const subject of ["__proto__", "constructor", "toString", "valueOf"])
      expect(resolveContactSubject(subject, prefills), subject).toEqual({});
  });
});
