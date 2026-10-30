import { describe, expect, it } from "vitest";
import {
  chunkStorageBytes,
  fitVector,
  RAG_DIMS,
  toVectorLiteral,
  VectorError,
} from "./vector.ts";

const norm = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));

describe("fitVector", () => {
  it("complète par des zéros un vecteur plus court et le normalise (le cosinus est conservé)", () => {
    const raw = [3, 4];
    const out = fitVector(raw, { matryoshka: false });
    expect(out).toHaveLength(RAG_DIMS);
    expect(out[0]).toBeCloseTo(0.6, 6);
    expect(out[1]).toBeCloseTo(0.8, 6);
    expect(out.slice(2).every((x) => x === 0)).toBe(true);
    expect(norm(out)).toBeCloseTo(1, 6);
  });

  it("garde tel quel (à la normalisation près) un vecteur de la bonne taille", () => {
    const raw = Array.from({ length: RAG_DIMS }, (_, i) => (i % 7) + 1);
    const out = fitVector(raw, { matryoshka: false });
    expect(norm(out)).toBeCloseTo(1, 6);
    expect(out[0] ?? 0).toBeCloseTo(1 / norm(raw), 6);
  });

  it("tronque puis renormalise un vecteur plus long quand le modèle est de type Matryoshka", () => {
    const raw = Array.from({ length: 4096 }, (_, i) =>
      i < RAG_DIMS ? 1 : 100,
    );
    const out = fitVector(raw, { matryoshka: true });
    expect(out).toHaveLength(RAG_DIMS);
    expect(norm(out)).toBeCloseTo(1, 6);
    expect(out[0] ?? 0).toBeCloseTo(1 / Math.sqrt(RAG_DIMS), 6);
  });

  it("refuse un vecteur trop long pour un modèle non tronquable", () => {
    expect(() =>
      fitVector(new Array(2048).fill(1), { matryoshka: false }),
    ).toThrow(VectorError);
  });

  it("refuse les valeurs non finies, le vecteur vide et le vecteur nul", () => {
    expect(() => fitVector([1, Number.NaN], { matryoshka: false })).toThrow(
      VectorError,
    );
    expect(() =>
      fitVector([1, Number.POSITIVE_INFINITY], { matryoshka: false }),
    ).toThrow(VectorError);
    expect(() => fitVector([], { matryoshka: false })).toThrow(VectorError);
    expect(() => fitVector([0, 0, 0], { matryoshka: false })).toThrow(
      VectorError,
    );
  });
});

describe("toVectorLiteral", () => {
  it("écrit un littéral pgvector et rien d'autre", () => {
    expect(toVectorLiteral([0.5, -1, 0])).toBe("[0.5,-1,0]");
  });
  it("garde une précision suffisante sans notation exponentielle ambiguë", () => {
    const lit = toVectorLiteral([1e-7, 123456.789]);
    expect(lit).toMatch(/^\[[-0-9.e,+]+\]$/);
    expect(Number(lit.slice(1, -1).split(",")[0])).toBeCloseTo(1e-7, 12);
  });
});

describe("chunkStorageBytes", () => {
  it("compte le texte en octets UTF-8, le vecteur demi-précision et une provision de métadonnées", () => {
    const ascii = chunkStorageBytes("abc");
    const accents = chunkStorageBytes("éèà");
    expect(accents - ascii).toBe(3); // 3 caractères de 2 octets contre 1
    expect(ascii).toBe(3 + RAG_DIMS * 2 + 8 + 256);
  });
});
