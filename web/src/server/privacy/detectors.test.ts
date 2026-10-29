import { describe, expect, it } from "vitest";
import {
  DETECTOR_CATEGORIES,
  findMatches,
  ibanValid,
  luhnValid,
  maskPersonalData,
} from "./detectors";

const masked = (text: string, categories = DETECTOR_CATEGORIES) =>
  maskPersonalData(text, categories).text;

describe("luhnValid", () => {
  it("accepte les numéros d'essai connus et refuse une erreur d'un chiffre", () => {
    expect(luhnValid("4111111111111111")).toBe(true);
    expect(luhnValid("378282246310005")).toBe(true);
    expect(luhnValid("130692544")).toBe(true);
    expect(luhnValid("4111111111111112")).toBe(false);
    expect(luhnValid("")).toBe(false);
    expect(luhnValid("12a4")).toBe(false);
  });
});

describe("ibanValid", () => {
  it("vérifie la clé modulo 97 et la longueur du pays", () => {
    expect(ibanValid("FR7630006000011234567890189")).toBe(true);
    expect(ibanValid("DE89370400440532013000")).toBe(true);
    expect(ibanValid("GB82WEST12345698765432")).toBe(true);
    expect(ibanValid("FR7630006000011234567890188")).toBe(false);
    // Bonne clé pour une longueur fausse (France : 27 caractères).
    expect(ibanValid("FR1420041010050500013M0260")).toBe(false);
  });
});

describe("courriel", () => {
  it("masque les adresses, avec accents, signe plus et sous-domaines", () => {
    expect(masked("Écrivez à jean.tremblay+rh@exemple.qc.ca svp")).toBe(
      "Écrivez à [COURRIEL] svp",
    );
    expect(masked("a@b.co et zoé@société.fr")).toBe("[COURRIEL] et [COURRIEL]");
  });
  it("ignore ce qui n'est pas une adresse", () => {
    for (const text of [
      "@mention seule",
      "a@b",
      "mot@ isolé",
      "x@@y.com",
      "rendez-vous @ 14 h",
      "user@.com",
    ])
      expect(masked(text), text).toBe(text);
  });
});

describe("téléphone", () => {
  it("masque les formats nord-américains courants", () => {
    for (const phone of [
      "514-555-0199",
      "(514) 555-0199",
      "514 555 0199",
      "514.555.0199",
      "+1 514 555 0199",
      "1-800-555-0199",
      "5145550199",
    ])
      expect(masked(`Appelez le ${phone} demain`), phone).toBe(
        "Appelez le [TÉLÉPHONE] demain",
      );
  });
  it("masque un numéro international E.164", () => {
    expect(masked("Mobile : +33 6 12 34 56 78.")).toBe("Mobile : [TÉLÉPHONE].");
    expect(masked("+442071838750")).toBe("[TÉLÉPHONE]");
  });
  it("ignore dates, horodatages, identifiants et numéros trop courts", () => {
    for (const text of [
      "le 2024-01-15 à 10:30",
      "horodatage 1730000000000",
      "commande 123456",
      "version 10.2.3",
      "total 1 234,56 $",
    ])
      expect(masked(text), text).toBe(text);
  });
});

describe("carte de crédit", () => {
  it("masque un numéro valide (Luhn), avec ou sans séparateurs", () => {
    expect(masked("Carte 4111 1111 1111 1111 exp 12/29")).toBe(
      "Carte [CARTE] exp 12/29",
    );
    expect(masked("5555-5555-5555-4444")).toBe("[CARTE]");
    expect(masked("378282246310005")).toBe("[CARTE]");
  });
  it("laisse passer un numéro qui échoue au Luhn ou trop long", () => {
    expect(masked("4111 1111 1111 1112")).toBe("4111 1111 1111 1112");
    expect(masked("41111111111111111111111")).toBe("41111111111111111111111");
  });
});

describe("NAS canadien", () => {
  it("masque un NAS valide (Luhn) en trois groupes ou d'un bloc", () => {
    expect(masked("NAS : 130 692 544")).toBe("NAS : [NAS]");
    expect(masked("130-692-544")).toBe("[NAS]");
    expect(masked("130692544")).toBe("[NAS]");
  });
  it("ignore un groupe de neuf chiffres qui échoue au Luhn", () => {
    expect(masked("130 692 545")).toBe("130 692 545");
  });
  it("ne confond pas un téléphone avec un NAS", () => {
    expect(masked("514 555 0199")).toBe("[TÉLÉPHONE]");
  });
});

describe("IBAN", () => {
  it("masque un IBAN valide, avec ou sans espaces", () => {
    expect(masked("IBAN FR76 3000 6000 0112 3456 7890 189 merci")).toBe(
      "IBAN [IBAN] merci",
    );
    expect(masked("de89370400440532013000")).toBe("[IBAN]");
    expect(masked("GB82 WEST 1234 5698 7654 32")).toBe("[IBAN]");
  });
  it("ignore une suite qui ressemble à un IBAN sans en être un", () => {
    expect(masked("FR76 3000 6000 0112 3456 7890 188")).toBe(
      "FR76 3000 6000 0112 3456 7890 188",
    );
  });
});

describe("clés et secrets", () => {
  it("masque nxk_, sk-, Bearer et les formats courants", () => {
    expect(masked("clé nxk_AbCd1234EfGh5678 ok")).toBe("clé [SECRET] ok");
    expect(masked("OPENAI=sk-proj-abcdefghijklmnopqrstuvwxyz012345")).toBe(
      "OPENAI=[SECRET]",
    );
    expect(masked("sk-ant-api03-abcdefghijklmnopqrstuvwxyz_0123-xyz")).toBe(
      "[SECRET]",
    );
    expect(
      masked("Authorization: Bearer abcdefghijklmnop1234567890.xyz-abc"),
    ).toBe("Authorization: [SECRET]");
    expect(masked("AKIAIOSFODNN7EXAMPLE")).toBe("[SECRET]");
    expect(masked("ghp_abcdefghijklmnopqrstuvwxyz0123456789")).toBe("[SECRET]");
    expect(
      masked(
        "jeton eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123_-xyz",
      ),
    ).toBe("jeton [SECRET]");
    expect(
      masked(
        "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkq\n-----END PRIVATE KEY----- fin",
      ),
    ).toBe("[SECRET] fin");
  });
  it("ignore les mots ordinaires", () => {
    for (const text of [
      "le sk-8 est un code court",
      "Bearer tokens sont utiles",
      "nxk_ seul",
      "task-force",
    ])
      expect(masked(text), text).toBe(text);
  });
});

describe("combinaison, priorité et catégories", () => {
  it("masque plusieurs genres dans un même texte et compte par catégorie", () => {
    const result = maskPersonalData(
      "jean@exemple.ca, 514-555-0199, 4111 1111 1111 1111 et marie@exemple.ca",
      DETECTOR_CATEGORIES,
    );
    expect(result.text).toBe("[COURRIEL], [TÉLÉPHONE], [CARTE] et [COURRIEL]");
    expect(result.counts).toEqual({ email: 2, phone: 1, credit_card: 1 });
  });
  it("un secret l'emporte sur un numéro qu'il contient", () => {
    expect(masked("sk-abcdefghijklmnop4111111111111111xyz")).toBe("[SECRET]");
  });
  it("ne masque que les catégories demandées", () => {
    expect(masked("jean@exemple.ca 514-555-0199", ["phone"])).toBe(
      "jean@exemple.ca [TÉLÉPHONE]",
    );
    expect(masked("jean@exemple.ca", [])).toBe("jean@exemple.ca");
  });
  it("renvoie les positions triées et sans chevauchement", () => {
    const matches = findMatches("a@b.co 514-555-0199", DETECTOR_CATEGORIES);
    expect(matches.map((m) => m.category)).toEqual(["email", "phone"]);
    expect(matches[0]?.end).toBeLessThanOrEqual(matches[1]?.start ?? 0);
  });
  it("est stable : masquer deux fois donne le même résultat", () => {
    const once = masked("jean@exemple.ca 514-555-0199");
    expect(masked(once)).toBe(once);
  });
  it("reste linéaire sur de très longues suites (pas de blocage)", () => {
    const started = performance.now();
    const big = [
      "a".repeat(2_000_000),
      "1".repeat(2_000_000),
      "@".repeat(500_000),
      "-----BEGIN PRIVATE KEY-----".repeat(20_000),
      "1 ".repeat(500_000),
    ].join(" ");
    maskPersonalData(big, DETECTOR_CATEGORIES);
    expect(performance.now() - started).toBeLessThan(5000);
  });
});
