import { describe, expect, it } from "vitest";
import { parseServerAddress, suggestServerCode } from "./connect.ts";

describe("adresse saisie : hôte[:port]", () => {
  it.each([
    ["pve.exemple.ca", { host: "pve.exemple.ca", port: 8006 }],
    ["PVE.Exemple.CA:8443", { host: "pve.exemple.ca", port: 8443 }],
    ["192.168.1.10", { host: "192.168.1.10", port: 8006 }],
    ["192.168.1.10:8006", { host: "192.168.1.10", port: 8006 }],
    ["https://pve.exemple.ca:8006/", { host: "pve.exemple.ca", port: 8006 }],
    ["  pve1  ", { host: "pve1", port: 8006 }],
  ])("accepte %s", (raw, expected) => {
    expect(parseServerAddress(raw)).toEqual(expected);
  });

  it("garde le schéma http:// pour la boucle locale seulement (simulateur)", () => {
    expect(parseServerAddress("http://127.0.0.1:9001")).toEqual({
      host: "http://127.0.0.1",
      port: 9001,
    });
    expect(parseServerAddress("http://pve.exemple.ca")).toBeNull();
  });

  it.each([
    "",
    "pve exemple",
    "pve.exemple.ca:abc",
    "pve.exemple.ca:0",
    "pve.exemple.ca:70000",
    "pve.exemple.ca/chemin",
    "user@pve.exemple.ca",
    "pve;rm",
    "ftp://pve",
  ])("refuse %j", (raw) => {
    expect(parseServerAddress(raw)).toBeNull();
  });
});

describe("identifiant proposé d'après l'adresse", () => {
  it.each([
    ["pve.exemple.ca", "pve-exemple-ca"],
    ["PVE1.Exemple.CA", "pve1-exemple-ca"],
    ["192.168.1.10", "pve-192-168-1-10"],
    ["http://127.0.0.1", "pve-127-0-0-1"],
    ["https://pve.exemple.ca", "pve-exemple-ca"],
  ])("%s → %s", (host, code) => {
    expect(suggestServerCode(host)).toBe(code);
  });

  it("donne toujours un identifiant valide (3 à 40 caractères, minuscules, chiffres, tirets)", () => {
    for (const host of [
      "a",
      "x".repeat(200),
      "un-nom-de-serveur-tres-tres-long.exemple-de-domaine.ca",
      "1",
      "--",
      "é",
    ])
      expect(suggestServerCode(host), host).toMatch(
        /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/,
      );
  });
});
