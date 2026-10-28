import type { VpsAppPort } from "@nexora/db";
import { describe, expect, it } from "vitest";
import {
  buildFirewallPlan,
  diffFirewallRules,
  type EgressPool,
  PRIVATE_EGRESS_BLOCKS,
} from "./firewall.ts";

const POOL: EgressPool = {
  gateway: "10.20.0.1",
  dns: ["10.20.0.2", "1.1.1.1"],
};

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
    const plan = buildFirewallPlan([], POOL);
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
    const out25 = plan.rules.find((r) => r.type === "out" && r.dport === "25");
    expect(out25).toMatchObject({ action: "DROP", proto: "tcp", dport: "25" });
  });

  it("n'ouvre que les ports d'application déclarés publics (les autres passent par le tunnel SSH)", () => {
    const plan = buildFirewallPlan(
      [
        port({ port: 3001, exposure: "tunnel" }),
        port({ port: 8443, exposure: "public" }),
        port({ port: 5353, proto: "udp", exposure: "public" }),
      ],
      POOL,
    );
    const ports = plan.rules
      .filter((r) => r.type === "in" && r.dport)
      .map((r) => `${r.proto}/${r.dport}`);
    expect(ports).toEqual(["tcp/22", "tcp/8443", "udp/5353"]);
  });

  it("refuse un port d'application qui rouvrirait le port 25 ou sortirait de 1 à 65535", () => {
    expect(() =>
      buildFirewallPlan([port({ port: 22, exposure: "public" })], POOL),
    ).toThrow();
    expect(() =>
      buildFirewallPlan([port({ port: 0, exposure: "public" })], POOL),
    ).toThrow();
    expect(() =>
      buildFirewallPlan([port({ port: 70000, exposure: "public" })], POOL),
    ).toThrow();
  });

  it("marque chaque règle (`nexora:`) pour pouvoir la retrouver et rejouer l'application", () => {
    const plan = buildFirewallPlan(
      [port({ port: 8443, exposure: "public" })],
      POOL,
    );
    for (const r of plan.rules) expect(String(r.comment)).toMatch(/^nexora:/);
  });

  it("calcule l'écart avec l'existant : ajoute le manquant, retire nos règles périmées, ne touche rien d'autre", () => {
    const plan = buildFirewallPlan([], POOL);
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
      ...plan.rules.filter((r) => r.type === "out").map((r) => r.comment),
    ]);
  });

  it("rejouer un plan déjà appliqué ne change rien", () => {
    const plan = buildFirewallPlan([], POOL);
    const existing = plan.rules.map((r, pos) => ({ pos, ...r }));
    expect(diffFirewallRules(plan.rules, existing)).toEqual({
      toAdd: [],
      toRemove: [],
    });
  });

  describe("sortie : le réseau de l'opérateur et des autres VPS est fermé", () => {
    const outs = () =>
      buildFirewallPlan([], POOL).rules.filter((r) => r.type === "out");

    it("ferme les réseaux privés, le lien local et 100.64.0.0/10, en IPv4 et la plage ULA en IPv6", () => {
      const drops = outs().filter((r) => r.action === "DROP" && r.dest);
      expect(drops.map((r) => r.dest)).toEqual(
        expect.arrayContaining([
          "10.0.0.0/8",
          "172.16.0.0/12",
          "192.168.0.0/16",
          "169.254.0.0/16",
          "100.64.0.0/10",
          "fc00::/7",
        ]),
      );
      expect([...PRIVATE_EGRESS_BLOCKS]).toEqual(
        expect.arrayContaining(["10.0.0.0/8", "fc00::/7"]),
      );
      // Pas de protocole : la règle couvre TCP, UDP, ICMP et le reste.
      for (const d of drops) expect(d.proto).toBeUndefined();
    });

    it("laisse passer la passerelle (ICMP) et les résolveurs DNS du réservoir AVANT les fermetures", () => {
      const rules = outs();
      const firstDrop = rules.findIndex((r) => r.action === "DROP" && r.dest);
      const accepts = rules.filter((r) => r.action === "ACCEPT");
      expect(accepts.length).toBeGreaterThan(0);
      for (const a of accepts) expect(rules.indexOf(a)).toBeLessThan(firstDrop);
      expect(
        accepts.find((r) => r.dest === "10.20.0.1" && r.proto === "icmp"),
      ).toBeDefined();
      for (const ip of POOL.dns)
        for (const proto of ["udp", "tcp"])
          expect(
            accepts.find(
              (r) => r.dest === ip && r.proto === proto && r.dport === "53",
            ),
            `${ip}/${proto}`,
          ).toBeDefined();
      // Rien d'autre n'est ouvert vers la passerelle (pas de TCP/UDP quelconque).
      expect(
        accepts.filter((r) => r.dest === "10.20.0.1" && r.proto !== "icmp"),
      ).toEqual([]);
    });

    it("garde la fermeture du port 25 et marque chaque règle (`nexora:`), avec un commentaire unique", () => {
      const rules = outs();
      expect(rules.some((r) => r.dport === "25" && r.action === "DROP")).toBe(
        true,
      );
      const comments = rules.map((r) => String(r.comment));
      for (const c of comments) expect(c).toMatch(/^nexora:/);
      expect(new Set(comments).size).toBe(comments.length);
    });

    it("l'écart tient compte de la destination ; un plan déjà appliqué ne change rien", () => {
      const plan = buildFirewallPlan([], POOL);
      const existing = plan.rules.map((r, pos) => ({ pos, ...r }));
      expect(diffFirewallRules(plan.rules, existing)).toEqual({
        toAdd: [],
        toRemove: [],
      });
      // Même commentaire et même protocole, autre destination : c'est une autre règle.
      const moved = existing.map((r) =>
        r.dest === "10.0.0.0/8" ? { ...r, dest: "10.0.0.0/16" } : r,
      );
      const diff = diffFirewallRules(plan.rules, moved);
      expect(diff.toRemove.length).toBeGreaterThan(0);
      expect(diff.toAdd.some((r) => r.dest === "10.0.0.0/8")).toBe(true);
    });

    it("un VM provisionnée avant la fermeture (seulement smtp-out) reçoit toutes les règles de sortie, acceptations d'abord", () => {
      const plan = buildFirewallPlan([], POOL);
      const old = [
        ...plan.rules.filter((r) => r.type === "in"),
        plan.rules.find((r) => r.comment === "nexora:smtp-out"),
      ].map((r, pos) => ({ pos, ...r }));
      const diff = diffFirewallRules(plan.rules, old);
      const added = diff.toAdd.filter((r) => r.type === "out");
      const firstDrop = added.findIndex((r) => r.action === "DROP" && r.dest);
      for (const [i, r] of added.entries())
        if (r.action === "ACCEPT") expect(i).toBeLessThan(firstDrop);
      expect(added.length).toBe(outs().length);
    });

    it("si la passerelle ou le DNS du réservoir change, tout le bloc de sortie est reposé dans l'ordre (acceptation avant fermeture)", () => {
      const before = buildFirewallPlan([], POOL);
      const after = buildFirewallPlan([], {
        gateway: "10.20.0.254",
        dns: ["9.9.9.9"],
      });
      const existing = before.rules.map((r, pos) => ({ pos, ...r }));
      const diff = diffFirewallRules(after.rules, existing);
      const outPositions = existing
        .filter((r) => r.type === "out")
        .map((r) => r.pos);
      expect([...diff.toRemove].sort((a, b) => a - b)).toEqual(
        outPositions.sort((a, b) => a - b),
      );
      const added = diff.toAdd.filter((r) => r.type === "out");
      expect(added.map((r) => r.comment)).toEqual(
        after.rules.filter((r) => r.type === "out").map((r) => r.comment),
      );
    });
  });
});
