import { describe, expect, it } from "vitest";
import { clientKey, createRateLimiter } from "./rate-limit";

describe("limitation de débit", () => {
  it("autorise `max` appels par fenêtre, puis refuse avec le délai avant le prochain essai", () => {
    let now = 1_000_000;
    const rl = createRateLimiter({ windowMs: 60_000, max: 3, now: () => now });
    expect(rl.hit("a").allowed).toBe(true);
    expect(rl.hit("a").allowed).toBe(true);
    expect(rl.hit("a").allowed).toBe(true);
    const refused = rl.hit("a");
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
    expect(refused.retryAfterSeconds).toBeLessThanOrEqual(60);
    now += 61_000;
    expect(rl.hit("a").allowed).toBe(true);
  });

  it("compte chaque clé séparément", () => {
    const rl = createRateLimiter({ windowMs: 60_000, max: 1 });
    expect(rl.hit("a").allowed).toBe(true);
    expect(rl.hit("b").allowed).toBe(true);
    expect(rl.hit("a").allowed).toBe(false);
  });

  it("un refus ne prolonge pas la fenêtre (pas de blocage éternel)", () => {
    let now = 0;
    const rl = createRateLimiter({ windowMs: 10_000, max: 1, now: () => now });
    rl.hit("a");
    for (let i = 0; i < 50; i++) {
      now += 100;
      rl.hit("a");
    }
    now += 6_000; // 11 s après le premier appel accepté
    expect(rl.hit("a").allowed).toBe(true);
  });

  it("borne sa mémoire : les clés trop nombreuses sont élaguées", () => {
    const rl = createRateLimiter({ windowMs: 60_000, max: 5, maxKeys: 100 });
    for (let i = 0; i < 1_000; i++) rl.hit(`k${i}`);
    expect(rl.size()).toBeLessThanOrEqual(100);
  });
});

describe("clé du client", () => {
  const req = (h: Record<string, string>) =>
    new Request("http://x/", { headers: h });
  it("prend la première adresse de X-Forwarded-For, la hache, et ne la renvoie jamais en clair", () => {
    const k = clientKey(req({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }));
    expect(k).toMatch(/^[0-9a-f]{16}$/);
    expect(k).toBe(clientKey(req({ "x-forwarded-for": "203.0.113.9" })));
    expect(k).not.toBe(clientKey(req({ "x-forwarded-for": "203.0.113.10" })));
    expect(k).not.toContain("203");
  });
  it("sans en-tête, tous les appels partagent une clé « inconnue » (fermé, pas ouvert)", () => {
    expect(clientKey(req({}))).toBe(clientKey(req({})));
  });
});
