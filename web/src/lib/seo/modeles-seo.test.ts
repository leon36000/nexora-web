import { describe, expect, it } from "vitest";
import { LANGS } from "@/i18n/config";
import { getModelsDictionary } from "@/i18n/models";
import { availableAppRoutes } from "./app-routes";
import { resolveOgTarget } from "./og-target";
import { buildSitemap } from "./sitemap";

const SITE = "https://nexora.test";
const routes = availableAppRoutes(() => true);

describe("référencement des pages de modèles", () => {
  it("la liste et les classements sont des routes de l'application ; le comparateur n'en est pas une", () => {
    const paths = routes.map((r) => r.path);
    expect(paths).toContain("/modeles");
    expect(paths).toContain("/modeles/benchmarks");
    expect(paths).not.toContain("/modeles/comparer");
  });

  it("le sitemap contient la liste, chaque fiche et les classements, datés du catalogue, jamais le comparateur", () => {
    const sm = buildSitemap({
      siteUrl: SITE,
      pages: [],
      appRoutes: routes.filter((r) => r.path.startsWith("/modeles")),
      modelIds: ["nexora/a-1", "nexora/b-2"],
      catalogPublishedAt: "2026-10-27T04:02:37.786Z",
      vpsAppCodes: [],
      vpsPublishedAt: null,
      agentSlugs: [],
      agentsPublishedAt: null,
    });
    const urls = sm.map((e) => e.url);
    for (const u of [
      "/modeles",
      "/modeles/benchmarks",
      "/modeles/nexora/a-1",
      "/modeles/nexora/b-2",
      "/en/modeles",
      "/en/modeles/benchmarks",
      "/en/modeles/nexora/b-2",
    ])
      expect(urls).toContain(`${SITE}${u}`);
    expect(urls.some((u) => u.includes("comparer"))).toBe(false);
    expect(
      sm.find((e) => e.url === `${SITE}/modeles/benchmarks`)?.lastModified,
    ).toEqual(new Date("2026-10-27T04:02:37.786Z"));
  });

  it("chaque route a un titre et une description uniques, de longueur utile, dans les deux langues", () => {
    const seen = new Set<string>();
    for (const lang of LANGS) {
      const t = getModelsDictionary(lang).meta;
      for (const m of [t.list, t.benchmarks, t.compare]) {
        const bare = m.title.replace(" | Nexora AI", "");
        expect(bare.length).toBeLessThanOrEqual(48);
        expect(m.title.length).toBeGreaterThanOrEqual(15);
        expect(m.title.length).toBeLessThanOrEqual(65);
        expect(m.description.length).toBeGreaterThanOrEqual(70);
        expect(m.description.length).toBeLessThanOrEqual(160);
        expect(seen.has(m.title)).toBe(false);
        seen.add(m.title);
      }
    }
  });

  it("l'image sociale des classements vient de la route connue, celle d'une fiche de l'identifiant", () => {
    expect(resolveOgTarget(["modeles", "benchmarks"], routes)).toMatchObject({
      kind: "app",
    });
    expect(resolveOgTarget(["modeles", "nexora", "a-1"], routes)).toEqual({
      kind: "model",
      id: "nexora/a-1",
    });
  });
});
