import { describe, expect, it } from "vitest";
import type { CmsClient } from "./client";
import { fetchNavigation, fetchSiteSettings } from "./settings";

function stub(data: Record<string, unknown>) {
  const calls: { path: string; query: Record<string, string> }[] = [];
  const client: CmsClient = {
    async get(path, query = {}) {
      calls.push({ path, query });
      return data[path];
    },
  };
  return { client, calls };
}

describe("fetchSiteSettings", () => {
  const raw = {
    site_name: "Nexora",
    og_default_image: "22222222-2222-4222-8222-222222222222",
    translations: [
      {
        languages_code: "fr-CA",
        tagline: "Slogan fr",
        seo_title_template: "%s — Nexora",
        seo_description: "Desc fr",
        footer_note: null,
      },
      {
        languages_code: "en-CA",
        tagline: "Tagline en",
        seo_title_template: "%s | Nexora",
        seo_description: "Desc en",
        footer_note: "Note",
      },
    ],
  };

  it("choisit la traduction de la langue", async () => {
    const { client } = stub({ "/items/site_settings": raw });
    const fr = await fetchSiteSettings(client, "fr-CA");
    expect(fr).toMatchObject({
      siteName: "Nexora",
      tagline: "Slogan fr",
      seoTitleTemplate: "%s — Nexora",
      footerNote: null,
      ogDefaultImageId: "22222222-2222-4222-8222-222222222222",
    });
    const en = await fetchSiteSettings(client, "en-CA");
    expect(en?.seoTitleTemplate).toBe("%s | Nexora");
  });

  it("renvoie null si Directus ne renvoie aucun réglage", async () => {
    const { client } = stub({ "/items/site_settings": null });
    expect(await fetchSiteSettings(client, "fr-CA")).toBeNull();
  });
});

describe("fetchNavigation", () => {
  const rows = [
    {
      id: "a",
      placement: "header",
      style: "link",
      sort: 2,
      parent: null,
      translations: [
        { languages_code: "fr-CA", label: "Solutions", href: "/solutions/" },
        { languages_code: "en-CA", label: "Solutions", href: "/en/solutions/" },
      ],
    },
    {
      id: "b",
      placement: "header",
      style: "link",
      sort: 1,
      parent: null,
      translations: [
        {
          languages_code: "fr-CA",
          label: "IA souveraine",
          href: "/souverainete/",
        },
      ],
    },
    {
      id: "c",
      placement: "header",
      style: "link",
      sort: 1,
      parent: "a",
      translations: [
        {
          languages_code: "fr-CA",
          label: "Courriels",
          href: "/solutions/courriels/",
        },
      ],
    },
    {
      id: "d",
      placement: "header",
      style: "button",
      sort: 3,
      parent: null,
      translations: [
        {
          languages_code: "fr-CA",
          label: "Mauvais",
          href: "javascript:alert(1)",
        },
      ],
    },
    {
      id: "e",
      placement: "footer",
      style: "link",
      sort: 1,
      parent: null,
      translations: [
        { languages_code: "fr-CA", label: "Pied", href: "/contact/" },
      ],
    },
  ];

  it("ne demande que les entrées publiées", async () => {
    const { client, calls } = stub({ "/items/navigation": rows });
    await fetchNavigation(client, "fr-CA");
    expect(calls[0]?.query.filter).toContain('"status":{"_eq":"published"}');
  });

  it("construit l'arbre trié, dans la langue, et écarte liens dangereux et entrées sans traduction", async () => {
    const { client } = stub({ "/items/navigation": rows });
    const fr = await fetchNavigation(client, "fr-CA");
    const header = fr.filter((n) => n.placement === "header");
    expect(header.map((n) => n.label)).toEqual(["IA souveraine", "Solutions"]);
    expect(header[1]?.href).toBe("/solutions");
    expect(header[1]?.children.map((c) => c.label)).toEqual(["Courriels"]);
    expect(fr.find((n) => n.id === "d")).toBeUndefined();
    const en = await fetchNavigation(client, "en-CA");
    expect(en.map((n) => n.id)).toEqual(["a"]);
  });
});
