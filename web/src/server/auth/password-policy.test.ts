import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  breachCheckEnabled,
  checkPasswordPolicy,
  createBreachChecker,
} from "./password-policy";

const sha1 = (p: string) =>
  createHash("sha1").update(p).digest("hex").toUpperCase();

describe("checkPasswordPolicy", () => {
  it("accepte une phrase de passe longue", () => {
    expect(checkPasswordPolicy("un-mot-de-passe-solide-42")).toBeNull();
    expect(checkPasswordPolicy("Cheval agrafe pile 7 lumière")).toBeNull();
  });
  it("refuse court, long, courant, suites, et informations personnelles", () => {
    expect(checkPasswordPolicy("Abc-12345")).toBe("too_short");
    expect(checkPasswordPolicy("a".repeat(129))).toBe("too_long");
    expect(checkPasswordPolicy("Motdepasse2026!")).toBe("common");
    expect(checkPasswordPolicy("mot-de-passe")).toBe("common");
    expect(checkPasswordPolicy("abcdefghijkl")).toBe("common");
    expect(checkPasswordPolicy("876543210987")).toBe("common");
    expect(
      checkPasswordPolicy("nathanstlouis94-2026!", {
        email: "nathanstlouis94@gmail.com",
      }),
    ).toBe("personal");
    expect(
      checkPasswordPolicy("Bonne-journée-Tremblay", {
        name: "Camille Tremblay",
      }),
    ).toBe("personal");
  });
});

describe("createBreachChecker (HIBP, k-anonymat)", () => {
  it("n'envoie que les 5 premiers caractères de l'empreinte SHA-1 et reconnaît le suffixe", async () => {
    const password = "Phrase-Fuite-Connue-1";
    const hash = sha1(password);
    const seen: string[] = [];
    const check = createBreachChecker({
      fetchImpl: (async (url: string | URL | Request) => {
        seen.push(String(url));
        return new Response(
          `${hash.slice(5)}:12\r\n0018A45C4D1DEF81644B54AB7F969B88D65:0`,
        );
      }) as typeof fetch,
    });
    expect(await check(password)).toBe(true);
    expect(seen).toEqual([
      `https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`,
    ]);
    expect(seen[0]).not.toContain(password);
    expect(seen[0]).not.toContain(hash.slice(5));
  });
  it("ignore les lignes de remplissage à zéro et les suffixes absents", async () => {
    const password = "Autre-Phrase-Longue-2";
    const hash = sha1(password);
    const check = createBreachChecker({
      fetchImpl: (async () =>
        new Response(`${hash.slice(5)}:0\nAAAA:5`)) as typeof fetch,
    });
    expect(await check(password)).toBe(false);
  });
  it("renvoie null (laisser passer) et journalise si le service est en panne ou lent", async () => {
    const logs: string[] = [];
    const down = createBreachChecker({
      fetchImpl: (async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch,
      log: (m) => logs.push(m),
    });
    expect(await down("Phrase-Quelconque-Longue-3")).toBeNull();
    const err = createBreachChecker({
      fetchImpl: (async () =>
        new Response("", { status: 503 })) as typeof fetch,
      log: (m) => logs.push(m),
    });
    expect(await err("Phrase-Quelconque-Longue-3")).toBeNull();
    expect(logs).toHaveLength(2);
  });
});

describe("breachCheckEnabled", () => {
  it("activée en production, coupée ailleurs, forçable", () => {
    expect(breachCheckEnabled({ NODE_ENV: "production" })).toBe(true);
    expect(breachCheckEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(
      breachCheckEnabled({
        NODE_ENV: "production",
        NEXORA_PASSWORD_BREACH_CHECK: "off",
      }),
    ).toBe(false);
    expect(
      breachCheckEnabled({
        NODE_ENV: "development",
        NEXORA_PASSWORD_BREACH_CHECK: "on",
      }),
    ).toBe(true);
  });
});
