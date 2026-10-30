import { describe, expect, it } from "vitest";
import { buildRagSnippets } from "./rag-connect";

const input = {
  apiUrl: "https://site.example/v1/rag",
  mcpUrl: "https://site.example/v1/rag/mcp",
  placeholders: {
    key: "VOTRE_CLE_API",
    baseId: "ID_DE_LA_BASE",
    question: "Votre question",
  },
};

describe("extraits de connexion au RAG", () => {
  it("sans clé : l'espace réservé remplace la clé partout, jamais une vraie valeur", () => {
    const s = buildRagSnippets({ ...input, key: null, baseId: null });
    for (const text of [s.code, s.mcp, s.http])
      expect(text).toContain("VOTRE_CLE_API");
    expect(s.http).toContain("ID_DE_LA_BASE");
    expect(s.http).toContain('"query": "Votre question"');
  });

  it("avec la clé fraîchement créée : elle est dans chaque extrait, et seulement dans l'en-tête Authorization", () => {
    const s = buildRagSnippets({
      ...input,
      key: "nxk_secret123",
      baseId: "b-42",
    });
    for (const text of [s.code, s.mcp, s.http]) {
      expect(text).toContain("Bearer nxk_secret123");
      expect(text.match(/nxk_secret123/g)?.length).toBe(1);
      expect(text).not.toContain("VOTRE_CLE_API");
    }
    expect(s.http).toContain("/bases/b-42/query");
  });

  it("les extraits JSON sont du JSON valide qui pointe vers le serveur MCP", () => {
    const s = buildRagSnippets({ ...input, key: "nxk_k", baseId: null });
    const code = JSON.parse(s.code);
    expect(code.mcp["nexora-rag"]).toMatchObject({
      type: "remote",
      url: "https://site.example/v1/rag/mcp",
      headers: { Authorization: "Bearer nxk_k" },
    });
    const generic = JSON.parse(s.mcp);
    expect(generic.mcpServers["nexora-rag"]).toMatchObject({
      type: "http",
      url: "https://site.example/v1/rag/mcp",
      headers: { Authorization: "Bearer nxk_k" },
    });
  });

  it("l'appel HTTP vise l'API du RAG avec POST et un corps JSON", () => {
    const s = buildRagSnippets({ ...input, key: null, baseId: "b1" });
    expect(s.http).toContain("curl -X POST");
    expect(s.http).toContain("'https://site.example/v1/rag/bases/b1/query'");
    expect(s.http).toContain("Content-Type: application/json");
  });

  it("une valeur hostile ne casse ni le JSON ni la commande shell", () => {
    const evil = `k"}, "x": {"y`;
    const s = buildRagSnippets({ ...input, key: evil, baseId: null });
    expect(() => JSON.parse(s.code)).not.toThrow();
    expect(JSON.parse(s.code).mcp["nexora-rag"].headers.Authorization).toBe(
      `Bearer ${evil}`,
    );
    // Une apostrophe dans la clé est échappée : elle ne ferme pas le mot entre apostrophes.
    const quote = buildRagSnippets({
      ...input,
      key: "k'; rm -rf ~; '",
      baseId: null,
    });
    expect(quote.http).toContain("k'\\''; rm -rf ~; '\\''");
    expect(quote.http).not.toContain("k'; rm");
  });
});
