import { describe, expect, it } from "vitest";
import { embeddingProfile, SUPPORTED_EMBEDDING_MODELS } from "./profiles.ts";

describe("profils des modèles d'embedding du RAG", () => {
  it("connaît les modèles dont la dimension se ramène à 1024", () => {
    expect(SUPPORTED_EMBEDDING_MODELS).toEqual([
      "nexora/qwen3-embedding-8b",
      "nexora/bge-m3-multi-8k",
      "nexora/embeddinggemma-2",
    ]);
  });
  it("Qwen3 Embedding : tronquable (Matryoshka) et consigne de requête", () => {
    const p = embeddingProfile("nexora/qwen3-embedding-8b");
    expect(p?.matryoshka).toBe(true);
    expect(p?.queryPrefix).toMatch(/^Instruct: .*\nQuery: $/s);
  });
  it("BGE-M3 : 1024 natifs, jamais tronqué, requête sans consigne", () => {
    const p = embeddingProfile("nexora/bge-m3-multi-8k");
    expect(p?.matryoshka).toBe(false);
    expect(p?.queryPrefix).toBe("");
  });
  it("refuse un modèle inconnu ou dont la dimension ne tient pas (4096 non tronquable)", () => {
    expect(embeddingProfile("nexora/nemotron-3.5-embed-8b-bf16")).toBeNull();
    expect(embeddingProfile("nexora/autre")).toBeNull();
  });
});
