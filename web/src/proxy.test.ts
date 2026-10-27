import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { embedCspFor } from "@/lib/embed-policy";
import { config, proxy } from "./proxy";

vi.mock("@/lib/embed-policy", () => ({ embedCspFor: vi.fn(async () => null) }));

const req = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost:3500${path}`, {
    headers: cookie ? { cookie } : {},
  });

afterEach(() => vi.unstubAllEnvs());

describe("proxy : langues (comportement existant)", () => {
  it("réécrit le français vers /fr, laisse /en, redirige /fr", async () => {
    vi.stubEnv("SITE_ENV", "production");
    expect(
      (await proxy(req("/solutions"))).headers.get("x-middleware-rewrite"),
    ).toContain("/fr/solutions");
    expect(
      (await proxy(req("/en/solutions"))).headers.get("x-middleware-rewrite"),
    ).toBeNull();
    const redirect = await proxy(req("/fr/solutions"));
    expect(redirect.status).toBe(308);
    expect(redirect.headers.get("location")).toContain("/solutions");
  });
});

describe("proxy : X-Robots-Tag hors production", () => {
  it("pose noindex, nofollow sur toute page quand SITE_ENV n'est pas « production »", async () => {
    for (const value of [undefined, "staging", "development"]) {
      if (value === undefined) vi.stubEnv("SITE_ENV", "");
      else vi.stubEnv("SITE_ENV", value);
      for (const path of ["/", "/en", "/solutions", "/en/contact"])
        expect((await proxy(req(path))).headers.get("x-robots-tag")).toBe(
          "noindex, nofollow",
        );
    }
  });
  it("aucun en-tête en production, sauf aperçu (Draft Mode)", async () => {
    vi.stubEnv("SITE_ENV", "production");
    expect(
      (await proxy(req("/solutions"))).headers.get("x-robots-tag"),
    ).toBeNull();
    expect(
      (await proxy(req("/solutions", "__prerender_bypass=1"))).headers.get(
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

describe("proxy : CSP de la bulle WorkStudio", () => {
  it("ne pose aucune politique tant qu'aucune bulle n'est configurée pour la page", async () => {
    vi.stubEnv("SITE_ENV", "production");
    const res = await proxy(req("/agents"));
    expect(res.headers.get("content-security-policy")).toBeNull();
  });
  it("pose la politique renvoyée pour la page, en français comme en anglais", async () => {
    vi.stubEnv("SITE_ENV", "production");
    vi.mocked(embedCspFor).mockResolvedValue("frame-src https://ia.exemple.ca");
    for (const path of ["/agents", "/en/agents"]) {
      const res = await proxy(req(path));
      expect(res.headers.get("content-security-policy")).toBe(
        "frame-src https://ia.exemple.ca",
      );
    }
    // Une redirection (/fr/…) ne porte pas de politique.
    const redirect = await proxy(req("/fr/agents"));
    expect(redirect.headers.get("content-security-policy")).toBeNull();
    vi.mocked(embedCspFor).mockResolvedValue(null);
  });
});
