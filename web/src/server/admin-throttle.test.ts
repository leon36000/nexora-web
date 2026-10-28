import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFailureLimiter } from "./admin-throttle";

describe("createFailureLimiter", () => {
  it("bloque une adresse après N échecs dans la fenêtre, puis la libère", () => {
    let now = 1_000;
    const limiter = createFailureLimiter({
      max: 3,
      windowMs: 60_000,
      now: () => now,
    });
    for (let i = 0; i < 3; i++) {
      expect(limiter.blocked("1.2.3.4")).toBe(false);
      limiter.fail("1.2.3.4");
    }
    expect(limiter.blocked("1.2.3.4")).toBe(true);
    expect(limiter.blocked("5.6.7.8")).toBe(false);
    now += 60_001;
    expect(limiter.blocked("1.2.3.4")).toBe(false);
  });
  it("borne sa mémoire (adresses les plus anciennes oubliées)", () => {
    const limiter = createFailureLimiter({
      max: 1,
      windowMs: 60_000,
      maxKeys: 50,
    });
    for (let i = 0; i < 500; i++) limiter.fail(`10.0.${i >> 8}.${i & 255}`);
    expect(limiter.size()).toBeLessThanOrEqual(50);
  });
});

describe("proxy : échecs répétés sur l'API d'administration", () => {
  const TOKEN = "t".repeat(40);
  beforeEach(() => {
    vi.stubEnv("NEXORA_APP_ADMIN_TOKEN", TOKEN);
    vi.resetModules();
  });
  afterEach(() => vi.unstubAllEnvs());

  const call = (
    proxy: (r: NextRequest) => Promise<Response>,
    path: string,
    token: string | null,
    ip = "203.0.113.9",
  ) =>
    proxy(
      new NextRequest(`http://localhost:3500${path}`, {
        method: "POST",
        headers: {
          "x-forwarded-for": ip,
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
      }),
    );

  it("après 10 jetons faux, la même adresse reçoit 429 (même avec un nouveau mauvais jeton) ; le bon jeton passe toujours ; une autre adresse n'est pas touchée", async () => {
    const { proxy } = await import("@/proxy");
    for (let i = 0; i < 10; i++) {
      const res = await call(
        proxy,
        "/api/admin/vault",
        `faux-${i}`.padEnd(40, "x"),
      );
      expect(res.status).not.toBe(429);
    }
    const blocked = await call(
      proxy,
      "/api/admin/vault",
      "encore-faux".padEnd(40, "x"),
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    expect(
      (await call(proxy, "/api/admin/catalog/providers", null)).status,
    ).toBe(429);
    expect((await call(proxy, "/api/revalidate", "x".repeat(40))).status).toBe(
      429,
    );
    const good = await call(proxy, "/api/admin/vault", TOKEN);
    expect(good.status).not.toBe(429);
    const other = await call(
      proxy,
      "/api/admin/vault",
      "faux".padEnd(40, "y"),
      "198.51.100.1",
    );
    expect(other.status).not.toBe(429);
  });

  it("ne touche pas aux autres routes de l'API", async () => {
    const { proxy } = await import("@/proxy");
    for (let i = 0; i < 12; i++)
      await call(
        proxy,
        "/api/admin/vault",
        `faux-${i}`.padEnd(40, "x"),
        "192.0.2.77",
      );
    expect(
      (await call(proxy, "/api/health", null, "192.0.2.77")).status,
    ).not.toBe(429);
  });
});
