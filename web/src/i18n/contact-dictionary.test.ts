import { LEAD_DEPLOYMENTS, LEAD_NEEDS, LEAD_SECTORS } from "@nexora/db";
import { describe, expect, it } from "vitest";
import { getDictionary } from "./get-dictionary";

describe("dictionnaires du formulaire de contact", () => {
  for (const lang of ["fr", "en"] as const) {
    const f = getDictionary(lang).contact.form;
    it(`${lang} : une option par valeur acceptée par le serveur, dans le même ordre`, () => {
      expect(Object.keys(f.need.options)).toEqual([...LEAD_NEEDS]);
      expect(Object.keys(f.sector.options)).toEqual([...LEAD_SECTORS]);
      expect(Object.keys(f.deployment.options)).toEqual([...LEAD_DEPLOYMENTS]);
    });
    it(`${lang} : chaque code d'erreur du serveur a son message`, () => {
      const errors = getDictionary(lang).contact.errors;
      for (const code of [
        "required",
        "invalid_email",
        "invalid_choice",
        "too_long",
        "invalid_chars",
        "altcha",
        "rate_limited",
        "storage",
      ])
        expect(errors).toHaveProperty(code);
    });
  }

  it("la confirmation est honnête : « enregistrée », jamais un délai de réponse chiffré", () => {
    for (const lang of ["fr", "en"] as const) {
      const s = getDictionary(lang).contact.success;
      expect(s.title).toMatch(/enregistrée|recorded/i);
      for (const text of [s.text, s.already])
        expect(text).not.toMatch(
          /\d+\s*(h|heures?|hours?|jours?|days?|minutes?)\b/i,
        );
    }
  });
});
