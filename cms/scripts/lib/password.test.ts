import { describe, expect, test } from "bun:test";
import {
  generatePassword,
  meetsPasswordPolicy,
  PASSWORD_POLICY,
} from "./password";

describe("politique de mot de passe (directus_settings.auth_password_policy)", () => {
  test("Directus la lit comme une expression régulière entre barres obliques", () => {
    expect(PASSWORD_POLICY.startsWith("/")).toBe(true);
    expect(PASSWORD_POLICY.endsWith("/")).toBe(true);
    expect(() => new RegExp(PASSWORD_POLICY.slice(1, -1))).not.toThrow();
  });

  test("refuse un mot de passe court, sans majuscule, sans minuscule ou sans chiffre", () => {
    for (const faible of [
      "Court1a",
      "sansmajuscule123",
      "SANSMINUSCULE123",
      "SansChiffreDuTout",
      "",
      "password",
    ])
      expect(meetsPasswordPolicy(faible), faible).toBe(false);
  });

  test("accepte 12 caractères ou plus avec minuscule, majuscule et chiffre", () => {
    for (const bon of [
      "Abcdefghij12",
      "Une-phrase-de-passe-longue-9",
      "x9Y-aaaaaaaa-bbbb",
    ])
      expect(meetsPasswordPolicy(bon), bon).toBe(true);
  });

  test("un mot de passe généré par les scripts respecte toujours la politique", () => {
    for (let i = 0; i < 2000; i++) {
      const p = generatePassword();
      expect(p.length).toBeGreaterThanOrEqual(12);
      expect(meetsPasswordPolicy(p), p).toBe(true);
    }
  });

  test("deux mots de passe générés diffèrent", () => {
    expect(generatePassword()).not.toBe(generatePassword());
  });
});
