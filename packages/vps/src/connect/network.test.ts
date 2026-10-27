import { describe, expect, it } from "vitest";
import { validateNetwork } from "./network.ts";

const base = {
  ranges: [{ from: "192.168.1.100", to: "192.168.1.150" }],
  prefix: 24,
  gateway: "192.168.1.1",
  dns: ["192.168.1.1", "1.1.1.1"],
  bridge: "vmbr0",
};
const ok = (over = {}, ctx = {}) =>
  validateNetwork({ ...base, ...over }, { nodeAddresses: [], ...ctx });

describe("validation du bloc d'adresses", () => {
  it("accepte un bloc cohérent", () => {
    expect(ok()).toEqual({ errors: [], warnings: [], usable: 51 });
  });

  it("compte les adresses réellement attribuables (passerelle et DNS exclus)", () => {
    const r = ok({ ranges: [{ from: "192.168.1.1", to: "192.168.1.10" }] });
    expect(r.usable).toBe(9); // .1 = passerelle et DNS
  });

  it("refuse une passerelle hors du réseau des adresses", () => {
    const r = ok({ gateway: "10.0.0.1" });
    expect(r.errors.join(" ")).toMatch(/passerelle/);
  });

  it("refuse une plage qui sort du réseau (préfixe /24)", () => {
    const r = ok({ ranges: [{ from: "192.168.1.200", to: "192.168.2.10" }] });
    expect(r.errors.join(" ")).toMatch(/hors du réseau|sort du réseau/);
  });

  it("refuse l'adresse du réseau et l'adresse de diffusion", () => {
    expect(
      ok({ ranges: [{ from: "192.168.1.0", to: "192.168.1.5" }] }).errors.join(
        " ",
      ),
    ).toMatch(/adresse du réseau/);
    expect(
      ok({
        ranges: [{ from: "192.168.1.250", to: "192.168.1.255" }],
      }).errors.join(" "),
    ).toMatch(/diffusion/);
  });

  it("refuse une plage qui contient l'adresse du serveur Proxmox lui-même", () => {
    const r = ok({}, { nodeAddresses: ["192.168.1.120"] });
    expect(r.errors.join(" ")).toMatch(/192\.168\.1\.120/);
  });

  it("refuse deux plages qui se chevauchent", () => {
    const r = ok({
      ranges: [
        { from: "192.168.1.100", to: "192.168.1.120" },
        { from: "192.168.1.110", to: "192.168.1.130" },
      ],
    });
    expect(r.errors.join(" ")).toMatch(/chevauch/);
  });

  it("refuse une adresse mal formée, un préfixe hors bornes, un pont invalide, un DNS manquant", () => {
    expect(
      ok({ ranges: [{ from: "192.168.1.999", to: "192.168.1.5" }] }).errors
        .length,
    ).toBeGreaterThan(0);
    expect(ok({ prefix: 31 }).errors.length).toBeGreaterThan(0);
    expect(ok({ bridge: "vmbr0;rm" }).errors.length).toBeGreaterThan(0);
    expect(ok({ dns: [] }).errors.length).toBeGreaterThan(0);
  });

  it("avertit (sans refuser) quand le bloc n'est pas dans le réseau du pont du serveur", () => {
    const r = ok(
      {},
      { bridgeCidr: "10.0.0.5/24", nodeAddresses: ["10.0.0.5"] },
    );
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/VLAN|pont/);
  });

  it("avertit quand il y a moins de 5 adresses utilisables", () => {
    const r = ok({ ranges: [{ from: "192.168.1.100", to: "192.168.1.102" }] });
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/adresses utilisables/);
  });

  it("refuse un bloc sans aucune plage", () => {
    const r = validateNetwork({ ...base, ranges: [] }, { nodeAddresses: [] });
    expect(r.errors.join(" ")).toMatch(/au moins une plage/);
  });
});
