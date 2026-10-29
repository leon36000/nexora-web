import { describe, expect, it } from "vitest";
import { modelsListUrl, testProvider } from "./provider-test";

describe("adresse de la liste des modèles", () => {
  it.each([
    // Adresses de base livrées par les fournisseurs : la liste est toujours « <base>/models ».
    [
      "openai_compatible",
      "https://api.deepseek.com/v1",
      "https://api.deepseek.com/v1/models",
    ],
    [
      "openai_compatible",
      "https://api.moonshot.ai/v1/",
      "https://api.moonshot.ai/v1/models",
    ],
    [
      "openai_compatible",
      "https://api.z.ai/api/paas/v4",
      "https://api.z.ai/api/paas/v4/models",
    ],
    [
      "openai_compatible",
      "https://api.deepinfra.com/v1/openai",
      "https://api.deepinfra.com/v1/openai/models",
    ],
    [
      "openrouter",
      "https://openrouter.ai/api/v1",
      "https://openrouter.ai/api/v1/models",
    ],
    // Hôte nu : la convention OpenAI place l'API sous /v1.
    [
      "openai_compatible",
      "https://llm.interne.exemple",
      "https://llm.interne.exemple/v1/models",
    ],
    ["vllm", "http://vllm:8000/", "http://vllm:8000/v1/models"],
    ["ollama", "http://ollama:11434/v1", "http://ollama:11434/api/tags"],
    ["ollama", "http://ollama:11434", "http://ollama:11434/api/tags"],
  ] as const)("%s %s", (type, base, expected) => {
    expect(modelsListUrl(type, base)).toBe(expected);
  });
});

describe("tester la connexion", () => {
  it("interroge la bonne adresse pour Z.ai et DeepInfra, avec la clé du coffre", async () => {
    const seen: string[] = [];
    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(String(input));
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer sk-x",
      );
      return Response.json({ data: [{ id: "a" }] });
    }) as typeof fetch;
    for (const baseUrl of [
      "https://api.z.ai/api/paas/v4",
      "https://api.deepinfra.com/v1/openai",
    ]) {
      const r = await testProvider(
        { type: "openai_compatible", baseUrl, secretRef: "llm.x" },
        {
          getSecret: async () => "sk-x",
          secretHosts: () => null,
          fetch: fetchFn,
        },
      );
      expect(r.ok).toBe(true);
    }
    expect(seen).toEqual([
      "https://api.z.ai/api/paas/v4/models",
      "https://api.deepinfra.com/v1/openai/models",
    ]);
  });

  it("explique en français un refus de clé (401) et une clé absente du coffre", async () => {
    const refuse = (async () =>
      Response.json({}, { status: 401 })) as typeof fetch;
    const r401 = await testProvider(
      {
        type: "openai_compatible",
        baseUrl: "https://api.deepseek.com/v1",
        secretRef: "llm.x",
      },
      { getSecret: async () => "sk-x", secretHosts: () => null, fetch: refuse },
    );
    expect(r401).toMatchObject({ ok: false });
    expect(r401.detail).toContain("401");
    expect(r401.detail).toMatch(/clé/i);
    const absent = await testProvider(
      {
        type: "openai_compatible",
        baseUrl: "https://api.deepseek.com/v1",
        secretRef: "llm.x",
      },
      {
        getSecret: async () => {
          throw new Error("absent");
        },
        secretHosts: () => null,
        fetch: refuse,
      },
    );
    expect(absent.detail).toContain("coffre");
  });
});
