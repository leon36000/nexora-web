import { describe, expect, it } from "vitest";
import type { SafeHttpClient } from "./http.ts";
import { SearchError, searchWeb } from "./search.ts";

function clientReturning(
  status: number,
  body: unknown,
  calls: string[] = [],
): SafeHttpClient {
  return {
    post: async () => {
      throw new Error("non utilisé");
    },
    check: async (u) => new URL(u),
    get: async (u) => {
      calls.push(u);
      return {
        url: u,
        status,
        headers: { "content-type": "application/json" },
        body: new TextEncoder().encode(
          typeof body === "string" ? body : JSON.stringify(body),
        ),
        redirects: 0,
      };
    },
  };
}

describe("recherche (SearXNG)", () => {
  it("interroge le service en JSON et classe les résultats", async () => {
    const calls: string[] = [];
    const out = await searchWeb(
      clientReturning(
        200,
        {
          results: [
            { title: "A", url: "https://a.test/", content: "extrait a" },
            { title: "B", url: "https://b.test/", content: "extrait b" },
            { title: "C", url: "https://c.test/" },
          ],
        },
        calls,
      ),
      "http://searxng:8080",
      {
        query: "assurance habitation",
        limit: 2,
        language: "fr",
        country: "CA",
      },
    );
    expect(out).toEqual([
      { rank: 1, title: "A", url: "https://a.test/", snippet: "extrait a" },
      { rank: 2, title: "B", url: "https://b.test/", snippet: "extrait b" },
    ]);
    const u = new URL(calls[0] as string);
    expect(u.origin).toBe("http://searxng:8080");
    expect(u.pathname).toBe("/search");
    expect(u.searchParams.get("q")).toBe("assurance habitation");
    expect(u.searchParams.get("format")).toBe("json");
    expect(u.searchParams.get("language")).toBe("fr-CA");
  });

  it("écarte les résultats sans adresse http(s) valide et les doublons", async () => {
    const out = await searchWeb(
      clientReturning(200, {
        results: [
          { title: "x", url: "javascript:alert(1)" },
          { title: "y", url: "file:///etc/passwd" },
          { title: "z", url: "https://z.test/" },
          { title: "z2", url: "https://z.test/" },
          { url: "pas une url" },
        ],
      }),
      "http://s:8080",
      { query: "q", limit: 10 },
    );
    expect(out.map((r) => r.url)).toEqual(["https://z.test/"]);
  });

  it("langue seule, pays seul", async () => {
    const calls: string[] = [];
    await searchWeb(
      clientReturning(200, { results: [] }, calls),
      "http://s:8080",
      { query: "q", limit: 3, language: "en" },
    );
    await searchWeb(
      clientReturning(200, { results: [] }, calls),
      "http://s:8080",
      { query: "q", limit: 3, country: "CA" },
    );
    expect(new URL(calls[0] as string).searchParams.get("language")).toBe("en");
    expect(new URL(calls[1] as string).searchParams.get("language")).toBe(
      "all",
    );
  });

  it("réponse en erreur ou illisible : erreur de la cible, rien à facturer", async () => {
    await expect(
      searchWeb(clientReturning(500, "oups"), "http://s:8080", {
        query: "q",
        limit: 3,
      }),
    ).rejects.toBeInstanceOf(SearchError);
    await expect(
      searchWeb(clientReturning(200, "pas du json"), "http://s:8080", {
        query: "q",
        limit: 3,
      }),
    ).rejects.toBeInstanceOf(SearchError);
  });
});
