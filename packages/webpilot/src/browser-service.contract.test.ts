import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  RenderBlockedError,
  RenderFailedError,
} from "../../../services/webpilot-browser/src/browser.ts";
import { configFromEnv } from "../../../services/webpilot-browser/src/config.ts";
import { createServer } from "../../../services/webpilot-browser/src/server.ts";
import {
  type BrowserDriver,
  SessionManager,
} from "../../../services/webpilot-browser/src/sessions.ts";
import {
  BrowserServiceError,
  createBrowserService,
} from "./browser-service.ts";
import { createSafeHttpClient } from "./http.ts";
import {
  createHttpRenderer,
  RenderBlockedHostError,
  RenderError,
} from "./renderer.ts";

/**
 * Contrat entre le client du site (ce paquet) et le VRAI serveur du service de navigateur (sans Chromium : un faux
 * pilote), par une vraie connexion HTTP. Si l'un des deux change de protocole, cet essai casse.
 */
const SECRET = "contrat-de-service-a-service-0123456789abcdef";
let server: ReturnType<typeof createServer>;
let base = "";
let renderMode: "ok" | "blocked" | "timeout" | "failed" = "ok";
const seen: unknown[] = [];

beforeAll(async () => {
  const config = configFromEnv({ WEBPILOT_BROWSER_SECRET: SECRET });
  const driver: BrowserDriver = {
    async launch() {
      return {
        async run(actions, ctx) {
          seen.push({ actions, approveHosts: ctx.approveHosts });
          return {
            results: actions.map((a) =>
              a.type === "read"
                ? {
                    type: "read",
                    ok: true,
                    html: "<p>x</p>",
                    url: "https://a.test/",
                    title: "T",
                  }
                : { type: a.type, ok: true },
            ),
            url: "https://a.test/",
            title: "T",
          };
        },
        onCrash() {},
        async close() {},
      };
    },
  };
  const manager = new SessionManager({
    driver,
    now: () => Date.now(),
    maxSessions: 3,
    maxSeconds: config.maxSeconds,
    maxIdleSeconds: config.maxIdleSeconds,
    tombstoneMs: 60_000,
  });
  server = createServer({
    config,
    manager,
    render: async (input) => {
      seen.push(input);
      if (renderMode === "blocked")
        throw new RenderBlockedError("autre.test", "https://autre.test/x");
      if (renderMode === "timeout") throw new RenderFailedError("timeout");
      if (renderMode === "failed")
        throw new RenderFailedError("navigation_failed");
      return { html: "<main>ok</main>", status: 200, url: input.url };
    },
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});

const client = () =>
  createSafeHttpClient({
    userAgent: "t",
    allowedPorts: [Number(new URL(base).port)],
    maxBytes: 1_000_000,
    timeoutMs: 5000,
    maxRedirects: 0,
    trustedHosts: ["127.0.0.1"],
  });

describe("client des sessions <-> serveur du service", () => {
  it("ouvre, exécute, lit l'état et ferme avec les formes que le serveur attend et rend", async () => {
    const svc = createBrowserService(client(), base, SECRET);
    const opened = await svc.open({
      id: "ses_contrat",
      maxSeconds: 120,
      idleSeconds: 30,
      viewport: { width: 800, height: 600 },
      locale: "fr-CA",
      timezone: "America/Toronto",
    });
    expect(opened).toMatchObject({ id: "ses_contrat", status: "open" });
    expect(opened.expiresAt.getTime()).toBeGreaterThan(Date.now());
    const run = await svc.run(
      "ses_contrat",
      [
        { type: "goto", url: "https://a.test/" },
        { type: "read" },
        { type: "wait", for: "ms", ms: 10 },
      ],
      { approveHosts: ["a.test"] },
    );
    expect(run).toMatchObject({
      completed: true,
      url: "https://a.test/",
      title: "T",
    });
    expect(run.results).toHaveLength(3);
    expect((await svc.get("ses_contrat")).status).toBe("open");
    const closed = await svc.close("ses_contrat", "insufficient_quota");
    expect(closed).toMatchObject({
      status: "closed",
      closeReason: "insufficient_quota",
    });
    const error = await svc
      .run("ses_contrat", [{ type: "read" }], { approveHosts: [] })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BrowserServiceError);
    expect((error as BrowserServiceError).code).toBe("session_closed");
    expect((error as BrowserServiceError).closeReason).toBe(
      "insufficient_quota",
    );
  });

  it("un secret faux est refusé (unauthorized) ; une session inconnue est not_found", async () => {
    const wrong = createBrowserService(
      client(),
      base,
      "faux-secret-faux-secret-faux-secret-xx",
    );
    const e1 = await wrong.get("ses_x").catch((e: unknown) => e);
    expect((e1 as BrowserServiceError).code).toBe("unauthorized");
    const e2 = await createBrowserService(client(), base, SECRET)
      .get("ses_inconnue")
      .catch((e: unknown) => e);
    expect((e2 as BrowserServiceError).code).toBe("not_found");
  });

  it("une action hors liste est refusée par le serveur avec sa position", async () => {
    const svc = createBrowserService(client(), base, SECRET);
    await svc.open({ id: "ses_liste", maxSeconds: 60, idleSeconds: 30 });
    const e = await svc
      .run("ses_liste", [{ type: "read" }, { type: "evaluate" } as never], {
        approveHosts: [],
      })
      .catch((x: unknown) => x);
    expect((e as BrowserServiceError).code).toBe("invalid_request");
    expect((e as BrowserServiceError).index).toBe(1);
    await svc.close("ses_liste", "closed_by_client");
  });
});

describe("client de rendu <-> serveur du service", () => {
  it("rend, relaie les hôtes approuvés, et traduit les échecs", async () => {
    const r = createHttpRenderer(client(), base, SECRET);
    seen.length = 0;
    renderMode = "ok";
    expect(
      await r.render("https://a.test/", {
        waitMs: 100,
        approveHosts: ["b.test"],
      }),
    ).toEqual({ html: "<main>ok</main>", status: 200, url: "https://a.test/" });
    expect(seen[0]).toEqual({
      url: "https://a.test/",
      waitMs: 100,
      approveHosts: ["b.test"],
    });
    renderMode = "blocked";
    await expect(
      r.render("https://a.test/", { waitMs: 0, approveHosts: [] }),
    ).rejects.toMatchObject({
      name: RenderBlockedHostError.name,
      host: "autre.test",
      url: "https://autre.test/x",
    });
    renderMode = "timeout";
    await expect(
      r.render("https://a.test/", { waitMs: 0, approveHosts: [] }),
    ).rejects.toMatchObject({ code: "target_timeout" });
    renderMode = "failed";
    await expect(
      r.render("https://a.test/", { waitMs: 0, approveHosts: [] }),
    ).rejects.toBeInstanceOf(RenderError);
    renderMode = "ok";
    await expect(
      createHttpRenderer(
        client(),
        base,
        "faux-secret-faux-secret-faux-secret-xx",
      ).render("https://a.test/", { waitMs: 0, approveHosts: [] }),
    ).rejects.toBeInstanceOf(RenderError);
    await expect(
      r.render("http://127.0.0.1/", { waitMs: 0, approveHosts: [] }),
    ).rejects.toMatchObject({ code: "url_not_allowed" });
  });
});
