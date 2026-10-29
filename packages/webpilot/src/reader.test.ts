import { describe, expect, it } from "vitest";
import type { Format } from "./content.ts";
import {
  SafeFetchError,
  type SafeHttpClient,
  type SafeResponse,
} from "./http.ts";
import { type Renderer, readPage } from "./reader.ts";

function res(partial: Partial<SafeResponse> & { text?: string }): SafeResponse {
  return {
    url: "https://a.test/p",
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    body: new TextEncoder().encode(
      partial.text ?? "<h1>Titre</h1><a href='/x'>x</a>",
    ),
    redirects: 0,
    ...partial,
  };
}

function setup(response: SafeResponse | Error, allowed = true) {
  const hops: string[] = [];
  const client: SafeHttpClient = {
    check: async (u) => new URL(u),
    get: async (u, o) => {
      await o?.beforeHop?.(new URL(u));
      hops.push(u);
      if (response instanceof Error) throw response;
      return response;
    },
  };
  const robots = { allowed: async () => allowed };
  return { deps: { client, robots }, hops };
}

const base = {
  url: "https://a.test/p",
  formats: ["markdown"] as Format[],
  onlyMainContent: true,
  render: "static" as const,
};

describe("lecture d'une page", () => {
  it("lit une page HTML", async () => {
    const { deps } = setup(res({}));
    const out = await readPage(deps, base);
    expect(out.kind).toBe("page");
    if (out.kind !== "page") return;
    expect(out.status).toBe(200);
    expect(out.content.markdown).toBe("# Titre\n\n[x](https://a.test/x)");
    expect(out.render).toBe("static");
  });

  it("une page refusée par robots.txt n'est pas lue", async () => {
    const { deps, hops } = setup(res({}), false);
    const out = await readPage(deps, base);
    expect(out).toEqual({ kind: "robots_blocked", url: "https://a.test/p" });
    expect(hops).toEqual([]);
  });

  it("un statut 4xx ou 5xx de la cible n'est pas une page lue", async () => {
    expect(
      await readPage(setup(res({ status: 404 })).deps, base),
    ).toMatchObject({
      kind: "http_error",
      status: 404,
    });
    expect(
      await readPage(setup(res({ status: 503 })).deps, base),
    ).toMatchObject({
      kind: "http_error",
      status: 503,
    });
  });

  it("un contenu qui n'est pas du texte (PDF, image) n'est pas pris en charge", async () => {
    const out = await readPage(
      setup(res({ headers: { "content-type": "application/pdf" } })).deps,
      base,
    );
    expect(out).toMatchObject({
      kind: "unsupported",
      contentType: "application/pdf",
    });
  });

  it("texte brut et JSON repris tels quels", async () => {
    const out = await readPage(
      setup(res({ headers: { "content-type": "text/plain" }, text: "Bonjour" }))
        .deps,
      base,
    );
    expect(out.kind === "page" && out.content.markdown).toBe("Bonjour");
  });

  it("propage les erreurs de la cible", async () => {
    const { deps } = setup(new SafeFetchError("target_timeout", "x"));
    await expect(readPage(deps, base)).rejects.toMatchObject({
      code: "target_timeout",
    });
  });

  it("vérifie robots.txt à chaque saut et l'appelant peut refuser un saut", async () => {
    const seen: string[] = [];
    const client: SafeHttpClient = {
      check: async (u) => new URL(u),
      get: async (u, o) => {
        await o?.beforeHop?.(new URL(u));
        await o?.beforeHop?.(new URL("https://b.test/final"));
        return res({});
      },
    };
    const robots = { allowed: async (u: URL) => u.hostname !== "b.test" };
    expect(await readPage({ client, robots }, base)).toMatchObject({
      kind: "robots_blocked",
      url: "https://b.test/final",
    });
    await expect(
      readPage(
        { client, robots: { allowed: async () => true } },
        { ...base, beforeHop: async (u) => void seen.push(u.hostname) },
      ),
    ).resolves.toMatchObject({ kind: "page" });
    expect(seen).toEqual(["a.test", "b.test"]);
  });

  it("renvoie les liens à suivre quand on les demande", async () => {
    const { deps } = setup(
      res({ text: "<a href='/a'>A</a><a href='https://z.test/'>Z</a>" }),
    );
    const out = await readPage(deps, { ...base, followLinks: true });
    expect(out.kind === "page" && out.followLinks).toEqual([
      "https://a.test/a",
      "https://z.test/",
    ]);
  });
});

describe("rendu par navigateur", () => {
  const renderer: Renderer = {
    render: async (url) => ({
      html: "<main><h1>Rendu</h1></main>",
      status: 200,
      url,
    }),
  };

  it("sans service de rendu : refus explicite", async () => {
    const { deps } = setup(res({}));
    await expect(
      readPage(deps, { ...base, render: "browser" }),
    ).rejects.toMatchObject({
      code: "render_unavailable",
    });
  });

  it("avec le service : le HTML rendu est converti, l'adresse est validée avant l'envoi", async () => {
    const { deps, hops } = setup(res({}));
    const out = await readPage(
      { ...deps, renderer },
      { ...base, render: "browser" },
    );
    expect(out.kind === "page" && out.content.markdown).toBe("# Rendu");
    expect(out.kind === "page" && out.render).toBe("browser");
    expect(hops).toEqual([]);
  });

  it("le service ne reçoit jamais une adresse refusée par la garde", async () => {
    const calls: string[] = [];
    const client: SafeHttpClient = {
      check: async () => {
        throw new SafeFetchError("url_not_allowed", "privé");
      },
      get: async () => res({}),
    };
    const r: Renderer = {
      render: async (u) => (calls.push(u), { html: "", status: 200, url: u }),
    };
    await expect(
      readPage(
        { client, robots: { allowed: async () => true }, renderer: r },
        { ...base, render: "browser" },
      ),
    ).rejects.toMatchObject({ code: "url_not_allowed" });
    expect(calls).toEqual([]);
  });
});
