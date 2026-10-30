import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  ANN_SETTINGS,
  deleteDocumentChunksQuery,
  insertChunksQuery,
  lexicalSearchQuery,
  vectorSearchQuery,
} from "./queries.ts";
import { RAG_DIMS } from "./vector.ts";

const dialect = new PgDialect();
const render = (q: Parameters<PgDialect["sqlToQuery"]>[0]) =>
  dialect.sqlToQuery(q);
const vec = new Array(RAG_DIMS).fill(0).map((_, i) => (i === 0 ? 1 : 0));

describe("requêtes SQL du RAG : tout ce qui vient de l'extérieur est un paramètre lié", () => {
  const hostile = "x'; DROP TABLE rag_chunks; --";

  it("recherche vectorielle : cosinus sur halfvec, filtre organisation ET base, documents prêts seulement", () => {
    const { sql, params } = render(
      vectorSearchQuery({
        organizationId: "org_a",
        baseId: "11111111-1111-1111-1111-111111111111",
        vector: vec,
        limit: 30,
      }),
    );
    expect(sql).toMatch(/<=>/);
    expect(sql).toContain("halfvec");
    expect(sql).toMatch(/x\."organization_id" = \$\d+/);
    expect(sql).toMatch(/x\."base_id" = \$\d+/);
    expect(sql).toMatch(/d\."status" = 'ready'/);
    expect(sql).toMatch(/LIMIT \$\d+/);
    expect(params).toContain("org_a");
    expect(params).toContain(30);
  });

  it("n'interpole jamais une valeur : une chaîne hostile ne se retrouve que dans les paramètres", () => {
    const v = render(
      vectorSearchQuery({
        organizationId: hostile,
        baseId: hostile,
        vector: vec,
        limit: 5,
      }),
    );
    const l = render(
      lexicalSearchQuery({
        organizationId: hostile,
        baseId: hostile,
        tsQuery: hostile,
        limit: 5,
      }),
    );
    for (const q of [v, l]) {
      expect(q.sql).not.toContain("DROP TABLE");
      expect(q.sql).not.toContain(hostile);
      expect(q.params).toContain(hostile);
    }
  });

  it("recherche plein texte : to_tsquery 'simple' sur le vecteur de texte, même filtre d'isolation", () => {
    const { sql } = render(
      lexicalSearchQuery({
        organizationId: "o",
        baseId: "b",
        tsQuery: "a | b",
        limit: 10,
      }),
    );
    expect(sql).toMatch(/to_tsquery\('simple', \$\d+\)/);
    expect(sql).toMatch(/x\."organization_id" = \$\d+/);
    expect(sql).toMatch(/x\."base_id" = \$\d+/);
    expect(sql).toMatch(/ts_rank_cd/);
  });

  it("refuse une limite ou un vecteur incohérents avant d'écrire le SQL", () => {
    expect(() =>
      vectorSearchQuery({
        organizationId: "o",
        baseId: "b",
        vector: [1, 2],
        limit: 5,
      }),
    ).toThrow(/dimension/);
    expect(() =>
      vectorSearchQuery({
        organizationId: "o",
        baseId: "b",
        vector: vec,
        limit: 0,
      }),
    ).toThrow(/limite/);
    expect(() =>
      lexicalSearchQuery({
        organizationId: "o",
        baseId: "b",
        tsQuery: "a",
        limit: 100_000,
      }),
    ).toThrow(/limite/);
  });

  it("insertion en lot : une ligne de paramètres par extrait, vecteur en demi-précision", () => {
    const rows = [0, 1].map((ord) => ({
      documentId: "d",
      baseId: "b",
      organizationId: "o",
      ord,
      content: hostile,
      heading: null,
      startChar: 0,
      endChar: 10,
      page: null,
      vector: vec,
    }));
    const { sql, params } = render(insertChunksQuery(rows));
    expect(sql).toMatch(/^insert into "rag_chunks"/i);
    expect(sql).toContain("halfvec(1024)");
    expect(sql).not.toContain(hostile);
    expect(params.filter((p) => p === hostile)).toHaveLength(2);
  });

  it("l'insertion vide est refusée", () => {
    expect(() => insertChunksQuery([])).toThrow();
  });

  it("suppression des extraits d'un document : bornée par organisation", () => {
    const { sql, params } = render(
      deleteDocumentChunksQuery({ organizationId: "o", documentId: "d" }),
    );
    expect(sql).toMatch(/delete from "rag_chunks"/i);
    expect(sql).toMatch(/"organization_id" = \$\d+/);
    expect(params).toEqual(["d", "o"]);
  });

  it("réglages de l'index approché (parcours itératif pour les filtres)", () => {
    const texts = ANN_SETTINGS.map((s) => render(s).sql);
    expect(texts.join(" ")).toMatch(/hnsw\.iterative_scan/);
    expect(texts.join(" ")).toMatch(/hnsw\.ef_search/);
    expect(texts.every((t) => t.startsWith("SET LOCAL"))).toBe(true);
  });
});
