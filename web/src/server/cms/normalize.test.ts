import { describe, expect, it } from "vitest";
import { normalizePage, parsePageResponse } from "./normalize";
import {
  cardsBlock,
  ctaBlock,
  EN,
  FR,
  faqBlock,
  heroBlock,
  pageJson,
  sectionBlock,
} from "./test-fixtures";

const raw = (over = {}) =>
  parsePageResponse(
    pageJson(
      "p1",
      { fr: "opsys-ai", en: "opsys-ai" },
      [sectionBlock(2, 2), heroBlock(1, 1), faqBlock(3, 3)],
      over,
    ),
  );

describe("normalizePage", () => {
  it("trie les blocs par rang et choisit la traduction de la langue", () => {
    const page = normalizePage(raw(), FR);
    expect(page?.blocks.map((b) => b.type)).toEqual(["hero", "section", "faq"]);
    const hero = page?.blocks[0];
    expect(hero?.type === "hero" && hero.headline).toBe(
      "L'IA qui travaille pour vous.",
    );
    const en = normalizePage(raw(), EN);
    const heroEn = en?.blocks[0];
    expect(heroEn?.type === "hero" && heroEn.headline).toBe(
      "AI that works for you.",
    );
  });

  it("n'affiche pas un bloc qui n'a pas de traduction dans la langue demandée", () => {
    const en = normalizePage(raw(), EN);
    // la section et la FAQ n'ont qu'une traduction fr-CA : jamais de français sur /en
    expect(en?.blocks.map((b) => b.type)).toEqual(["hero"]);
  });

  it("renvoie null si la page n'a pas de traduction dans la langue", () => {
    const onlyFr = parsePageResponse(
      pageJson("p2", { fr: "x" }, [heroBlock(1, 1)]),
    );
    expect(normalizePage(onlyFr, EN)).toBeNull();
    expect(normalizePage(onlyFr, FR)?.slug).toBe("x");
  });

  it("expose les traductions existantes (pour hreflang), l'accueil a un slug vide", () => {
    const home = normalizePage(
      parsePageResponse(pageJson("h", { fr: "", en: null }, [heroBlock(1, 1)])),
      FR,
    );
    expect(home?.slug).toBe("");
    expect(home?.translations).toEqual([
      { code: FR, slug: "" },
      { code: EN, slug: "" },
    ]);
  });

  it("nettoie les liens (schémas dangereux refusés, barre finale retirée) et les libellés vides", () => {
    const page = normalizePage(
      parsePageResponse(
        pageJson("p", { fr: "x" }, [
          heroBlock(1, 1, {
            translations: [
              {
                languages_code: FR,
                headline: "T",
                primary_label: "Aller",
                primary_href: "javascript:alert(1)",
                secondary_label: "Voir",
                secondary_href: "/solutions/",
              },
            ],
          }),
        ]),
      ),
      FR,
    );
    const hero = page?.blocks[0];
    if (hero?.type !== "hero") throw new Error("héros attendu");
    expect(hero.primary).toBeNull();
    expect(hero.secondary).toEqual({ label: "Voir", href: "/solutions" });
  });

  it("écarte les entrées de liste vides et garde les autres", () => {
    const page = normalizePage(raw(), FR);
    const section = page?.blocks.find((b) => b.type === "section");
    if (section?.type !== "section") throw new Error("section attendue");
    expect(section.items).toEqual([{ title: "Un", text: "Deux" }]);
  });

  it("ignore un type de bloc inconnu sans casser la page", () => {
    const page = normalizePage(
      parsePageResponse(
        pageJson("p", { fr: "x" }, [
          heroBlock(1, 1),
          { id: 9, collection: "block_inconnu", sort: 2, item: { id: "z" } },
        ]),
      ),
      FR,
    );
    expect(page?.blocks.map((b) => b.type)).toEqual(["hero"]);
  });

  it("accepte les blocs d'un aperçu de version (identifiants nuls)", () => {
    const page = normalizePage(
      parsePageResponse(
        pageJson("p", { fr: "x" }, [
          { ...heroBlock(1, 1), id: null },
          {
            id: null,
            collection: "block_cta",
            sort: 2,
            item: {
              id: null,
              tone: "clair",
              translations: [
                { id: null, languages_code: FR, title: "Parlons-en." },
              ],
            },
          },
        ]),
      ),
      FR,
    );
    expect(page?.blocks.map((b) => b.type)).toEqual(["hero", "cta"]);
    // clés de rendu distinctes malgré des identifiants nuls
    const keys = page?.blocks.map((b) => b.key) ?? [];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("refuse les valeurs hors liste (colonnes, variante, position) en revenant au défaut", () => {
    const page = normalizePage(
      parsePageResponse(
        pageJson("p", { fr: "x" }, [
          heroBlock(1, 1, { variant: "néon" }),
          {
            id: 2,
            collection: "block_cards",
            sort: 2,
            item: {
              id: "c",
              columns: "9",
              translations: [
                {
                  languages_code: FR,
                  title: "Cartes",
                  cards: [
                    { title: "A", text: "B", href: "/a/", link_label: "Voir" },
                  ],
                },
              ],
            },
          },
        ]),
      ),
      FR,
    );
    const [hero, cards] = page?.blocks ?? [];
    expect(hero?.type === "hero" && hero.variant).toBe("sombre");
    expect(cards?.type === "cards" && cards.columns).toBe(3);
    expect(cards?.type === "cards" && cards.cards[0]?.href).toBe("/a");
  });

  it("lève une erreur de contenu si aucun bloc n'est affichable", () => {
    expect(() =>
      normalizePage(parsePageResponse(pageJson("p", { fr: "x" }, [])), FR),
    ).toThrow(/aucun bloc/i);
  });

  it("porte les champs SEO et rejette un canonical qui n'est pas une adresse", () => {
    const base = pageJson("p", { fr: "x" }, [heroBlock(1, 1)], {
      noindex: true,
      seo_image: "11111111-1111-4111-8111-111111111111",
    });
    (base.translations as Record<string, unknown>[])[0] = {
      languages_code: FR,
      slug: "x",
      title: "T",
      seo_title: "ST",
      seo_description: "SD",
      canonical: "javascript:alert(1)",
    };
    const page = normalizePage(parsePageResponse(base), FR);
    expect(page).toMatchObject({
      title: "T",
      seoTitle: "ST",
      seoDescription: "SD",
      noindex: true,
      seoImageId: "11111111-1111-4111-8111-111111111111",
      canonical: null,
    });
    const ok = pageJson("p", { fr: "x" }, [heroBlock(1, 1)]);
    (ok.translations as Record<string, unknown>[])[0] = {
      languages_code: FR,
      slug: "x",
      title: "T",
      canonical: "https://nexora.example/x",
    };
    expect(normalizePage(parsePageResponse(ok), FR)?.canonical).toBe(
      "https://nexora.example/x",
    );
  });
});

describe("parsePageResponse", () => {
  it("rejette une réponse qui n'a pas la forme attendue", () => {
    expect(() => parsePageResponse({ id: 12, translations: "non" })).toThrow();
    expect(() => parsePageResponse(null)).toThrow();
  });
});

const one = (block: Record<string, unknown>) =>
  normalizePage(parsePageResponse(pageJson("p", { fr: "x" }, [block])), FR)
    ?.blocks[0];

describe("variantes de composition (S3)", () => {
  it("le ton vaut clair par défaut et refuse toute valeur inconnue", () => {
    const sec = one(sectionBlock(1, 1));
    expect(sec?.type === "section" && sec.tone).toBe("clair");
    const bad = one(sectionBlock(1, 1, { tone: "fluo" }));
    expect(bad?.type === "section" && bad.tone).toBe("clair");
    for (const tone of ["sombre", "clair", "sable"] as const) {
      const b = one(cardsBlock(1, 1, { tone }));
      expect(b?.type === "cards" && b.tone).toBe(tone);
      const f = one(faqBlock(1, 1, { tone }));
      expect(f?.type === "faq" && f.tone).toBe(tone);
    }
  });

  it("le héros et l'appel à l'action acceptent sable ; l'ancien « accent » devient sable", () => {
    const h = one(heroBlock(1, 1, { variant: "sable" }));
    expect(h?.type === "hero" && h.variant).toBe("sable");
    const old = one(ctaBlock(1, 1, { tone: "accent" }));
    expect(old?.type === "cta" && old.tone).toBe("sable");
    const cta = one(ctaBlock(1, 1, { tone: "clair" }));
    expect(cta?.type === "cta" && cta.tone).toBe("clair");
  });

  it("disposition des cartes : grille par défaut ; liste, étapes, modules ; valeur inconnue = grille", () => {
    const d = one(cardsBlock(1, 1));
    expect(d?.type === "cards" && d.layout).toBe("grille");
    for (const layout of ["liste", "etapes", "modules"] as const) {
      const b = one(cardsBlock(1, 1, { layout }));
      expect(b?.type === "cards" && b.layout).toBe(layout);
    }
    const bad = one(cardsBlock(1, 1, { layout: "carrousel" }));
    expect(bad?.type === "cards" && bad.layout).toBe("grille");
  });

  it("statut d'une carte : disponible, pilote, prevu ; le reste est ignoré (jamais d'état inventé)", () => {
    const b = one(cardsBlock(1, 1, { layout: "modules" }));
    expect(b?.type === "cards" && b.cards.map((c) => c.status)).toEqual([
      "pilote",
      null,
      null,
    ]);
  });

  it("schéma d'une section : aucun par défaut, valeurs connues seulement", () => {
    const d = one(sectionBlock(1, 1));
    expect(d?.type === "section" && d.visual).toBe("aucun");
    const v = one(sectionBlock(1, 1, { visual: "perimetre-heberge" }));
    expect(v?.type === "section" && v.visual).toBe("perimetre-heberge");
    const bad = one(sectionBlock(1, 1, { visual: "<script>" }));
    expect(bad?.type === "section" && bad.visual).toBe("aucun");
  });

  it("ancre : motif ^[a-z0-9-]{0,40}$ ; une ancre invalide ou vide est ignorée", () => {
    const ok = one(faqBlock(1, 1, { anchor_id: "questions" }));
    expect(ok?.anchorId).toBe("questions");
    for (const bad of ["Questions", "a b", "x".repeat(41), "", "é", "a_b"]) {
      expect(one(faqBlock(1, 1, { anchor_id: bad }))?.anchorId).toBeNull();
    }
    expect(one(heroBlock(1, 1, { anchor_id: "debut" }))?.anchorId).toBe(
      "debut",
    );
  });
});
