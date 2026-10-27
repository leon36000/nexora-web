import { describe, expect, test } from "bun:test";
import {
  buildDelta,
  type CurrentPage,
  canonical,
  claimUuid,
  type DesiredPage,
  type ManagedFields,
  managedFields,
  mergePage,
  type PageFile,
  validatePageFile,
} from "./content";

const managed: ManagedFields = {
  block_hero: { base: ["variant"], tr: ["headline", "subheadline"] },
  block_cta: { base: ["tone"], tr: ["title"] },
  block_cards: { base: ["columns"], tr: ["title", "cards"] },
};

const want = (over: Partial<DesiredPage> = {}): DesiredPage => ({
  key: "p",
  status: "published",
  noindex: false,
  translations: {
    "fr-CA": {
      slug: "",
      title: "Accueil",
      seo_title: "T",
      seo_description: "D",
      canonical: null,
    },
  },
  blocks: [
    {
      collection: "block_hero",
      fields: { variant: "sombre" },
      translations: { "fr-CA": { headline: "Titre.", subheadline: "Sous." } },
    },
  ],
  ...over,
});

const cur = (over: Partial<CurrentPage> = {}): CurrentPage => ({
  id: "page-1",
  status: "published",
  noindex: false,
  translations: [
    {
      id: 11,
      languages_code: "fr-CA",
      slug: "",
      title: "Accueil",
      seo_title: "T",
      seo_description: "D",
      canonical: null,
    },
  ],
  blocks: [
    {
      id: 7,
      sort: 1,
      collection: "block_hero",
      item: {
        id: "h1",
        variant: "sombre",
        translations: [
          {
            id: 21,
            languages_code: "fr-CA",
            headline: "Titre.",
            subheadline: "Sous.",
          },
        ],
      },
    },
  ],
  ...over,
});

describe("buildDelta", () => {
  test("aucun changement quand l'état est identique", () => {
    expect(buildDelta(cur(), want(), managed).delta).toBeNull();
  });

  test("brouillon -> publié : le statut est dans le delta", () => {
    const { delta } = buildDelta(cur({ status: "draft" }), want(), managed);
    expect(delta).toEqual({ status: "published" });
  });

  test("un titre modifié ne touche que ce champ de la traduction du bloc", () => {
    const w = want();
    (w.blocks[0] as DesiredPage["blocks"][number]).translations["fr-CA"] = {
      headline: "Autre.",
      subheadline: "Sous.",
    };
    const { delta } = buildDelta(cur(), w, managed);
    expect(delta).toEqual({
      blocks: {
        create: [],
        delete: [],
        update: [
          {
            id: 7,
            collection: "block_hero",
            item: {
              id: "h1",
              translations: {
                create: [],
                delete: [],
                update: [{ id: 21, headline: "Autre." }],
              },
            },
          },
        ],
      },
    });
  });

  test("un champ retiré du contenu voulu est remis à null", () => {
    const w = want();
    (w.blocks[0] as DesiredPage["blocks"][number]).translations["fr-CA"] = {
      headline: "Titre.",
    };
    const { delta } = buildDelta(cur(), w, managed);
    expect(JSON.stringify(delta)).toContain('"subheadline":null');
  });

  test("une langue absente est créée avec son code", () => {
    const w = want();
    w.translations["en-CA"] = {
      slug: "",
      title: "Home",
      seo_title: "T",
      seo_description: "D",
      canonical: null,
    };
    (w.blocks[0] as DesiredPage["blocks"][number]).translations["en-CA"] = {
      headline: "Title.",
    };
    const { delta } = buildDelta(cur(), w, managed);
    expect(delta?.translations?.create).toEqual([
      {
        languages_code: "en-CA",
        slug: "",
        title: "Home",
        seo_title: "T",
        seo_description: "D",
        canonical: null,
      },
    ]);
    const upd = delta?.blocks?.update[0] as {
      item: { translations: { create: unknown[] } };
    };
    expect(upd.item.translations.create).toEqual([
      { languages_code: "en-CA", headline: "Title." },
    ]);
  });

  test("un bloc de plus est créé, rang 2", () => {
    const w = want();
    w.blocks.push({
      collection: "block_cta",
      fields: { tone: "sombre" },
      translations: { "fr-CA": { title: "Parlons-en." } },
    });
    const { delta } = buildDelta(cur(), w, managed);
    expect(delta?.blocks?.create).toEqual([
      {
        collection: "block_cta",
        sort: 2,
        item: {
          tone: "sombre",
          translations: {
            create: [{ languages_code: "fr-CA", title: "Parlons-en." }],
            update: [],
            delete: [],
          },
        },
      },
    ]);
    expect(delta?.blocks?.update).toEqual([]);
  });

  test("un bloc de type différent au même rang est détaché puis recréé", () => {
    const w = want({
      blocks: [
        {
          collection: "block_cta",
          fields: { tone: "sombre" },
          translations: { "fr-CA": { title: "Parlons-en." } },
        },
      ],
    });
    const { delta } = buildDelta(cur(), w, managed);
    expect(delta?.blocks?.delete).toEqual([7]);
    expect(delta?.blocks?.create).toHaveLength(1);
  });

  test("un bloc en trop est détaché", () => {
    const { delta } = buildDelta(cur(), want({ blocks: [] }), managed);
    expect(delta?.blocks?.delete).toEqual([7]);
  });

  test("une liste JSON identique n'est pas un changement, quel que soit l'ordre des clés", () => {
    const w = want({
      blocks: [
        {
          collection: "block_cards",
          fields: { columns: "3" },
          translations: {
            "fr-CA": { title: "T", cards: [{ title: "a", text: "b" }] },
          },
        },
      ],
    });
    const c = cur({
      blocks: [
        {
          id: 1,
          sort: 1,
          collection: "block_cards",
          item: {
            id: "c1",
            columns: "3",
            translations: [
              {
                id: 5,
                languages_code: "fr-CA",
                title: "T",
                cards: [{ text: "b", title: "a" }],
              },
            ],
          },
        },
      ],
    });
    expect(buildDelta(c, w, managed).delta).toBeNull();
  });

  test("l'ordre des blocs compte : un rang décalé met à jour le tri", () => {
    const c = cur({
      blocks: [
        { ...(cur().blocks[0] as CurrentPage["blocks"][number]), sort: 4 },
      ],
    });
    const { delta } = buildDelta(c, want(), managed);
    expect(delta?.blocks?.update[0]?.sort).toBe(1);
  });
});

describe("canonical", () => {
  test("ignore l'ordre des clés et les estampilles _user et _date", () => {
    expect(canonical({ b: 1, a: { d: 2, c: 3 }, _user: "x" })).toBe(
      canonical({ a: { c: 3, d: 2 }, b: 1, _date: "y" }),
    );
  });
  test("l'ordre d'un tableau compte", () => {
    expect(canonical([1, 2])).not.toBe(canonical([2, 1]));
  });
});

describe("claimUuid", () => {
  test("stable, au format UUID, distinct selon le code", async () => {
    const a = await claimUuid("CL-01");
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(await claimUuid("CL-01")).toBe(a);
    expect(await claimUuid("CL-02")).not.toBe(a);
  });
});

describe("validation contre le schéma réel", () => {
  const file = (over: Partial<PageFile> = {}): PageFile => ({
    page: "p",
    locale: "fr-CA",
    status: "published",
    seo: { slug: "", title: "T", seo_title: "S", seo_description: "D" },
    blocks: [
      {
        collection: "block_hero",
        fields: { variant: "sombre" },
        translation: { headline: "Titre." },
      },
    ],
    ...over,
  });

  test("accepte un bloc conforme", () => {
    expect(validatePageFile(file())).toEqual([]);
  });
  test("refuse un champ inconnu et un type inconnu", () => {
    const f = file({
      blocks: [
        {
          collection: "block_hero",
          fields: { couleur: "rouge" },
          translation: { h1: "x" },
        },
        { collection: "block_video", translation: {} },
      ],
    });
    const e = validatePageFile(f);
    expect(e.join("\n")).toContain("champ « couleur » absent du schéma");
    expect(e.join("\n")).toContain("champ traduit « h1 » absent du schéma");
    expect(e.join("\n")).toContain("type inconnu");
  });
  test("les champs gérés viennent bien de buildSchema (héros)", () => {
    const m = managedFields();
    expect(m.block_hero?.tr).toContain("headline");
    expect(m.block_hero?.base).toContain("perimeter_grid");
    expect(m.block_faq?.tr).toContain("items");
    expect(m.block_cards?.tr).not.toContain("languages_code");
  });
  test("deux langues de structure différente sont refusées", () => {
    const fr = file();
    const en = file({ locale: "en-CA", blocks: [] });
    expect(() => mergePage({ "fr-CA": fr, "en-CA": en })).toThrow(
      /nombre de blocs différent/,
    );
  });
  test("champs non traduits différents entre langues refusés", () => {
    const fr = file();
    const en = file({
      locale: "en-CA",
      blocks: [
        {
          collection: "block_hero",
          fields: { variant: "clair" },
          translation: { headline: "Title." },
        },
      ],
    });
    expect(() => mergePage({ "fr-CA": fr, "en-CA": en })).toThrow(
      /non traduits/,
    );
  });
});
