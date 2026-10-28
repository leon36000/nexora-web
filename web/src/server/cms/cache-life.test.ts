import { describe, expect, it } from "vitest";
import { pageCacheLife } from "./cache-life";

describe("durée de cache d'une page du CMS", () => {
  it("une page trouvée garde la longue durée (30 jours d'expiration)", () => {
    expect(pageCacheLife({ source: "fresh", found: true })).toEqual({
      stale: 60,
      revalidate: 300,
      expire: 2_592_000,
    });
  });

  it("une adresse inconnue n'est gardée que 5 minutes : inventer des adresses n'enfle ni le cache ni sa durée de vie", () => {
    const life = pageCacheLife({ source: "fresh", found: false });
    expect(life.expire).toBeLessThanOrEqual(300);
    expect(life.revalidate).toBeLessThanOrEqual(life.expire);
  });

  it("aucun profil n'est « court » pour Next (expiration d'au moins 5 minutes, revalidation non nulle) : sinon la page n'est plus prérendable et une adresse inconnue répond 500 au lieu de 404", () => {
    for (const source of ["fresh", "stale"] as const)
      for (const found of [true, false]) {
        const life = pageCacheLife({ source, found });
        expect(life.expire, `${source}/${found}`).toBeGreaterThanOrEqual(300);
        expect(life.revalidate, `${source}/${found}`).toBeGreaterThan(0);
      }
  });

  it("une page servie de l'instantané (Directus en panne) est réessayée vite, trouvée ou non", () => {
    for (const found of [true, false])
      expect(pageCacheLife({ source: "stale", found })).toEqual({
        stale: 30,
        revalidate: 10,
        expire: 600,
      });
  });
});
