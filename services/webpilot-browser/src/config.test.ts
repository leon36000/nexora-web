import { describe, expect, it } from "vitest";
import { configFromEnv } from "./config.ts";

const SECRET = "s".repeat(40);

describe("configuration du service", () => {
  it("refuse de démarrer sans secret partagé assez long", () => {
    expect(() => configFromEnv({})).toThrow(/32/);
    expect(() => configFromEnv({ WEBPILOT_BROWSER_SECRET: "court" })).toThrow();
  });

  it("applique des valeurs prudentes par défaut", () => {
    const c = configFromEnv({ WEBPILOT_BROWSER_SECRET: SECRET });
    expect(c.policy.allowedPorts).toEqual([80, 443, 8080, 8443]);
    expect(c.policy.allowLoopback).toBe(false);
    expect(c.chromiumSandbox).toBe(false);
    expect(c.locale).toBe("fr-CA");
    expect(c.timezone).toBe("America/Toronto");
  });

  it("n'offre aucun réglage d'environnement pour admettre la boucle locale ou le réseau interne", () => {
    const c = configFromEnv({
      WEBPILOT_BROWSER_SECRET: SECRET,
      BROWSER_ALLOW_LOOPBACK: "1",
      ALLOW_LOOPBACK: "true",
      NEXORA_OUTBOUND_ALLOW: "10.0.0.0/8",
      NODE_ENV: "development",
    });
    expect(c.policy.allowLoopback).toBe(false);
  });

  it("ignore des ports invalides et retombe sur 80 et 443", () => {
    const c = configFromEnv({
      WEBPILOT_BROWSER_SECRET: SECRET,
      BROWSER_ALLOWED_PORTS: "abc,0,99999",
    });
    expect(c.policy.allowedPorts).toEqual([80, 443]);
  });
});
