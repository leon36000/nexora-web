import { describe, expect, it } from "vitest";
import { buildPageMetadata } from "./metadata";

const base = {
  lang: "fr" as const,
  path: "/compte/connexion",
  title: "Connexion | Nexora",
  description: "d",
  siteName: "Nexora",
};

describe("buildPageMetadata", () => {
  it("annonce une image Open Graph et Twitter pour une page indexable", () => {
    const m = buildPageMetadata({ ...base, path: "/contact" });
    expect(JSON.stringify(m.openGraph)).toContain("/og/fr/contact");
    expect(JSON.stringify(m.twitter)).toContain("/og/fr/contact");
    expect(m.robots).toBeUndefined();
  });

  it("une page non indexable n'annonce aucune image (la route /og répond 404 pour elle) et porte noindex", () => {
    const m = buildPageMetadata({ ...base, noindex: true });
    expect(JSON.stringify(m)).not.toContain("/og/");
    expect(m.robots).toEqual({ index: false, follow: false });
    expect(m.alternates?.canonical).toBe("/compte/connexion");
  });
});
