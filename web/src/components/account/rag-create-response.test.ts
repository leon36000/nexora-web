import { describe, expect, it } from "vitest";
import { parseRagCreated, ragErrorKey } from "./rag-create-response";

describe("réponses de POST /api/account/rag (chantier B) : erreurs", () => {
  const openAi = (code: string) => ({
    error: { code, message: "texte du serveur", type: "x", param: null },
  });

  it("chaque code du RAG a son message du panneau", () => {
    expect(ragErrorKey(507, openAi("quota_exceeded"))).toBe("quota_exceeded");
    expect(ragErrorKey(402, openAi("insufficient_quota"))).toBe("no_credits");
    expect(ragErrorKey(409, openAi("base_exists"))).toBe("base_exists");
    expect(ragErrorKey(409, openAi("base_limit"))).toBe("base_limit");
    expect(ragErrorKey(409, openAi("key_limit"))).toBe("key_limit");
    expect(ragErrorKey(409, openAi("model_unavailable"))).toBe(
      "model_unavailable",
    );
    expect(ragErrorKey(503, openAi("rag_unavailable"))).toBe("unavailable");
  });

  it("les erreurs de session, de rôle et de débit (code en texte simple)", () => {
    expect(ragErrorKey(401, { error: "unauthenticated" })).toBe(
      "unauthenticated",
    );
    expect(ragErrorKey(403, { error: "forbidden" })).toBe("forbidden");
    expect(ragErrorKey(429, { error: "rate_limited" })).toBe("rate_limited");
  });

  it("à défaut de code connu, le statut décide, sinon message générique", () => {
    expect(ragErrorKey(429, {})).toBe("rate_limited");
    expect(ragErrorKey(401, null)).toBe("unauthenticated");
    expect(ragErrorKey(500, { error: { code: "internal_error" } })).toBe(
      "generic",
    );
    expect(ragErrorKey(422, { error: "invalid_request", message: "x" })).toBe(
      "generic",
    );
    expect(ragErrorKey(0, undefined)).toBe("generic");
  });

  it("le texte brut du serveur n'est jamais repris (seule une clé de dictionnaire sort)", () => {
    expect(ragErrorKey(409, openAi("code_inconnu"))).toBe("generic");
  });
});

describe("réponse 201 de la création", () => {
  const body = {
    base: { id: "b1", name: "Mon RAG" },
    key: { id: "k1", value: "nxk_abc", prefix: "nxk_a", mode: "write" },
    endpoints: {
      api: "https://s.example/v1/rag",
      mcp: "https://s.example/v1/rag/mcp",
    },
  };

  it("extrait la base, la clé et les adresses", () => {
    expect(parseRagCreated(body)).toEqual({
      baseId: "b1",
      baseName: "Mon RAG",
      keyValue: "nxk_abc",
    });
  });

  it("une réponse sans clé ou sans base n'est pas un succès", () => {
    expect(parseRagCreated({ ...body, key: undefined })).toBeNull();
    expect(parseRagCreated({ ...body, base: {} })).toBeNull();
    expect(parseRagCreated(null)).toBeNull();
    expect(parseRagCreated({ ...body, key: { value: 12 } })).toBeNull();
  });
});
