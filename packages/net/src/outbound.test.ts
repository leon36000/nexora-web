import { describe, expect, it } from "vitest";
import {
  checkOutboundUrl,
  classifyAddress,
  isNonPublicAddress,
  policyFromEnv,
} from "./index";

const resolveTo =
  (...ips: string[]) =>
  async () =>
    ips;

describe("classifyAddress", () => {
  it.each([
    ["8.8.8.8", "public"],
    ["93.184.216.34", "public"],
    ["2606:4700::1111", "public"],
    ["127.0.0.1", "loopback"],
    ["127.1.2.3", "loopback"],
    ["::1", "loopback"],
    ["10.0.0.5", "private"],
    ["172.16.0.1", "private"],
    ["172.31.255.255", "private"],
    ["172.32.0.1", "public"],
    ["192.168.1.1", "private"],
    ["100.64.0.1", "private"],
    ["fd12:3456::1", "private"],
    ["fc00::1", "private"],
    ["169.254.169.254", "link-local"],
    ["169.254.0.1", "link-local"],
    ["fe80::1", "link-local"],
    ["febf::1", "link-local"],
    ["0.0.0.0", "reserved"],
    ["::", "reserved"],
    ["224.0.0.1", "reserved"],
    ["255.255.255.255", "reserved"],
    ["192.0.0.1", "reserved"],
    ["198.18.0.1", "reserved"],
    ["240.0.0.1", "reserved"],
  ])("%s est %s", (ip, kind) => {
    expect(classifyAddress(ip)).toBe(kind);
  });

  it("IPv4 inscrite dans IPv6 (forme décimale ET hexadécimale) suit l'IPv4", () => {
    expect(classifyAddress("::ffff:127.0.0.1")).toBe("loopback");
    expect(classifyAddress("::ffff:7f00:1")).toBe("loopback");
    expect(classifyAddress("::ffff:a9fe:a9fe")).toBe("link-local");
    expect(classifyAddress("::ffff:a00:1")).toBe("private");
    expect(classifyAddress("::ffff:8.8.8.8")).toBe("public");
    expect(isNonPublicAddress("::ffff:7f00:1")).toBe(true);
  });

  it.each([
    ["2002:a9fe:a9fe::1", "reserved"], // 6to4 de 169.254.169.254
    ["2002:7f00:1::1", "reserved"], // 6to4 de 127.0.0.1
    ["2002:808:808::1", "reserved"], // 6to4, refusé en bloc
    ["64:ff9b::a9fe:a9fe", "reserved"], // NAT64 de 169.254.169.254
    ["64:ff9b:1::a9fe:a9fe", "reserved"], // NAT64 local
    ["::169.254.169.254", "reserved"], // IPv4-compatible
    ["::a9fe:a9fe", "reserved"],
    ["::7f00:1", "reserved"],
    ["::808:808", "reserved"],
    ["fec0::1", "reserved"], // site-local obsolète
    ["febf::1", "link-local"],
    ["::1", "loopback"],
  ])("IPv6 détourné %s est %s", (ip, kind) => {
    expect(classifyAddress(ip)).toBe(kind);
  });

  it("une chaîne qui n'est pas une adresse est refusée", () => {
    expect(isNonPublicAddress("exemple.ca")).toBe(true);
    expect(classifyAddress("999.1.1.1")).toBe("reserved");
  });
});

describe("checkOutboundUrl (production : réseau interne refusé par défaut)", () => {
  const prod = policyFromEnv({ NODE_ENV: "production" });
  const dev = policyFromEnv({ NODE_ENV: "development" });

  it("accepte une adresse publique en https et en http", async () => {
    const r = await checkOutboundUrl("https://api.exemple.ca/v1", prod, {
      resolve: resolveTo("93.184.216.34"),
    });
    expect(r.ok).toBe(true);
  });

  it("refuse les schémas autres que http(s) et les identifiants dans l'URL", async () => {
    for (const u of [
      "file:///etc/passwd",
      "gopher://x/",
      "ftp://x/",
      "https://u:p@api.exemple.ca/",
      "pas une url",
    ]) {
      const r = await checkOutboundUrl(u, prod, {
        resolve: resolveTo("93.184.216.34"),
      });
      expect(r.ok, u).toBe(false);
    }
  });

  it("refuse boucle locale, réseau privé, métadonnées du nuage et formes détournées", async () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "192.168.0.10",
      "169.254.169.254",
      "::1",
      "fd00::1",
      "::ffff:7f00:1",
    ]) {
      const r = await checkOutboundUrl("http://qui.exemple.ca/", prod, {
        resolve: resolveTo(ip),
      });
      expect(r.ok, ip).toBe(false);
    }
    // adresse littérale dans l'URL
    for (const u of [
      "http://127.0.0.1:4400/",
      "http://[::1]/",
      "http://[::ffff:7f00:1]/",
      "http://169.254.169.254/latest/meta-data/",
      "http://2130706433/", // 127.0.0.1 en décimal
      "http://0x7f.1/",
    ]) {
      const r = await checkOutboundUrl(u, prod);
      expect(r.ok, u).toBe(false);
    }
  });

  it("refuse si UNE SEULE des adresses résolues est interne (rebond DNS partiel)", async () => {
    const r = await checkOutboundUrl("https://mixte.exemple.ca/", prod, {
      resolve: resolveTo("93.184.216.34", "10.0.0.7"),
    });
    expect(r.ok).toBe(false);
  });

  it("refuse un hôte qui ne se résout pas", async () => {
    const r = await checkOutboundUrl("https://introuvable.exemple.ca/", prod, {
      resolve: async () => [],
    });
    expect(r.ok).toBe(false);
  });

  it("la liste d'exceptions de l'opérateur ouvre le réseau interne, jamais link-local ni métadonnées", async () => {
    const policy = policyFromEnv({
      NODE_ENV: "production",
      NEXORA_OUTBOUND_ALLOW: "ollama.interne.ca, 10.20.0.0/24",
    });
    expect(
      (
        await checkOutboundUrl("http://ollama.interne.ca:11434/", policy, {
          resolve: resolveTo("10.9.9.9"),
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await checkOutboundUrl("http://10.20.0.5:8000/", policy, {
          resolve: resolveTo("10.20.0.5"),
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await checkOutboundUrl("http://10.30.0.5:8000/", policy, {
          resolve: resolveTo("10.30.0.5"),
        })
      ).ok,
    ).toBe(false);
    // un hôte listé qui se résout vers les métadonnées reste refusé
    expect(
      (
        await checkOutboundUrl("http://ollama.interne.ca/", policy, {
          resolve: resolveTo("169.254.169.254"),
        })
      ).ok,
    ).toBe(false);
  });

  it("en développement, boucle locale et réseau privé sont admis, jamais link-local", async () => {
    expect(
      (
        await checkOutboundUrl("http://127.0.0.1:4400/", dev, {
          resolve: resolveTo("127.0.0.1"),
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await checkOutboundUrl("http://169.254.169.254/", dev, {
          resolve: resolveTo("169.254.169.254"),
        })
      ).ok,
    ).toBe(false);
  });

  it("le motif de refus ne contient ni l'adresse résolue ni le mot de passe de l'URL", async () => {
    const r = await checkOutboundUrl("https://u:secret@x.exemple.ca/", prod, {
      resolve: resolveTo("93.184.216.34"),
    });
    expect(JSON.stringify(r)).not.toContain("secret");
  });

  it("literalOnly : un nom passe sans résolution, une adresse littérale interne est refusée", async () => {
    const prod = policyFromEnv({ NODE_ENV: "production" });
    expect(
      (
        await checkOutboundUrl("http://litellm-amont.interne/v1", prod, {
          literalOnly: true,
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await checkOutboundUrl("http://169.254.169.254/v1", prod, {
          literalOnly: true,
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await checkOutboundUrl("http://10.0.0.4/v1", prod, {
          literalOnly: true,
        })
      ).ok,
    ).toBe(false);
  });

  it("literalOnly : refuse les noms qui désignent le lien local ou les métadonnées du nuage, même en développement", async () => {
    const prod = policyFromEnv({ NODE_ENV: "production" });
    const dev = policyFromEnv({ NODE_ENV: "development" });
    const interdits = [
      "metadata.google.internal",
      "METADATA.google.internal.",
      "metadata",
      "metadata.tencentyun.com",
      "instance-data",
      "vm.metadata.azure.example",
      "imprimante.local",
    ];
    for (const policy of [prod, dev]) {
      for (const host of interdits) {
        const r = await checkOutboundUrl(`http://${host}/v1`, policy, {
          literalOnly: true,
        });
        expect(r.ok, host).toBe(false);
      }
    }
  });

  it("literalOnly : localhost et *.localhost sont de la boucle locale (refusés en production, admis comme 127.0.0.1 en développement)", async () => {
    const prod = policyFromEnv({ NODE_ENV: "production" });
    const dev = policyFromEnv({ NODE_ENV: "development" });
    for (const host of ["localhost", "localhost.", "api.localhost"]) {
      expect(
        (
          await checkOutboundUrl(`http://${host}:4000/v1`, prod, {
            literalOnly: true,
          })
        ).ok,
        host,
      ).toBe(false);
      expect(
        (
          await checkOutboundUrl(`http://${host}:4000/v1`, dev, {
            literalOnly: true,
          })
        ).ok,
        host,
      ).toBe(true);
    }
    // Un hôte déclaré par l'opérateur reste admis.
    const allowed = policyFromEnv({
      NODE_ENV: "production",
      NEXORA_OUTBOUND_ALLOW: "localhost",
    });
    expect(
      (
        await checkOutboundUrl("http://localhost:4000/v1", allowed, {
          literalOnly: true,
        })
      ).ok,
    ).toBe(true);
    // Les noms documentés d'une passerelle sur l'hôte ou le réseau Docker continuent de passer.
    for (const ok of [
      "host.docker.internal",
      "passerelle.internal",
      "litellm-amont.interne",
    ])
      expect(
        (
          await checkOutboundUrl(`http://${ok}:4000/v1`, prod, {
            literalOnly: true,
          })
        ).ok,
        ok,
      ).toBe(true);
    // Un nom ordinaire continue de passer.
    expect(
      (
        await checkOutboundUrl("http://litellm:4000/v1", prod, {
          literalOnly: true,
        })
      ).ok,
    ).toBe(true);
  });
});
