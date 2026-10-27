import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { embedCspFor } from "@/lib/embed-policy";
import { parseCsp } from "@/lib/security-headers";
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

describe("proxy : page Tarifs (deux adresses)", () => {
  it("/en/pricing est servi par la route /en/tarifs ; /en/tarifs redirige vers l'adresse canonique", async () => {
    vi.stubEnv("SITE_ENV", "production");
    const served = await proxy(req("/en/pricing"));
    expect(served.headers.get("x-middleware-rewrite")).toContain("/en/tarifs");
    const redirect = await proxy(req("/en/tarifs"));
    expect(redirect.status).toBe(308);
    expect(redirect.headers.get("location")).toContain("/en/pricing");
    expect(
      (await proxy(req("/tarifs"))).headers.get("x-middleware-rewrite"),
    ).toContain("/fr/tarifs");
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
      "/icon.svg",
      "/favicon.ico",
    ])
      expect(re.test(p), p).toBe(false);
    for (const p of [
      "/",
      "/en",
      "/solutions",
      "/modeles/nexora/glm-5-3",
      // identifiant de modèle avec un point (OpenRouter : gpt-4.1, claude-3.5…) : la fiche passe par le proxy
      "/modeles/openai/gpt-4.1",
      "/en/modeles/openai/gpt-4.1",
      "/ogre",
    ])
      expect(re.test(p), p).toBe(true);
  });
});

describe("proxy : CSP et formulaires qui redirigent vers Stripe", () => {
  // Chrome applique `form-action` aussi aux REDIRECTIONS d'un formulaire : le 303 vers la page de paiement hébergée
  // de Stripe est bloqué si la directive ne nomme pas cette origine (constaté au navigateur, espace client).
  it("l'espace client autorise les pages hébergées de Stripe en form-action, et elles seules", async () => {
    for (const path of [
      "/compte",
      "/compte/vps",
      "/en/compte",
      "/en/compte/vps",
    ]) {
      const csp = parseCsp(
        (await proxy(req(path))).headers.get("content-security-policy") ?? "",
      );
      expect(csp.get("form-action"), path).toEqual([
        "'self'",
        "https://checkout.stripe.com",
        "https://billing.stripe.com",
      ]);
      expect(csp.get("default-src"), path).toEqual(["'self'"]);
      expect(csp.get("connect-src"), path).toEqual(["'self'"]);
    }
  });

  it("les autres pages gardent form-action 'self' (aucune origine tierce)", async () => {
    for (const path of [
      "/",
      "/contact",
      "/en/contact",
      "/compte/connexion-x",
      "/agents",
      "/vps",
    ]) {
      const csp = parseCsp(
        (await proxy(req(path))).headers.get("content-security-policy") ?? "",
      );
      expect(csp.get("form-action"), path).toEqual(["'self'"]);
    }
  });
});

describe("proxy : adresses mal formées", () => {
  const re = (i: number) =>
    new RegExp(`^${(config.matcher[i] as string).replace(/\(\?!/, "(?!")}$`);

  it("répond 400 (et non 500) à un pourcentage invalide ou à un octet nul, sur les pages comme sur l'API", async () => {
    vi.stubEnv("SITE_ENV", "production");
    for (const path of [
      "/%E0%A4%A",
      "/en/faq/%E0%A4%A",
      "/modeles/%ff/x",
      "/%00",
      "/en/%00",
      "/api/media/%E0%A4%A",
      "/og/fr/modeles/%E0%A4%A",
      "/v1/%E0%A4%A",
    ]) {
      const res = await proxy(req(path));
      expect(res.status, path).toBe(400);
      expect(res.headers.get("cache-control"), path).toBe("no-store");
      expect(res.headers.get("x-middleware-rewrite"), path).toBeNull();
    }
  });

  it("laisse passer une adresse valide, accents et pourcentages corrects compris", async () => {
    vi.stubEnv("SITE_ENV", "production");
    expect((await proxy(req("/solutions/%C3%A9t%C3%A9"))).status).toBe(200);
    expect(
      (await proxy(req("/en/solutions/%C3%A9t%C3%A9"))).headers.get(
        "x-middleware-next",
      ),
    ).toBe("1");
  });

  it("l'API, la passerelle et /og ne reçoivent ni réécriture, ni CSP de page (la leur vient de next.config)", async () => {
    vi.stubEnv("SITE_ENV", "production");
    for (const path of ["/api/health", "/v1/models", "/og/fr/opsys-ai"]) {
      const res = await proxy(req(path));
      expect(res.headers.get("x-middleware-next"), path).toBe("1");
      expect(res.headers.get("x-middleware-rewrite"), path).toBeNull();
      expect(res.headers.get("content-security-policy"), path).toBeNull();
    }
  });

  it("le second matcher couvre /api, /v1 et /og, pas /ogre", () => {
    const m = re(1);
    for (const p of [
      "/api/health",
      "/api/media/x",
      "/v1/models",
      "/og/fr",
      "/og/fr/a/b",
    ])
      expect(m.test(p), p).toBe(true);
    for (const p of ["/ogre", "/apiary", "/", "/en/api"])
      expect(m.test(p), p).toBe(false);
  });
});

describe("proxy : CSP des pages et de la bulle WorkStudio", () => {
  it("pose la CSP de base sur toute page, sans origine tierce, même sans bulle", async () => {
    vi.stubEnv("SITE_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    for (const path of ["/agents", "/en/agents", "/", "/fr/agents"]) {
      const csp = parseCsp(
        (await proxy(req(path))).headers.get("content-security-policy") ?? "",
      );
      expect(csp.get("default-src"), path).toEqual(["'self'"]);
      expect(csp.get("frame-ancestors"), path).toEqual(["'none'"]);
      expect(csp.get("script-src"), path).toEqual([
        "'self'",
        "'unsafe-inline'",
      ]);
    }
  });
  it("ajoute l'origine de la bulle (script, cadre, connexion) à la CSP de base, en français comme en anglais", async () => {
    vi.stubEnv("SITE_ENV", "production");
    vi.mocked(embedCspFor).mockResolvedValue("frame-src https://ia.exemple.ca");
    for (const path of ["/agents", "/en/agents"]) {
      const csp = parseCsp(
        (await proxy(req(path))).headers.get("content-security-policy") ?? "",
      );
      expect(csp.get("frame-src")).toEqual(["https://ia.exemple.ca"]);
      expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
      expect(csp.get("default-src")).toEqual(["'self'"]);
    }
    // HEAD porte la même politique que GET.
    const head = await proxy(
      new NextRequest("http://localhost:3500/agents", { method: "HEAD" }),
    );
    expect(head.headers.get("content-security-policy")).toContain(
      "frame-src https://ia.exemple.ca",
    );
    // POST et redirection : jamais l'origine de la bulle, mais toujours la CSP de base.
    const post = await proxy(
      new NextRequest("http://localhost:3500/agents", { method: "POST" }),
    );
    expect(post.headers.get("content-security-policy")).not.toContain(
      "ia.exemple.ca",
    );
    const redirect = await proxy(req("/fr/agents"));
    expect(redirect.headers.get("content-security-policy")).not.toContain(
      "ia.exemple.ca",
    );
    vi.mocked(embedCspFor).mockResolvedValue(null);
  });
});
