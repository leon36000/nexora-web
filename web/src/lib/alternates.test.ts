import { describe, expect, it } from "vitest";
import {
  alternatePath,
  buildAlternates,
  resolveHrefForLang,
} from "./alternates";

const alt = buildAlternates([
  { "fr-CA": "souverainete", "en-CA": "sovereignty" },
  { "fr-CA": "souverainete/loi-25", "en-CA": "sovereignty/law-25" },
  { "fr-CA": "opsys-ai", "en-CA": "opsys-ai" },
  { "fr-CA": "mentions-legales" }, // pas encore traduite
  { "fr-CA": "", "en-CA": "" }, // accueil
]);

describe("table de correspondance des slugs", () => {
  it("indexe chaque slug vers son pendant dans l'autre langue", () => {
    expect(alt.fr.souverainete).toBe("sovereignty");
    expect(alt.en.sovereignty).toBe("souverainete");
    expect(alt.fr["mentions-legales"]).toBeNull();
  });
});

describe("sélecteur de langue : le slug traduit de la page courante", () => {
  it("souverainete devient sovereignty (et inversement), sans 404", () => {
    expect(alternatePath(alt, "fr", "/souverainete")).toBe("/sovereignty");
    expect(alternatePath(alt, "en", "/sovereignty")).toBe("/souverainete");
    expect(alternatePath(alt, "fr", "/souverainete/loi-25")).toBe(
      "/sovereignty/law-25",
    );
  });

  it("garde le même chemin pour un slug identique, une route de l'app ou l'accueil", () => {
    expect(alternatePath(alt, "fr", "/opsys-ai")).toBe("/opsys-ai");
    expect(alternatePath(alt, "fr", "/contact")).toBe("/contact");
    expect(alternatePath(alt, "en", "/")).toBe("/");
    expect(alternatePath(alt, "fr", "/compte/cles")).toBe("/compte/cles");
  });

  it("renvoie à l'accueil quand la page n'existe pas dans l'autre langue", () => {
    expect(alternatePath(alt, "fr", "/mentions-legales")).toBe("/");
  });

  it("tolère une barre finale", () => {
    expect(alternatePath(alt, "fr", "/souverainete/")).toBe("/sovereignty");
  });
});

describe("liens de navigation lus dans Directus", () => {
  it("un lien écrit avec le slug de l'autre langue est corrigé", () => {
    expect(resolveHrefForLang(alt, "en", "/en/souverainete/")).toBe(
      "/en/sovereignty",
    );
    expect(resolveHrefForLang(alt, "fr", "/sovereignty/")).toBe(
      "/souverainete",
    );
    expect(resolveHrefForLang(alt, "fr", "/en/sovereignty/")).toBe(
      "/souverainete",
    );
  });

  it("garde un lien déjà correct, une ancre et une chaîne de requête", () => {
    expect(resolveHrefForLang(alt, "en", "/en/sovereignty")).toBe(
      "/en/sovereignty",
    );
    expect(resolveHrefForLang(alt, "en", "/en/souverainete/#loi")).toBe(
      "/en/sovereignty#loi",
    );
    expect(resolveHrefForLang(alt, "fr", "/contact/?sujet=demonstration")).toBe(
      "/contact?sujet=demonstration",
    );
  });

  it("n'altère ni un lien externe ni un lien inconnu", () => {
    expect(resolveHrefForLang(alt, "en", "https://exemple.org/x")).toBe(
      "https://exemple.org/x",
    );
    expect(resolveHrefForLang(alt, "en", "/en/inconnu/")).toBe("/en/inconnu");
    expect(resolveHrefForLang(alt, "en", "/en/")).toBe("/en");
    expect(resolveHrefForLang(alt, "fr", "/")).toBe("/");
  });
});

describe("table de correspondance : slugs hostiles saisis dans Directus", () => {
  it("un slug qui n'est pas propre ne devient jamais une cible de lien (aucune URL //hôte)", () => {
    const hostile = buildAlternates([
      { "fr-CA": "propre", "en-CA": "/evil.com" },
      { "fr-CA": "autre", "en-CA": "//evil.com" },
    ]);
    for (const path of ["/propre", "/autre"]) {
      const target = alternatePath(hostile, "fr", path);
      expect(target.startsWith("//"), target).toBe(false);
      expect(target).not.toContain("evil.com");
    }
  });
});
