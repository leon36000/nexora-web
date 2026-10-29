import { describe, expect, it } from "vitest";
import type { PageModel, SiteSettings } from "@/server/cms/model";
import { buildCmsMetadata } from "./seo";

const page = (over: Partial<PageModel> = {}): PageModel => ({
  id: "p",
  lang: "fr-CA",
  slug: "opsys-ai",
  title: "OPSYS-AI",
  seoTitle: "OPSYS-AI, le système d'exploitation de l'entreprise",
  seoDescription: "Description de la page.",
  canonical: null,
  noindex: false,
  seoImageId: null,
  blocks: [],
  translations: [
    { code: "fr-CA", slug: "opsys-ai" },
    { code: "en-CA", slug: "opsys-ai" },
  ],
  ...over,
});
const settings: SiteSettings = {
  siteName: "Nexora",
  tagline: null,
  seoTitleTemplate: "%s — Nexora",
  seoDescription: "Description par défaut.",
  footerNote: null,
  ogDefaultImageId: "99999999-9999-4999-8999-999999999999",
};

describe("buildCmsMetadata", () => {
  it("titre, description, canonical et robots par défaut", () => {
    const m = buildCmsMetadata({
      page: page(),
      lang: "fr",
      settings,
      siteName: "Nexora",
      preview: false,
    });
    expect(m.title).toBe(
      "OPSYS-AI, le système d'exploitation de l'entreprise — Nexora",
    );
    expect(m.description).toBe("Description de la page.");
    expect(m.alternates?.canonical).toBe("/opsys-ai");
    expect(m.robots).toEqual({ index: true, follow: true });
  });

  it("l'accueil garde son titre SEO tel quel (pas de gabarit)", () => {
    const m = buildCmsMetadata({
      page: page({
        slug: "",
        seoTitle: "L'IA qui travaille pour vous.",
        translations: [
          { code: "fr-CA", slug: "" },
          { code: "en-CA", slug: "" },
        ],
      }),
      lang: "fr",
      settings,
      siteName: "Nexora",
      preview: false,
    });
    expect(m.title).toBe("L'IA qui travaille pour vous.");
    expect(m.alternates?.canonical).toBe("/");
  });

  it("sans titre SEO, utilise le titre de la page ; sans description, celle du site", () => {
    const m = buildCmsMetadata({
      page: page({ seoTitle: null, seoDescription: null }),
      lang: "fr",
      settings,
      siteName: "Nexora",
      preview: false,
    });
    expect(m.title).toBe("OPSYS-AI — Nexora");
    expect(m.description).toBe("Description par défaut.");
  });

  it("hreflang : seulement les langues dont la traduction existe, et x-default vers le français", () => {
    const both = buildCmsMetadata({
      page: page({
        translations: [
          { code: "fr-CA", slug: "souverainete" },
          { code: "en-CA", slug: "sovereignty" },
        ],
      }),
      lang: "fr",
      settings,
      siteName: "Nexora",
      preview: false,
    });
    expect(both.alternates?.languages).toEqual({
      "fr-CA": "/souverainete",
      "en-CA": "/en/sovereignty",
      "x-default": "/souverainete",
    });
    const onlyFr = buildCmsMetadata({
      page: page({ translations: [{ code: "fr-CA", slug: "opsys-ai" }] }),
      lang: "fr",
      settings,
      siteName: "Nexora",
      preview: false,
    });
    expect(onlyFr.alternates?.languages).toEqual({
      "fr-CA": "/opsys-ai",
      "x-default": "/opsys-ai",
    });
    expect(onlyFr.alternates?.languages).not.toHaveProperty("en-CA");
    const onlyEn = buildCmsMetadata({
      page: page({
        lang: "en-CA",
        translations: [{ code: "en-CA", slug: "only" }],
      }),
      lang: "en",
      settings,
      siteName: "Nexora",
      preview: false,
    });
    expect(onlyEn.alternates?.languages).toEqual({ "en-CA": "/en/only" });
    expect(onlyEn.alternates?.languages).not.toHaveProperty("x-default");
  });

  it("le canonical saisi dans le CMS l'emporte", () => {
    const m = buildCmsMetadata({
      page: page({ canonical: "https://nexora.example/opsys-ai" }),
      lang: "fr",
      settings,
      siteName: "Nexora",
      preview: false,
    });
    expect(m.alternates?.canonical).toBe("https://nexora.example/opsys-ai");
  });

  it("noindex de la page ou aperçu : robots noindex, nofollow", () => {
    const a = buildCmsMetadata({
      page: page({ noindex: true }),
      lang: "fr",
      settings,
      siteName: "Nexora",
      preview: false,
    });
    expect(a.robots).toMatchObject({ index: false, follow: false });
    const b = buildCmsMetadata({
      page: page(),
      lang: "fr",
      settings,
      siteName: "Nexora",
      preview: true,
    });
    expect(b.robots).toMatchObject({ index: false, follow: false });
  });

  it("image Open Graph : celle de la page, sinon celle des réglages, par la route /media", () => {
    const own = buildCmsMetadata({
      page: page({ seoImageId: "11111111-1111-4111-8111-111111111111" }),
      lang: "fr",
      settings,
      siteName: "Nexora",
      preview: false,
    });
    expect(JSON.stringify(own.openGraph?.images)).toContain(
      "/media/11111111-1111-4111-8111-111111111111",
    );
    const dflt = buildCmsMetadata({
      page: page(),
      lang: "fr",
      settings,
      siteName: "Nexora",
      preview: false,
    });
    expect(JSON.stringify(dflt.openGraph?.images)).toContain(
      "/media/99999999-9999-4999-8999-999999999999",
    );
    const none = buildCmsMetadata({
      page: page(),
      lang: "fr",
      settings: null,
      siteName: "Nexora",
      preview: false,
    });
    // aucune image saisie : image Open Graph dynamique, jamais d'image absente
    expect(JSON.stringify(none.openGraph?.images)).toContain("/og/fr/opsys-ai");
  });
});

describe("buildCmsMetadata : guides (og:type article)", () => {
  const guide = (over: Partial<PageModel> = {}) =>
    page({
      slug: "guides/ia-pme-quebec",
      title: "L'IA pour une PME",
      translations: [
        { code: "fr-CA", slug: "guides/ia-pme-quebec" },
        { code: "en-CA", slug: "guides/ai-small-business-quebec" },
      ],
      ...over,
    });
  const dates = {
    createdAt: "2026-10-20T14:00:00.000Z",
    updatedAt: "2026-10-29T15:30:00.000Z",
  };

  it("un guide déclare og:type article, avec ses dates réelles et l'entreprise pour auteur", () => {
    const m = buildCmsMetadata({
      page: guide(),
      lang: "fr",
      settings,
      siteName: "Nexora AI",
      preview: false,
      dates,
    });
    expect(m.openGraph).toMatchObject({
      type: "article",
      publishedTime: dates.createdAt,
      modifiedTime: dates.updatedAt,
      authors: ["Nexora AI"],
      siteName: "Nexora AI",
    });
  });

  it("une page de produit reste de type website, même si des dates sont connues", () => {
    const m = buildCmsMetadata({
      page: page(),
      lang: "fr",
      settings,
      siteName: "Nexora AI",
      preview: false,
      dates,
    });
    expect(m.openGraph).toMatchObject({ type: "website" });
    expect(m.openGraph).not.toHaveProperty("publishedTime");
  });

  it("n'invente aucune date : sans date, le guide est un article sans heure de publication", () => {
    const m = buildCmsMetadata({
      page: guide(),
      lang: "fr",
      settings,
      siteName: "Nexora AI",
      preview: false,
    });
    expect(m.openGraph).toMatchObject({ type: "article" });
    expect(m.openGraph).not.toHaveProperty("publishedTime");
    expect(m.openGraph).not.toHaveProperty("modifiedTime");
  });

  it("une fiche de gabarit est aussi un article", () => {
    const m = buildCmsMetadata({
      page: guide({
        slug: "gabarits-flux-de-travaux/devis",
        translations: [
          { code: "fr-CA", slug: "gabarits-flux-de-travaux/devis" },
        ],
      }),
      lang: "fr",
      settings,
      siteName: "Nexora AI",
      preview: false,
      dates,
    });
    expect(m.openGraph).toMatchObject({ type: "article" });
  });
});
