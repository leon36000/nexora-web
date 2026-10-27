import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config, proxy } from "./proxy";

const req = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost:3500${path}`, {
    headers: cookie ? { cookie } : {},
  });

afterEach(() => vi.unstubAllEnvs());

describe("proxy : langues (comportement existant)", () => {
  it("réécrit le français vers /fr, laisse /en, redirige /fr", () => {
    vi.stubEnv("SITE_ENV", "production");
    expect(
      proxy(req("/solutions")).headers.get("x-middleware-rewrite"),
    ).toContain("/fr/solutions");
    expect(
      proxy(req("/en/solutions")).headers.get("x-middleware-rewrite"),
    ).toBeNull();
    const redirect = proxy(req("/fr/solutions"));
    expect(redirect.status).toBe(308);
    expect(redirect.headers.get("location")).toContain("/solutions");
  });
});

describe("proxy : X-Robots-Tag hors production", () => {
  it("pose noindex, nofollow sur toute page quand SITE_ENV n'est pas « production »", () => {
    for (const value of [undefined, "staging", "development"]) {
      if (value === undefined) vi.stubEnv("SITE_ENV", "");
      else vi.stubEnv("SITE_ENV", value);
      for (const path of ["/", "/en", "/solutions", "/en/contact"])
        expect(proxy(req(path)).headers.get("x-robots-tag")).toBe(
          "noindex, nofollow",
        );
    }
  });
  it("aucun en-tête en production, sauf aperçu (Draft Mode)", () => {
    vi.stubEnv("SITE_ENV", "production");
    expect(proxy(req("/solutions")).headers.get("x-robots-tag")).toBeNull();
    expect(
      proxy(req("/solutions", "__prerender_bypass=1")).headers.get(
        "x-robots-tag",
      ),
    ).toContain("noindex");
  });
});

describe("proxy : matcher", () => {
  const re = new RegExp(
    `^${(config.matcher[0] as string).replace(/\(\?!/, "(?!")}$`,
  );
  it("ne traite ni l'API, ni la passerelle, ni les images /og, ni les fichiers", () => {
    for (const p of [
      "/api/health",
      "/v1/models",
      "/og/fr/opsys-ai",
      "/_next/x",
      "/robots.txt",
      "/sitemap.xml",
      "/llms.txt",
      `/${"a".repeat(32)}.txt`,
    ])
      expect(re.test(p), p).toBe(false);
    for (const p of [
      "/",
      "/en",
      "/solutions",
      "/modeles/nexora/glm-5-3",
      "/ogre",
    ])
      expect(re.test(p), p).toBe(true);
  });
});
