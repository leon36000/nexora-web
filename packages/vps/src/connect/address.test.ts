import { describe, expect, it } from "vitest";
import { parseServerAddress } from "./connect.ts";

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
