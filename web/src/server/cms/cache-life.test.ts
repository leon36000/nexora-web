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

  it("une adresse inconnue n'est gardée que 2 minutes : inventer des adresses n'enfle ni le cache ni sa durée de vie", () => {
    const life = pageCacheLife({ source: "fresh", found: false });
    expect(life.expire).toBeLessThanOrEqual(120);
    expect(life.revalidate).toBeLessThanOrEqual(life.expire);
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
