import { describe, expect, it } from "vitest";
import { fingerprintOf, parseContact } from "./schema";

const valid = {
  need: "diagnostic",
  sector: "construction",
  deployment: "indecis",
  name: "  Nathalie Tremblay ",
  email: "Nathalie@Exemple.CA ",
  company: "Rénovations Tremblay",
  message: "",
  marketingConsent: undefined,
  website: "",
  altcha: "x",
};

describe("validation du formulaire de contact (serveur)", () => {
  it("accepte une demande complète, nettoie les espaces et met le courriel en minuscules", () => {
    const r = parseContact(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({
      name: "Nathalie Tremblay",
      email: "nathalie@exemple.ca",
      company: "Rénovations Tremblay",
      message: null,
      marketingConsent: false,
    });
  });

  it("le consentement marketing n'est vrai que s'il est explicitement donné (jamais par défaut)", () => {
    for (const v of [undefined, "", "off", false, "false", null, 0])
      expect(
        (
          parseContact({ ...valid, marketingConsent: v }) as {
            data: { marketingConsent: boolean };
          }
        ).data.marketingConsent,
      ).toBe(false);
    for (const v of [true, "on", "true"])
      expect(
        (
          parseContact({ ...valid, marketingConsent: v }) as {
            data: { marketingConsent: boolean };
          }
        ).data.marketingConsent,
      ).toBe(true);
  });

  it("refuse chaque champ obligatoire vide, avec un code par champ", () => {
    const r = parseContact({ ...valid, name: " ", company: "", email: "" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toMatchObject({
      name: "required",
      company: "required",
      email: "required",
    });
  });

  it("refuse un courriel invalide, une valeur de liste inconnue et un texte trop long", () => {
    const r = parseContact({
      ...valid,
      email: "pas-un-courriel",
      need: "piratage",
      sector: 12,
      message: "x".repeat(4001),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toMatchObject({
      email: "invalid_email",
      need: "invalid_choice",
      sector: "invalid_choice",
      message: "too_long",
    });
  });

  it("refuse les sauts de ligne dans un champ d'une ligne (injection d'en-têtes de courriel)", () => {
    const r = parseContact({ ...valid, name: "Marc\r\nBcc: x@y.z" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.name).toBe("invalid_chars");
    const e = parseContact({ ...valid, email: "a@b.ca\nBcc: x@y.z" });
    expect(e.ok).toBe(false);
  });

  it("ne lève jamais, quelle que soit l'entrée", () => {
    for (const bad of [null, undefined, 3, "x", [], { need: {} }])
      expect(parseContact(bad).ok).toBe(false);
  });
});

describe("empreinte d'une demande (déduplication sur 24 h)", () => {
  const base = parseContact(valid);
  if (!base.ok) throw new Error("fixture");

  it("est stable : mêmes courriel et contenu, mêmes espaces ou casse -> même empreinte", () => {
    const again = parseContact({
      ...valid,
      email: "NATHALIE@exemple.ca",
      name: "Nathalie   Tremblay",
      message: "  ",
    });
    if (!again.ok) throw new Error("fixture");
    expect(fingerprintOf(again.data)).toBe(fingerprintOf(base.data));
    expect(fingerprintOf(base.data)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("change dès que le contenu ou le courriel change ; le consentement marketing n'y entre pas", () => {
    const other = parseContact({ ...valid, message: "Autre sujet" });
    const mail = parseContact({ ...valid, email: "autre@exemple.ca" });
    const consent = parseContact({ ...valid, marketingConsent: true });
    if (!other.ok || !mail.ok || !consent.ok) throw new Error("fixture");
    expect(fingerprintOf(other.data)).not.toBe(fingerprintOf(base.data));
    expect(fingerprintOf(mail.data)).not.toBe(fingerprintOf(base.data));
    expect(fingerprintOf(consent.data)).toBe(fingerprintOf(base.data));
  });
});
