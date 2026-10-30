import { describe, expect, it } from "vitest";
import { applyRerank, parseRerankResults, queryTerms } from "./rerank.ts";

describe("parseRerankResults", () => {
  it("lit le format Cohere (results[].index et relevance_score)", () => {
    const out = parseRerankResults(
      {
        results: [
          { index: 2, relevance_score: 0.9 },
          { index: 0, relevance_score: 0.1 },
        ],
      },
      3,
    );
    expect(out).toEqual([
      { index: 2, score: 0.9 },
      { index: 0, score: 0.1 },
    ]);
  });
  it("refuse un index hors limites, répété ou un score non fini", () => {
    expect(
      parseRerankResults({ results: [{ index: 3, relevance_score: 1 }] }, 3),
    ).toBeNull();
    expect(
      parseRerankResults(
        {
          results: [
            { index: 1, relevance_score: 1 },
            { index: 1, relevance_score: 2 },
          ],
        },
        3,
      ),
    ).toBeNull();
    expect(
      parseRerankResults(
        { results: [{ index: 0, relevance_score: Number.NaN }] },
        3,
      ),
    ).toBeNull();
    expect(
      parseRerankResults(
        { results: [{ index: 0, relevance_score: "0.5" }] },
        3,
      ),
    ).toBeNull();
  });
  it("refuse tout ce qui n'a pas la forme attendue", () => {
    expect(parseRerankResults(null, 3)).toBeNull();
    expect(parseRerankResults({}, 3)).toBeNull();
    expect(parseRerankResults({ results: "x" }, 3)).toBeNull();
  });
});

describe("applyRerank", () => {
  const cands = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  it("trie par score décroissant et coupe à topN", () => {
    const out = applyRerank(
      cands,
      [
        { index: 0, score: 0.2 },
        { index: 1, score: 0.9 },
        { index: 2, score: 0.5 },
        { index: 3, score: 0.1 },
      ],
      { topN: 2 },
    );
    expect(out.map((o) => [o.item.id, o.rerankScore])).toEqual([
      ["b", 0.9],
      ["c", 0.5],
    ]);
  });
  it("écarte sous le seuil de score", () => {
    const out = applyRerank(
      cands,
      [
        { index: 0, score: 0.2 },
        { index: 1, score: 0.9 },
      ],
      { topN: 10, minScore: 0.5 },
    );
    expect(out.map((o) => o.item.id)).toEqual(["b"]);
  });
  it("conserve l'ordre d'origine pour les candidats que le reclasseur n'a pas notés, après les notés", () => {
    const out = applyRerank(cands, [{ index: 2, score: 0.4 }], { topN: 10 });
    expect(out.map((o) => o.item.id)).toEqual(["c", "a", "b", "d"]);
    expect(out[1]?.rerankScore).toBeNull();
  });
});

describe("queryTerms", () => {
  it("garde les mots utiles, sans accent perdu, sans doublon, sans mot vide", () => {
    expect(
      queryTerms("Comment annuler la commande de février ? La commande!"),
    ).toEqual(["comment", "annuler", "commande", "février"]);
  });
  it("garde les identifiants et les nombres", () => {
    expect(queryTerms("erreur E_4012 sur v2.3")).toEqual([
      "erreur",
      "e_4012",
      "v2",
    ]);
  });
  it("ne rend que des caractères sûrs pour une requête de recherche plein texte", () => {
    for (const t of queryTerms("a' | b & !(c) :* \\ ; DROP TABLE x --"))
      expect(t).toMatch(/^[\p{L}\p{N}_]+$/u);
  });
  it("limite le nombre de termes", () => {
    const q = Array.from({ length: 100 }, (_, i) => `terme${i}`).join(" ");
    expect(queryTerms(q).length).toBeLessThanOrEqual(24);
  });
  it("rend une liste vide pour une requête sans mot utile", () => {
    expect(queryTerms("le la de ? !")).toEqual([]);
  });
});
