import { describe, expect, it } from "vitest";
import { CONTACT_SUBJECTS, resolveContactSubject } from "./contact-subject";

const prefills = {
  "apps-webpilot": "Liste d’attente : Nexora WebPilot.",
  "modele-apercu": "Prévenez-moi à l’ouverture du modèle : ",
  "ouverture-plateforme":
    "Prévenez-moi à l’ouverture de la plateforme à crédits.",
};

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

  it("« modele-apercu » préremplit le message avec l'identifiant du modèle, s'il a la forme d'un identifiant", () => {
    expect(
      resolveContactSubject("modele-apercu", prefills, "nexora/exemple-moe"),
    ).toEqual({
      need: CONTACT_SUBJECTS["modele-apercu"],
      message: "Prévenez-moi à l’ouverture du modèle : nexora/exemple-moe",
    });
    // sans identifiant ou avec un identifiant douteux : le message de base seulement
    for (const detail of [null, "", "<script>", "a b", "../x"])
      expect(
        resolveContactSubject("modele-apercu", prefills, detail).message,
      ).toBe("Prévenez-moi à l’ouverture du modèle : ");
    // l'identifiant ne s'ajoute à aucun autre sujet
    expect(
      resolveContactSubject("apps-webpilot", prefills, "nexora/x-1").message,
    ).toBe("Liste d’attente : Nexora WebPilot.");
  });

  it("« ouverture-plateforme » est reconnu (besoin « autre ») et préremplit le message, sans identifiant de modèle", () => {
    expect(CONTACT_SUBJECTS["ouverture-plateforme"]).toBe("autre");
    expect(resolveContactSubject("ouverture-plateforme", prefills)).toEqual({
      need: "autre",
      message: "Prévenez-moi à l’ouverture de la plateforme à crédits.",
    });
    expect(
      resolveContactSubject("ouverture-plateforme", prefills, "nexora/x-1")
        .message,
    ).toBe("Prévenez-moi à l’ouverture de la plateforme à crédits.");
  });
});
