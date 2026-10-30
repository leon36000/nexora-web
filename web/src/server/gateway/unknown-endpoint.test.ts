import { describe, expect, it } from "vitest";
import { handleUnknownEndpoint } from "./errors";

describe("adresse inconnue sous /v1", () => {
  it("répond 404 au format d'erreur OpenAI, pas par une page HTML", async () => {
    const res = handleUnknownEndpoint(
      new Request("http://localhost/v1/completions", { method: "POST" }),
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.error).toMatchObject({
      type: "invalid_request_error",
      code: "unknown_url",
      param: null,
    });
    expect(body.error.message).toContain("/v1/completions");
    expect(body.error.message).toContain("/v1/chat/completions");
    expect(body.error.message).toContain("/v1/rerank");
    expect(body.error.message).toContain("/v1/rag/");
  });

  it("n'écho pas un chemin démesuré ni du contenu injecté", async () => {
    const res = handleUnknownEndpoint(
      new Request(`http://localhost/v1/${"x".repeat(5000)}`),
    );
    expect((await res.json()).error.message.length).toBeLessThan(400);
  });
});
