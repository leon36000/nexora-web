import { describe, expect, it } from "vitest";
import { classifyAddress as reference } from "../../../packages/net/src/index.ts";
import {
  type AddressPolicy,
  checkDestination,
  checkUrlSyntax,
  classifyAddress,
} from "./address.ts";

const policy: AddressPolicy = {
  allowedPorts: [80, 443, 8080, 8443],
  allowLoopback: false,
};
const resolver = (map: Record<string, string[]>) => async (host: string) => {
  const found = map[host];
  if (!found) throw new Error("ENOTFOUND");
  return found;
};

describe("classement des adresses", () => {
  const samples = [
    "93.184.216.34",
    "8.8.8.8",
    "1.1.1.1",
    "127.0.0.1",
    "127.255.255.254",
    "10.0.0.5",
    "172.16.0.1",
    "172.31.255.255",
    "172.32.0.1",
    "192.168.1.1",
    "100.64.0.1",
    "169.254.169.254",
    "169.254.0.1",
    "0.0.0.0",
    "0.1.2.3",
    "192.0.2.10",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "240.0.0.1",
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "2001:db8::1",
    "2606:4700:4700::1111",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:10.0.0.1",
    "::ffff:a9fe:a9fe",
    "::ffff:8.8.8.8",
    "64:ff9b::7f00:1",
    "2002:7f00:1::",
    "not-an-ip",
    "",
  ];
  for (const sample of samples)
    it(`même verdict que le garde du site pour ${JSON.stringify(sample)}`, () => {
      expect(classifyAddress(sample)).toBe(reference(sample));
    });

  it("refuse ce qui n'est pas une adresse (fermé par défaut)", () => {
    expect(classifyAddress("exemple.ca")).toBe("reserved");
  });
});

describe("syntaxe d'une adresse web", () => {
  const ok = (raw: string) => checkUrlSyntax(raw, policy);
  it("accepte http et https sur un port permis", () => {
    expect(ok("https://exemple.org/").ok).toBe(true);
    expect(ok("http://exemple.org:8080/x?y=1").ok).toBe(true);
  });
  it("refuse les autres schémas", () => {
    for (const raw of [
      "file:///etc/passwd",
      "ftp://exemple.org/",
      "chrome://settings",
      "javascript:alert(1)",
      "view-source:https://exemple.org/",
      "gopher://exemple.org/",
    ])
      expect(ok(raw)).toMatchObject({ ok: false });
  });
  it("refuse les identifiants dans l'adresse", () => {
    expect(ok("https://user:pw@exemple.org/")).toMatchObject({ ok: false });
    expect(ok("https://user@exemple.org/")).toMatchObject({ ok: false });
  });
  it("refuse les ports hors liste", () => {
    expect(ok("https://exemple.org:22/")).toMatchObject({ ok: false });
    expect(ok("http://exemple.org:5432/")).toMatchObject({ ok: false });
  });
  it("refuse les noms internes, sans domaine ou de métadonnées", () => {
    for (const raw of [
      "http://localhost/",
      "http://app/",
      "http://db.internal/",
      "http://x.local/",
      "http://metadata.google.internal/",
      "http://passerelle.lan/",
      "http://litellm/",
    ])
      expect(ok(raw)).toMatchObject({ ok: false });
  });
  it("refuse les adresses littérales non publiques, quelle que soit leur écriture", () => {
    for (const raw of [
      "http://127.0.0.1/",
      "http://2130706433/",
      "http://0x7f.1/",
      "http://017700000001/",
      "http://[::1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://10.0.0.1/",
      "http://169.254.169.254/latest/meta-data",
      "http://[fe80::1]/",
      "http://0.0.0.0/",
    ])
      expect(ok(raw)).toMatchObject({ ok: false });
  });
  it("accepte une adresse littérale publique", () => {
    expect(ok("http://93.184.216.34/").ok).toBe(true);
  });
  it("n'admet la boucle locale que si la politique d'essai le dit", () => {
    const test: AddressPolicy = { ...policy, allowLoopback: true };
    expect(checkUrlSyntax("http://127.0.0.1:8080/", test).ok).toBe(true);
    expect(checkUrlSyntax("http://169.254.169.254/", test).ok).toBe(false);
    expect(checkUrlSyntax("http://10.0.0.1/", test).ok).toBe(false);
  });
});

describe("destination (nom résolu puis classé)", () => {
  it("accepte un nom qui ne résout que vers des adresses publiques", async () => {
    const r = await checkDestination(
      "exemple.org",
      443,
      policy,
      resolver({ "exemple.org": ["93.184.216.34", "2606:4700:4700::1111"] }),
    );
    expect(r).toEqual({
      ok: true,
      addresses: ["93.184.216.34", "2606:4700:4700::1111"],
    });
  });
  it("refuse dès qu'UNE adresse résolue n'est pas publique (rebond DNS partiel)", async () => {
    const r = await checkDestination(
      "piege.example",
      443,
      policy,
      resolver({ "piege.example": ["93.184.216.34", "10.0.0.7"] }),
    );
    expect(r.ok).toBe(false);
  });
  it("refuse un nom qui résout vers la boucle locale, le privé, le lien local et les métadonnées", async () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "192.168.0.9",
      "169.254.169.254",
      "::1",
      "fd00::1",
      "::ffff:10.0.0.1",
    ]) {
      const r = await checkDestination(
        "piege.example",
        80,
        policy,
        resolver({ "piege.example": [address] }),
      );
      expect(r.ok, address).toBe(false);
    }
  });
  it("refuse un port hors liste avant même de résoudre", async () => {
    let calls = 0;
    const r = await checkDestination("exemple.org", 25, policy, async () => {
      calls += 1;
      return ["93.184.216.34"];
    });
    expect(r.ok).toBe(false);
    expect(calls).toBe(0);
  });
  it("refuse un nom introuvable ou sans adresse", async () => {
    expect(
      (await checkDestination("rien.example", 443, policy, resolver({}))).ok,
    ).toBe(false);
    expect(
      (
        await checkDestination(
          "vide.example",
          443,
          policy,
          resolver({ "vide.example": [] }),
        )
      ).ok,
    ).toBe(false);
  });
  it("la politique d'essai admet la boucle locale mais jamais le lien local", async () => {
    const test: AddressPolicy = { ...policy, allowLoopback: true };
    expect(
      (await checkDestination("127.0.0.1", 8080, test, resolver({}))).ok,
    ).toBe(true);
    expect(
      (
        await checkDestination(
          "a.example",
          80,
          test,
          resolver({ "a.example": ["169.254.169.254"] }),
        )
      ).ok,
    ).toBe(false);
  });
  it("le motif de refus ne contient pas l'adresse résolue", async () => {
    const r = await checkDestination(
      "piege.example",
      80,
      policy,
      resolver({ "piege.example": ["10.9.8.7"] }),
    );
    expect(JSON.stringify(r)).not.toContain("10.9.8.7");
  });
});

describe("noms de domaine ordinaires", () => {
  it("un domaine qui ressemble à de l'hexadécimal n'est pas pris pour une adresse", () => {
    for (const raw of [
      "https://1a.ca/",
      "https://3d.de/",
      "https://2b.fr/",
      "https://abc.example/",
    ])
      expect(checkUrlSyntax(raw, policy).ok, raw).toBe(true);
  });
});
