import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import {
  API_CSP,
  mergeCsp,
  PAGE_CSP_DIRECTIVES,
  pageCsp,
  parseCsp,
  SECURITY_HEADERS,
} from "./security-headers";

const THIRD_PARTY = /https?:\/\/|\/\/|\*/;

describe("en-têtes de sécurité (S9)", () => {
  it("la configuration Next.js pose les en-têtes sur toutes les routes, y compris /api et /v1", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const all = rules.find((r) => r.source === "/:path*");
    expect(all, "règle /:path*").toBeDefined();
    const h = Object.fromEntries(
      (all?.headers ?? []).map((x) => [x.key.toLowerCase(), x.value]),
    );
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["permissions-policy"]).toMatch(/camera=\(\)/);
    expect(h["permissions-policy"]).toMatch(/geolocation=\(\)/);
    expect(h["strict-transport-security"]).toMatch(/max-age=(\d+)/);
    expect(
      Number(/max-age=(\d+)/.exec(h["strict-transport-security"] ?? "")?.[1]),
    ).toBeGreaterThanOrEqual(31_536_000);
    // includeSubDomains et preload engagent tout le domaine : décision de l'opérateur, pas du code.
    expect(h["strict-transport-security"]).not.toMatch(/preload/i);
    expect(SECURITY_HEADERS.length).toBeGreaterThanOrEqual(5);
  });

  it("l'API et la passerelle n'acceptent aucune ressource (CSP « default-src 'none' »)", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    for (const source of ["/api/:path*", "/v1/:path*"]) {
      const rule = rules.find((r) => r.source === source);
      const csp = rule?.headers.find(
        (x) => x.key.toLowerCase() === "content-security-policy",
      )?.value;
      expect(csp, source).toBe(API_CSP);
    }
    expect(parseCsp(API_CSP).get("default-src")).toEqual(["'none'"]);
    expect(parseCsp(API_CSP).get("frame-ancestors")).toEqual(["'none'"]);
  });

  it("les réponses qui ne sont pas des pages (images /og, llms.txt, sitemap, robots, icônes, manifeste) portent aussi la CSP restrictive", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    for (const source of [
      "/og/:path*",
      "/llms.txt",
      "/sitemap.xml",
      "/robots.txt",
      "/icon.svg",
      "/favicon.ico",
      "/apple-icon.png",
      "/manifest.webmanifest",
      "/icon-:size.png",
      "/icon-maskable-:size.png",
    ]) {
      const rule = rules.find((r) => r.source === source);
      const csp = rule?.headers.find(
        (x) => x.key.toLowerCase() === "content-security-policy",
      )?.value;
      expect(csp, source).toBe(API_CSP);
    }
  });

  it("n'expose pas la technologie du serveur", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("la CSP des pages n'ouvre aucune origine tierce (polices, CDN, analytique, cartes)", () => {
    const csp = parseCsp(pageCsp({ dev: false }));
    for (const [directive, sources] of csp) {
      for (const s of sources)
        expect(s, `${directive} ${s}`).not.toMatch(THIRD_PARTY);
    }
    expect(csp.get("default-src")).toEqual(["'self'"]);
    expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.get("base-uri")).toEqual(["'self'"]);
    expect(csp.get("form-action")).toEqual(["'self'"]);
    expect(csp.get("script-src")).not.toContain("'unsafe-eval'");
    expect(csp.get("connect-src")).toEqual(["'self'"]);
    expect(PAGE_CSP_DIRECTIVES.length).toBeGreaterThan(8);
  });

  it("'unsafe-eval' n'existe qu'en développement", () => {
    expect(parseCsp(pageCsp({ dev: true })).get("script-src")).toContain(
      "'unsafe-eval'",
    );
    expect(parseCsp(pageCsp({ dev: false })).get("script-src")).not.toContain(
      "'unsafe-eval'",
    );
  });

  it("la bulle WorkStudio n'ouvre que son origine, et seulement en script, cadre et connexion", () => {
    const merged = parseCsp(
      mergeCsp(
        pageCsp({ dev: false }),
        "script-src 'self' 'unsafe-inline' https://ia.exemple.ca; frame-src https://ia.exemple.ca; connect-src 'self' https://ia.exemple.ca; object-src 'none'; base-uri 'self'",
      ),
    );
    for (const [directive, sources] of merged) {
      const hasOrigin = sources.includes("https://ia.exemple.ca");
      expect(hasOrigin, directive).toBe(
        ["script-src", "frame-src", "connect-src"].includes(directive),
      );
    }
    expect(merged.get("frame-ancestors")).toEqual(["'none'"]);
    expect(merged.get("default-src")).toEqual(["'self'"]);
  });
});
