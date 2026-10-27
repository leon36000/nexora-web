import type { IpPool } from "@nexora/db";
import { describe, expect, it } from "vitest";
import {
  intToIp,
  ipToInt,
  pickFreeIp,
  poolCapacity,
  validatePool,
} from "./ips.ts";

const pool = (over: Partial<IpPool> = {}): IpPool => ({
  ranges: [{ from: "10.20.0.10", to: "10.20.0.13" }],
  prefix: 24,
  gateway: "10.20.0.1",
  dns: ["10.20.0.2"],
  bridge: "vmbr0",
  ...over,
});

describe("pool d'adresses IPv4", () => {
  it("convertit adresses et entiers sans perte", () => {
    expect(ipToInt("10.20.0.10")).toBe(169_082_890);
    expect(intToIp(ipToInt("192.168.255.254"))).toBe("192.168.255.254");
    expect(() => ipToInt("10.20.0.256")).toThrow();
    expect(() => ipToInt("10.20.0")).toThrow();
  });

  it("attribue la première adresse libre, dans l'ordre", () => {
    expect(pickFreeIp(pool(), new Set())).toBe("10.20.0.10");
    expect(pickFreeIp(pool(), new Set(["10.20.0.10", "10.20.0.12"]))).toBe(
      "10.20.0.11",
    );
  });

  it("renvoie null quand le pool est épuisé", () => {
    const used = new Set([
      "10.20.0.10",
      "10.20.0.11",
      "10.20.0.12",
      "10.20.0.13",
    ]);
    expect(pickFreeIp(pool(), used)).toBeNull();
  });

  it("n'attribue jamais la passerelle ni un serveur DNS", () => {
    const p = pool({ ranges: [{ from: "10.20.0.1", to: "10.20.0.3" }] });
    expect(pickFreeIp(p, new Set())).toBe("10.20.0.3");
    expect(poolCapacity(p)).toBe(1);
  });

  it("parcourt plusieurs plages", () => {
    const p = pool({
      ranges: [
        { from: "10.20.0.10", to: "10.20.0.10" },
        { from: "10.20.1.5", to: "10.20.1.6" },
      ],
    });
    expect(pickFreeIp(p, new Set(["10.20.0.10"]))).toBe("10.20.1.5");
    expect(poolCapacity(p)).toBe(3);
  });

  it("valide la configuration d'un pool", () => {
    expect(validatePool(pool())).toEqual([]);
    expect(validatePool(pool({ ranges: [] })).length).toBeGreaterThan(0);
    expect(
      validatePool(pool({ ranges: [{ from: "10.20.0.20", to: "10.20.0.10" }] }))
        .length,
    ).toBeGreaterThan(0);
    expect(validatePool(pool({ prefix: 33 })).length).toBeGreaterThan(0);
    expect(
      validatePool(pool({ gateway: "pas-une-ip" })).length,
    ).toBeGreaterThan(0);
    expect(validatePool(pool({ bridge: "vmbr0;rm" })).length).toBeGreaterThan(
      0,
    );
    expect(
      validatePool(
        pool({ ranges: [{ from: "10.0.0.0", to: "10.255.255.255" }] }),
      ).length,
    ).toBeGreaterThan(0);
  });
});
