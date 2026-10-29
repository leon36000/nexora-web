import { describe, expect, it } from "vitest";
import type { TrustedHttpClient } from "./http.ts";
import { SafeFetchError } from "./http.ts";
import {
  createHttpRenderer,
  RenderBlockedHostError,
  RenderError,
} from "./renderer.ts";

function clientReplying(
  status: number,
  json: unknown,
  seen: Array<{ method: string; url: string; opts: unknown }> = [],
): Pick<TrustedHttpClient, "request"> {
  return {
    request: async (method, url, opts) => {
      seen.push({ method, url, opts });
      return {
        url,
        status,
        headers: {},
        body: new TextEncoder().encode(JSON.stringify(json)),
        redirects: 0,
      };
    },
  };
}

describe("client du service de rendu", () => {
  it("envoie l'adresse, l'attente et les hôtes approuvés avec le secret de service", async () => {
    const seen: Array<{ method: string; url: string; opts: unknown }> = [];
    const r = createHttpRenderer(
      clientReplying(
        200,
        { html: "<p>x</p>", status: 200, url: "https://a.test/f" },
        seen,
      ),
      "http://navigateur:8700",
      "secret-de-service",
    );
    const out = await r.render("https://a.test/", {
      waitMs: 250,
      approveHosts: ["b.test"],
    });
    expect(out).toEqual({
      html: "<p>x</p>",
      status: 200,
      url: "https://a.test/f",
    });
    expect(seen[0]).toMatchObject({
      method: "POST",
      url: "http://navigateur:8700/render",
      opts: {
        json: {
          url: "https://a.test/",
          wait_ms: 250,
          approve_hosts: ["b.test"],
        },
        headers: { authorization: "Bearer secret-de-service" },
      },
    });
  });

  it("traduit une redirection vers un hôte non approuvé", async () => {
    const r = createHttpRenderer(
      clientReplying(422, {
        error: {
          code: "redirect_blocked",
          host: "autre.test",
          url: "https://autre.test/x",
        },
      }),
      "http://navigateur:8700",
      "s",
    );
    await expect(
      r.render("https://a.test/", { waitMs: 0, approveHosts: [] }),
    ).rejects.toMatchObject({
      name: "RenderBlockedHostError",
      host: "autre.test",
      url: "https://autre.test/x",
    });
    await expect(
      r.render("https://a.test/", { waitMs: 0, approveHosts: [] }),
    ).rejects.toBeInstanceOf(RenderBlockedHostError);
  });

  it("traduit les autres échecs sans divulguer le corps de la réponse", async () => {
    const make = (status: number, code: string) =>
      createHttpRenderer(
        clientReplying(status, {
          error: { code, message: "détail interne /etc" },
        }),
        "http://navigateur:8700",
        "s",
      ).render("https://a.test/", { waitMs: 0, approveHosts: [] });
    await expect(make(504, "render_timeout")).rejects.toMatchObject({
      name: "SafeFetchError",
      code: "target_timeout",
    });
    await expect(make(400, "url_not_allowed")).rejects.toMatchObject({
      code: "url_not_allowed",
    });
    for (const [status, code] of [
      [502, "render_failed"],
      [401, "unauthorized"],
      [500, "internal_error"],
    ] as const) {
      const e = await make(status, code).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(RenderError);
      expect((e as Error).message).not.toContain("etc");
    }
  });

  it("refuse une réponse inattendue", async () => {
    const r = createHttpRenderer(
      clientReplying(200, { html: 5 }),
      "http://navigateur:8700",
      "s",
    );
    await expect(
      r.render("https://a.test/", { waitMs: 0, approveHosts: [] }),
    ).rejects.toBeInstanceOf(RenderError);
  });

  it("laisse passer les erreurs de réseau du client sûr", async () => {
    const r = createHttpRenderer(
      {
        request: async () => {
          throw new SafeFetchError(
            "target_unreachable",
            "la cible n'a pas répondu",
          );
        },
      },
      "http://navigateur:8700",
      "s",
    );
    await expect(
      r.render("https://a.test/", { waitMs: 0, approveHosts: [] }),
    ).rejects.toMatchObject({ code: "target_unreachable" });
  });
});
