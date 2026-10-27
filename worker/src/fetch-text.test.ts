import { describe, expect, it } from "vitest";
import { fetchPublicText } from "./fetch-text.ts";

const PUBLIC = async () => ["93.184.216.34"];
const res = (body: string, init: ResponseInit = {}) =>
  new Response(body, { status: 200, ...init });

describe("lecture d'un fichier de sommes public (HTTPS, gardes SSRF)", () => {
  it("lit le texte d'une adresse HTTPS publique", async () => {
    const seen: string[] = [];
    const text = await fetchPublicText("https://cloud.debian.org/SHA512SUMS", {
      resolve: PUBLIC,
      fetchImpl: (async (u: string) => {
        seen.push(u);
        return res("abc  fichier\n");
      }) as unknown as typeof fetch,
    });
    expect(text).toBe("abc  fichier\n");
    expect(seen).toEqual(["https://cloud.debian.org/SHA512SUMS"]);
  });

  it("refuse le HTTP en clair et un nom qui résout vers le réseau interne, sans rien envoyer", async () => {
    let called = 0;
    const fetchImpl = (async () => {
      called++;
      return res("x");
    }) as unknown as typeof fetch;
    await expect(
      fetchPublicText("http://cloud.debian.org/SHA512SUMS", {
        resolve: PUBLIC,
        fetchImpl,
      }),
    ).rejects.toThrow(/HTTPS/);
    await expect(
      fetchPublicText("https://interne.exemple/SHA512SUMS", {
        resolve: async () => ["10.0.0.5"],
        fetchImpl,
      }),
    ).rejects.toThrow(/refusée|interne/);
    await expect(
      fetchPublicText("https://169.254.169.254/latest", { fetchImpl }),
    ).rejects.toThrow();
    expect(called).toBe(0);
  });

  it("suit une redirection HTTPS en re-vérifiant chaque étape, et refuse celle qui mène au réseau interne", async () => {
    const hops: string[] = [];
    const fetchImpl = (async (u: string) => {
      hops.push(u);
      if (u.endsWith("/a"))
        return new Response(null, {
          status: 302,
          headers: { location: "https://miroir.exemple/b" },
        });
      return res("ok");
    }) as unknown as typeof fetch;
    expect(
      await fetchPublicText("https://cloud.exemple/a", {
        resolve: PUBLIC,
        fetchImpl,
      }),
    ).toBe("ok");
    expect(hops).toEqual([
      "https://cloud.exemple/a",
      "https://miroir.exemple/b",
    ]);

    const evil = (async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://169.254.169.254/x" },
      })) as unknown as typeof fetch;
    await expect(
      fetchPublicText("https://cloud.exemple/a", {
        resolve: PUBLIC,
        fetchImpl: evil,
      }),
    ).rejects.toThrow();
  });

  it("limite le nombre de redirections, la taille et refuse une réponse en erreur", async () => {
    const loop = (async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://cloud.exemple/a" },
      })) as unknown as typeof fetch;
    await expect(
      fetchPublicText("https://cloud.exemple/a", {
        resolve: PUBLIC,
        fetchImpl: loop,
      }),
    ).rejects.toThrow(/redirections/);
    const big = (async () =>
      res("x".repeat(600_000))) as unknown as typeof fetch;
    await expect(
      fetchPublicText("https://cloud.exemple/a", {
        resolve: PUBLIC,
        fetchImpl: big,
      }),
    ).rejects.toThrow(/volumineux/);
    const notFound = (async () =>
      res("non", { status: 404 })) as unknown as typeof fetch;
    await expect(
      fetchPublicText("https://cloud.exemple/a", {
        resolve: PUBLIC,
        fetchImpl: notFound,
      }),
    ).rejects.toThrow(/404/);
  });
});
