import { describe, expect, it } from "vitest";
import {
  CODE_70B,
  EMBED_SMALL,
  FIXTURES,
  LONG_CONTEXT,
  MOE_PREVIEW,
  NO_SHEET,
  REASONING_XL,
  VISION_8B_PREVIEW,
} from "./fixtures";
import {
  activeFilters,
  applyQuery,
  catalogFacets,
  compareHref,
  DEFAULT_QUERY,
  MAX_COMPARE,
  normalizeText,
  parseQuery,
  queryHref,
  toggleCompare,
} from "./query";

const ids = (q: Parameters<typeof applyQuery>[1]) =>
  applyQuery(FIXTURES, q).map((m) => m.id);
const q = (raw: Record<string, string | string[]>) => parseQuery(raw);

describe("lecture des paramètres d'adresse", () => {
  it("renvoie la requête par défaut quand il n'y a aucun paramètre", () => {
    expect(parseQuery({})).toEqual(DEFAULT_QUERY);
    expect(DEFAULT_QUERY.sort).toBe("recents");
    expect(DEFAULT_QUERY.view).toBe("cartes");
  });

  it("lit chaque filtre et ignore les valeurs inconnues ou hostiles", () => {
    const parsed = parseQuery({
      q: "  code  ",
      type: "chat",
      entree: ["image", "telepathie", "audio"],
      etiquette: ["code", "inconnue"],
      capacite: ["tools", "streaming-x"],
      editeur: "Éditeur A",
      licence: "ouverte",
      disponibilite: "apercu",
      hebergement: "quebec",
      contexte: "128000",
      "prix-entree": "1",
      "prix-sortie": "5",
      tri: "contexte",
      vue: "tableau",
    });
    expect(parsed).toMatchObject({
      q: "code",
      kind: "chat",
      inputs: ["image", "audio"],
      tags: ["code"],
      capabilities: ["tools"],
      author: "editeur-a",
      license: "ouverte",
      availability: "apercu",
      residency: "quebec",
      minContext: 128_000,
      maxInput: 1,
      maxOutput: 5,
      sort: "contexte",
      view: "tableau",
    });
    expect(
      parseQuery({
        type: "x",
        licence: "y",
        disponibilite: "z",
        hebergement: "lune",
        tri: "hasard",
        vue: "3d",
        contexte: "7",
        "prix-entree": "-1",
        "prix-sortie": "abc",
      }),
    ).toEqual(DEFAULT_QUERY);
  });

  it("accepte l'ancien paramètre unique « capacite » et borne la sélection à comparer", () => {
    expect(q({ capacite: "vision" }).capabilities).toEqual(["vision"]);
    const many = q({
      m: [
        "nexora/a-1",
        "nexora/a-1",
        "nexora/b-2",
        "nexora/c-3",
        "nexora/d-4",
        "nexora/e-5",
        "../etc/passwd",
        "pas un identifiant",
      ],
    });
    expect(many.compare).toEqual([
      "nexora/a-1",
      "nexora/b-2",
      "nexora/c-3",
      "nexora/d-4",
    ]);
    expect(many.compare).toHaveLength(MAX_COMPARE);
  });

  it("« embedding » n'est pas une modalité d'entrée (c'est une sortie)", () => {
    expect(q({ entree: ["embedding", "text"] }).inputs).toEqual(["text"]);
  });

  it("dédoublonne les valeurs répétées", () => {
    expect(q({ etiquette: ["code", "code"] }).tags).toEqual(["code"]);
  });
});

describe("construction de l'adresse", () => {
  it("n'écrit que ce qui s'écarte du défaut, dans un ordre stable", () => {
    expect(queryHref("/modeles", DEFAULT_QUERY)).toBe("/modeles");
    const query = q({ tri: "nom", type: "chat", etiquette: "code", q: "a b" });
    expect(queryHref("/modeles", query)).toBe(
      "/modeles?q=a+b&type=chat&etiquette=code&tri=nom",
    );
  });

  it("applique un correctif sans toucher à la requête d'origine", () => {
    const base = q({ etiquette: "code", m: "nexora/a-1" });
    expect(queryHref("/modeles", base, { tags: [] })).toBe(
      "/modeles?m=nexora%2Fa-1",
    );
    expect(base.tags).toEqual(["code"]);
  });

  it("relit ce qu'elle écrit (aller-retour)", () => {
    const query = q({
      q: "é",
      entree: ["image", "audio"],
      etiquette: ["code", "agents"],
      capacite: ["tools", "reasoning"],
      editeur: "editeur-a",
      licence: "fermee",
      disponibilite: "disponible",
      contexte: "32000",
      "prix-entree": "0.5",
      "prix-sortie": "2",
      tri: "prix-sortie-desc",
      vue: "tableau",
      m: ["nexora/a-1", "nexora/b-2"],
    });
    const href = queryHref("/modeles", query);
    const params = Object.fromEntries(
      [...new URL(href, "https://x.test").searchParams.keys()].map((k) => [
        k,
        new URL(href, "https://x.test").searchParams.getAll(k),
      ]),
    );
    expect(parseQuery(params)).toEqual(query);
  });

  it("bascule un modèle dans la sélection, sans dépasser le maximum", () => {
    let query = DEFAULT_QUERY;
    for (const id of ["nexora/a-1", "nexora/b-2", "nexora/c-3", "nexora/d-4"])
      query = { ...query, compare: toggleCompare(query, id) };
    expect(query.compare).toHaveLength(4);
    expect(toggleCompare(query, "nexora/e-5")).toEqual(query.compare);
    expect(compareHref("/modeles/comparer", query.compare)).toBe(
      "/modeles/comparer?m=nexora%2Fa-1&m=nexora%2Fb-2&m=nexora%2Fc-3&m=nexora%2Fd-4",
    );
    expect(toggleCompare(query, "nexora/b-2")).toEqual([
      "nexora/a-1",
      "nexora/c-3",
      "nexora/d-4",
    ]);
  });
});

describe("filtres", () => {
  it("cherche dans le nom, l'éditeur, la famille et l'identifiant, sans accents ni casse", () => {
    expect(normalizeText("Éditeur À")).toBe("editeur a");
    expect(ids(q({ q: "EDITEUR b" }))).toEqual(
      expect.arrayContaining([VISION_8B_PREVIEW.id, EMBED_SMALL.id]),
    );
    expect(ids(q({ q: "alpha" }))).toEqual(
      expect.arrayContaining([CODE_70B.id, MOE_PREVIEW.id]),
    );
    expect(ids(q({ q: "exemple-long" }))).toEqual([LONG_CONTEXT.id]);
    // plusieurs mots : tous doivent correspondre
    expect(ids(q({ q: "alpha moe" }))).toEqual([MOE_PREVIEW.id]);
    expect(ids(q({ q: "introuvable" }))).toEqual([]);
  });

  it("filtre par type, modalités d'entrée (toutes requises), étiquettes et capacités", () => {
    expect(ids(q({ type: "embedding" }))).toEqual([EMBED_SMALL.id]);
    expect(ids(q({ entree: "image" }))).toEqual(
      expect.arrayContaining([VISION_8B_PREVIEW.id, LONG_CONTEXT.id]),
    );
    expect(ids(q({ entree: ["image", "audio"] }))).toEqual([LONG_CONTEXT.id]);
    expect(ids(q({ etiquette: ["code", "contexte-long"] }))).toEqual([
      MOE_PREVIEW.id,
    ]);
    expect(ids(q({ capacite: ["tools", "vision"] }))).toEqual([
      LONG_CONTEXT.id,
    ]);
    // modèle sans fiche : jamais retenu par une étiquette ou une modalité
    expect(ids(q({ etiquette: "code" }))).not.toContain(NO_SHEET.id);
    expect(ids(q({ entree: "text" }))).not.toContain(NO_SHEET.id);
  });

  it("filtre par éditeur, licence, disponibilité et hébergement", () => {
    expect(ids(q({ editeur: "editeur-a" })).sort()).toEqual(
      [CODE_70B.id, MOE_PREVIEW.id].sort(),
    );
    expect(ids(q({ licence: "fermee" })).sort()).toEqual(
      [LONG_CONTEXT.id, REASONING_XL.id].sort(),
    );
    // licence inconnue : ni ouverte ni fermée
    expect(ids(q({ licence: "ouverte" }))).not.toContain(NO_SHEET.id);
    expect(ids(q({ licence: "fermee" }))).not.toContain(NO_SHEET.id);
    expect(ids(q({ disponibilite: "apercu" })).sort()).toEqual(
      [VISION_8B_PREVIEW.id, MOE_PREVIEW.id].sort(),
    );
    expect(ids(q({ disponibilite: "disponible" }))).not.toContain(
      MOE_PREVIEW.id,
    );
    expect(ids(q({ hebergement: "quebec" }))).toEqual([]);
    expect(ids(q({ hebergement: "etats_unis" }))).toHaveLength(FIXTURES.length);
  });

  it("filtre par contexte minimal et par prix maximal (entrée et sortie)", () => {
    expect(ids(q({ contexte: "256000" })).sort()).toEqual(
      [LONG_CONTEXT.id, MOE_PREVIEW.id].sort(),
    );
    expect(ids(q({ "prix-entree": "0.5" })).sort()).toEqual(
      [CODE_70B.id, VISION_8B_PREVIEW.id, EMBED_SMALL.id].sort(),
    );
    // limite incluse
    expect(ids(q({ "prix-entree": "2" }))).toContain(LONG_CONTEXT.id);
    // sortie : un modèle d'embeddings n'a pas de prix de sortie, il n'est pas retenu
    expect(ids(q({ "prix-sortie": "1" })).sort()).toEqual(
      [CODE_70B.id, VISION_8B_PREVIEW.id].sort(),
    );
  });
});

describe("tri", () => {
  const order = (sort: string, extra: Record<string, string> = {}) =>
    ids(q({ tri: sort, ...extra }));

  it("plus récents d'abord, les modèles sans date à la fin, puis par nom", () => {
    const list = order("recents");
    expect(list.slice(0, 3)).toEqual([
      MOE_PREVIEW.id,
      CODE_70B.id,
      REASONING_XL.id,
    ]);
    expect(list.slice(-2)).toEqual([LONG_CONTEXT.id, NO_SHEET.id]);
  });

  it("prix croissant et décroissant, entrée et sortie", () => {
    expect(order("prix-entree")[0]).toBe(EMBED_SMALL.id);
    expect(order("prix-entree").at(-1)).toBe(REASONING_XL.id);
    expect(order("prix-entree-desc")[0]).toBe(REASONING_XL.id);
    expect(order("prix-sortie")[0]).toBe(VISION_8B_PREVIEW.id);
    expect(order("prix-sortie-desc")[0]).toBe(REASONING_XL.id);
    // sans prix de sortie (embeddings) : toujours en dernier, dans les deux sens
    expect(order("prix-sortie").at(-1)).toBe(EMBED_SMALL.id);
    expect(order("prix-sortie-desc").at(-1)).toBe(EMBED_SMALL.id);
  });

  it("contexte décroissant, nom alphabétique", () => {
    expect(order("contexte")[0]).toBe(LONG_CONTEXT.id);
    expect(order("contexte").at(-1)).toBe(EMBED_SMALL.id);
    const names = applyQuery(FIXTURES, q({ tri: "nom" })).map((m) => m.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "fr")));
  });

  it("ne modifie pas la liste d'origine", () => {
    const copy = [...FIXTURES];
    applyQuery(FIXTURES, q({ tri: "nom" }));
    expect(FIXTURES).toEqual(copy);
  });
});

describe("facettes et filtres actifs", () => {
  it("compte les éditeurs, étiquettes, modalités et hébergements présents au catalogue", () => {
    const f = catalogFacets(FIXTURES);
    expect(f.authors).toEqual([
      { slug: "editeur-a", label: "Éditeur A", count: 2 },
      { slug: "editeur-b", label: "Éditeur B", count: 2 },
      { slug: "editeur-c", label: "Éditeur C", count: 1 },
      { slug: "editeur-d", label: "Éditeur D", count: 1 },
    ]);
    expect(f.tags.code).toBe(2);
    expect(f.tags.embeddings).toBe(1);
    expect(f.tags["poids-ouverts"]).toBe(2);
    expect(f.inputs.image).toBe(2);
    expect(f.inputs.video).toBe(0);
    expect(f.residencies).toEqual(["etats_unis"]);
    expect(f.preview).toBe(2);
    expect(f.live).toBe(5);
  });

  it("liste les filtres actifs avec l'adresse qui retire chacun", () => {
    const query = q({
      etiquette: ["code", "agents"],
      "prix-entree": "1",
      q: "x",
    });
    const active = activeFilters(query);
    expect(active.map((a) => a.key)).toEqual([
      "q",
      "tags:code",
      "tags:agents",
      "maxInput",
    ]);
    const code = active.find((a) => a.key === "tags:code");
    expect(code && queryHref("/modeles", query, code.remove)).toBe(
      "/modeles?q=x&etiquette=agents&prix-entree=1",
    );
    expect(activeFilters(DEFAULT_QUERY)).toEqual([]);
    // tri, vue et sélection à comparer ne sont pas des filtres
    expect(
      activeFilters(q({ tri: "nom", vue: "tableau", m: "nexora/a-1" })),
    ).toEqual([]);
  });
});
