import type { VpsAppPort } from "@nexora/db";
import { describe, expect, it } from "vitest";
import { buildFirewallPlan, diffFirewallRules } from "./firewall.ts";

const port = (over: Partial<VpsAppPort>): VpsAppPort => ({
  port: 3001,
  proto: "tcp",
  exposure: "tunnel",
  labelFr: "Interface",
  labelEn: "Interface",
  ...over,
});

describe("pare-feu Proxmox d'une VM", () => {
  it("bloque tout en entrée sauf SSH, ferme le port 25 sortant et active le filtrage d'adresse", () => {
    const plan = buildFirewallPlan([]);
    expect(plan.options).toMatchObject({
      enable: 1,
      policy_in: "DROP",
      policy_out: "ACCEPT",
      ipfilter: 1,
      macfilter: 1,
      dhcp: 0,
    });
    const ins = plan.rules.filter((r) => r.type === "in");
    expect(ins.map((r) => `${r.proto}/${r.dport ?? "-"}`)).toEqual([
      "tcp/22",
      "icmp/-",
    ]);
    const out25 = plan.rules.find((r) => r.type === "out");
    expect(out25).toMatchObject({ action: "DROP", proto: "tcp", dport: "25" });
  });

  it("n'ouvre que les ports d'application déclarés publics (les autres passent par le tunnel SSH)", () => {
    const plan = buildFirewallPlan([
      port({ port: 3001, exposure: "tunnel" }),
      port({ port: 8443, exposure: "public" }),
      port({ port: 5353, proto: "udp", exposure: "public" }),
    ]);
    const ports = plan.rules
      .filter((r) => r.type === "in" && r.dport)
      .map((r) => `${r.proto}/${r.dport}`);
    expect(ports).toEqual(["tcp/22", "tcp/8443", "udp/5353"]);
  });

  it("refuse un port d'application qui rouvrirait le port 25 ou sortirait de 1 à 65535", () => {
    expect(() =>
      buildFirewallPlan([port({ port: 22, exposure: "public" })]),
    ).toThrow();
    expect(() =>
      buildFirewallPlan([port({ port: 0, exposure: "public" })]),
    ).toThrow();
    expect(() =>
      buildFirewallPlan([port({ port: 70000, exposure: "public" })]),
    ).toThrow();
  });

  it("marque chaque règle (`nexora:`) pour pouvoir la retrouver et rejouer l'application", () => {
    const plan = buildFirewallPlan([port({ port: 8443, exposure: "public" })]);
    for (const r of plan.rules) expect(String(r.comment)).toMatch(/^nexora:/);
  });

  it("calcule l'écart avec l'existant : ajoute le manquant, retire nos règles périmées, ne touche rien d'autre", () => {
    const plan = buildFirewallPlan([]);
    const existing = [
      {
        pos: 0,
        type: "in",
        action: "ACCEPT",
        proto: "tcp",
        dport: "22",
        comment: "nexora:ssh",
      },
      {
        pos: 1,
        type: "in",
        action: "ACCEPT",
        proto: "tcp",
        dport: "9999",
        comment: "nexora:app-9999/tcp",
      },
      {
        pos: 2,
        type: "in",
        action: "ACCEPT",
        proto: "tcp",
        dport: "80",
        comment: "ajout manuel de l'opérateur",
      },
    ];
    const diff = diffFirewallRules(plan.rules, existing);
    expect(diff.toRemove).toEqual([1]);
    expect(diff.toAdd.map((r) => r.comment)).toEqual([
      "nexora:icmp",
      "nexora:smtp-out",
    ]);
  });

  it("rejouer un plan déjà appliqué ne change rien", () => {
    const plan = buildFirewallPlan([]);
    const existing = plan.rules.map((r, pos) => ({ pos, ...r }));
    expect(diffFirewallRules(plan.rules, existing)).toEqual({
      toAdd: [],
      toRemove: [],
    });
  });
});
