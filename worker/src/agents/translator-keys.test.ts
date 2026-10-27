import { describe, expect, it } from "vitest";
import type { PageSnapshot } from "./page-reader.ts";
import {
  buildEnglishBlocks,
  extractStrings,
  htmlSkeleton,
  TranslationShapeError,
  untranslatedBlocks,
  validateTranslated,
} from "./translator-keys.ts";

const page: PageSnapshot = {
  id: "p",
  status: "published",
  noindex: false,
  translations: [
    {
      id: 1,
      languages_code: "fr-CA",
      slug: "a",
      title: "Titre",
      seo_title: "ST",
      seo_description: "SD",
    },
  ],
  blocks: [
    {
      id: 10,
      sort: 1,
      collection: "block_hero",
      item: {
        id: "h",
        translations: [
          {
            id: 5,
            languages_code: "fr-CA",
            headline: "Bonjour",
            primary_label: "Écrire",
            primary_href: "/contact/",
          },
        ],
      },
    },
    {
      id: 11,
      sort: 2,
      collection: "block_section",
      item: {
        id: "s",
        translations: [
          {
            id: 6,
            languages_code: "fr-CA",
            title: "Sec",
            body: "<p>Un <strong>mot</strong>.</p>",
            items: [{ title: "I1", text: "T1" }],
          },
        ],
      },
    },
    {
      id: 12,
      sort: 3,
      collection: "block_cards",
      item: {
        id: "c",
        translations: [
          {
            id: 7,
            languages_code: "fr-CA",
            title: "Cartes",
            cards: [{ title: "C1", text: "x", href: "/a/", status: "pilote" }],
          },
        ],
      },
    },
    {
      id: 13,
      sort: 4,
      collection: "block_pricing",
      item: {
        id: "pr",
        translations: [{ id: 8, languages_code: "fr-CA", title: "Tarifs" }],
      },
    },
  ],
};

describe("clés de traduction", () => {
  it("extrait page, champs, corps HTML et listes — pas les tarifs", () => {
    const s = extractStrings(page);
    expect(s).toMatchObject({
      "p.title": "Titre",
      "b1.headline": "Bonjour",
      "b1.primary_label": "Écrire",
      "b2.body": "<p>Un <strong>mot</strong>.</p>",
      "b2.items.0.text": "T1",
      "b3.cards.0.title": "C1",
    });
    expect(Object.keys(s).some((k) => k.startsWith("b4."))).toBe(false);
    expect(untranslatedBlocks(page)).toEqual(["bloc 4 (block_pricing)"]);
  });

  it("exige exactement les mêmes clés et la même structure HTML", () => {
    const src = extractStrings(page);
    const ok = {
      ...src,
      "p.title": "Title",
      "b2.body": "<p>A <strong>word</strong>.</p>",
    };
    expect(() => validateTranslated(src, ok)).not.toThrow();
    const missing = { ...ok };
    delete (missing as Record<string, string>)["b1.headline"];
    expect(() => validateTranslated(src, missing)).toThrow(
      TranslationShapeError,
    );
    expect(() => validateTranslated(src, { ...ok, extra: "x" })).toThrow(
      /en trop/,
    );
    expect(() =>
      validateTranslated(src, {
        ...ok,
        "b2.body": '<p>A <a href="https://evil.example">word</a>.</p>',
      }),
    ).toThrow(/structure HTML/);
    expect(() =>
      validateTranslated(src, { ...ok, "b1.headline": "<script>x</script>" }),
    ).toThrow(/balisage/);
    expect(htmlSkeleton("<p>a</p>")).toBe(htmlSkeleton("<P>b</P>"));
  });

  it("recopie liens et statuts du français", () => {
    const src = extractStrings(page);
    const en = buildEnglishBlocks(page, {
      ...src,
      "b1.headline": "Hello",
      "b1.primary_label": "Write",
      "b3.cards.0.title": "K1",
    });
    expect(en).toHaveLength(3);
    expect(en[0]?.translation).toMatchObject({
      headline: "Hello",
      primary_href: "/contact/",
    });
    expect(en[2]?.translation).toMatchObject({
      cards: [{ title: "K1", href: "/a/", status: "pilote" }],
    });
  });
});
