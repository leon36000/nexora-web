import type http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { RenderBlockedError, RenderFailedError } from "./browser.ts";
import { configFromEnv } from "./config.ts";
import { createServer } from "./server.ts";
import {
  type BrowserDriver,
  SessionError,
  SessionManager,
} from "./sessions.ts";

const SECRET = "a-very-long-shared-secret-for-tests-0123456789";
const config = configFromEnv({ WEBPILOT_BROWSER_SECRET: SECRET });

const servers: http.Server[] = [];
afterEach(async () => {
  for (const s of servers.splice(0))
    await new Promise<void>((r) => {
      s.closeAllConnections();
      s.close(() => r());
    });
});

async function start(
  over: {
    render?: Parameters<typeof createServer>[0]["render"];
    driver?: BrowserDriver;
  } = {},
) {
  const calls: unknown[] = [];
  const driver: BrowserDriver = over.driver ?? {
    async launch() {
      return {
        async run(actions, ctx) {
          calls.push({ actions, approveHosts: ctx.approveHosts });
          return {
            results: actions.map((a) => ({ type: a.type, ok: true })),
            url: "https://exemple.org/",
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
    maxSessions: config.maxSessions,
    maxSeconds: config.maxSeconds,
    maxIdleSeconds: config.maxIdleSeconds,
    tombstoneMs: 60_000,
  });
  const server = createServer({
    config,
    manager,
    render:
      over.render ??
      (async () => ({
        html: "<p>x</p>",
        status: 200,
        url: "https://exemple.org/",
      })),
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = { authorization: `Bearer ${SECRET}` },
  ) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json", ...headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null, text };
  };
  return { call, calls, manager, base };
}

const OPEN = { id: "ses_a", max_seconds: 120, idle_seconds: 30 };

describe("authentification de service à service", () => {
  it("refuse tout appel sans le secret, sauf la sonde de santé", async () => {
    const { call } = await start();
    expect((await call("GET", "/healthz", undefined, {})).status).toBe(200);
    const bad: Record<string, string>[] = [
      {},
      { authorization: "Bearer mauvais" },
      { authorization: SECRET },
      { authorization: `Basic ${SECRET}` },
      { authorization: `Bearer ${SECRET}x` },
    ];
    for (const headers of bad) {
      expect((await call("POST", "/sessions", OPEN, headers)).status).toBe(401);
      expect(
        (
          await call(
            "POST",
            "/render",
            { url: "https://exemple.org/" },
            headers,
          )
        ).status,
      ).toBe(401);
      expect(
        (await call("GET", "/sessions/ses_a", undefined, headers)).status,
      ).toBe(401);
    }
  });

  it("n'écrit jamais le secret dans une réponse", async () => {
    const { call } = await start();
    const r = await call("POST", "/sessions", { ...OPEN, id: "../x" });
    expect(r.text).not.toContain(SECRET);
  });
});

describe("sessions", () => {
  it("ouvre, lit l'état, exécute, ferme", async () => {
    const { call, calls } = await start();
    const opened = await call("POST", "/sessions", OPEN);
    expect(opened.status).toBe(201);
    expect(opened.json).toMatchObject({ id: "ses_a", status: "open" });
    expect(typeof opened.json.expires_at).toBe("string");

    const ran = await call("POST", "/sessions/ses_a/actions", {
      actions: [
        { type: "goto", url: "https://exemple.org/" },
        { type: "read" },
      ],
      approve_hosts: ["Exemple.org"],
    });
    expect(ran.status).toBe(200);
    expect(ran.json).toMatchObject({
      status: "open",
      url: "https://exemple.org/",
      completed: true,
    });
    expect(ran.json.results).toHaveLength(2);
    expect(calls).toEqual([
      {
        actions: [
          { type: "goto", url: "https://exemple.org/" },
          { type: "read" },
        ],
        approveHosts: ["exemple.org"],
      },
    ]);

    const state = await call("GET", "/sessions/ses_a");
    expect(state.json).toMatchObject({
      id: "ses_a",
      status: "open",
      close_reason: null,
    });

    const closed = await call("DELETE", "/sessions/ses_a", {
      reason: "insufficient_quota",
    });
    expect(closed.status).toBe(200);
    expect(closed.json).toMatchObject({
      status: "closed",
      close_reason: "insufficient_quota",
    });
    expect((await call("GET", "/sessions/ses_a")).json.close_reason).toBe(
      "insufficient_quota",
    );
  });

  it("une fermeture sans motif vaut closed_by_client ; un motif inconnu est refusé", async () => {
    const { call } = await start();
    await call("POST", "/sessions", OPEN);
    expect(
      (await call("DELETE", "/sessions/ses_a", { reason: "pirate" })).status,
    ).toBe(400);
    expect((await call("DELETE", "/sessions/ses_a")).json.close_reason).toBe(
      "closed_by_client",
    );
  });

  it("une action sur une session fermée donne 409 avec le motif", async () => {
    const { call } = await start();
    await call("POST", "/sessions", OPEN);
    await call("DELETE", "/sessions/ses_a", { reason: "privacy_policy" });
    const r = await call("POST", "/sessions/ses_a/actions", {
      actions: [{ type: "read" }],
    });
    expect(r.status).toBe(409);
    expect(r.json.error).toMatchObject({
      code: "session_closed",
      close_reason: "privacy_policy",
    });
  });

  it("refuse une action hors de la liste fermée, avec sa position, sans rien exécuter", async () => {
    const { call, calls } = await start();
    await call("POST", "/sessions", OPEN);
    const r = await call("POST", "/sessions/ses_a/actions", {
      actions: [
        { type: "read" },
        { type: "evaluate", expression: "document.cookie" },
      ],
    });
    expect(r.status).toBe(400);
    expect(r.json.error).toMatchObject({ code: "invalid_request", index: 1 });
    expect(calls).toEqual([]);
  });

  it("valide l'ouverture (bornes, fenêtre, langue, fuseau)", async () => {
    const { call } = await start();
    for (const body of [
      {},
      { ...OPEN, id: 5 },
      { ...OPEN, max_seconds: "120" },
      { ...OPEN, max_seconds: 999_999 },
      { ...OPEN, viewport: { width: 10, height: 10 } },
      { ...OPEN, viewport: { width: 5000, height: 800 } },
      { ...OPEN, locale: "pas une langue" },
      { ...OPEN, timezone: "Mars/Olympus" },
      { ...OPEN, extra: true },
    ])
      expect(
        (await call("POST", "/sessions", body)).status,
        JSON.stringify(body),
      ).toBe(400);
    expect(
      (
        await call("POST", "/sessions", {
          ...OPEN,
          viewport: { width: 800, height: 600 },
          locale: "en-CA",
          timezone: "America/Toronto",
        })
      ).status,
    ).toBe(201);
  });

  it("traduit les erreurs de session en statuts HTTP", async () => {
    const { call } = await start();
    await call("POST", "/sessions", OPEN);
    expect((await call("POST", "/sessions", OPEN)).status).toBe(409);
    expect((await call("GET", "/sessions/ses_inconnue")).status).toBe(404);
    expect((await call("DELETE", "/sessions/ses_inconnue")).status).toBe(404);
  });

  it("répond 429 quand le service est plein", async () => {
    const { call } = await start();
    for (let i = 0; i < config.maxSessions; i++)
      expect(
        (await call("POST", "/sessions", { ...OPEN, id: `ses_${i}` })).status,
      ).toBe(201);
    expect(
      (await call("POST", "/sessions", { ...OPEN, id: "ses_plus" })).status,
    ).toBe(429);
  });

  it("une panne du navigateur à l'ouverture donne 502 et ne laisse rien", async () => {
    const { call, manager } = await start({
      driver: {
        async launch() {
          throw new SessionError("browser_error", "x");
        },
      },
    });
    expect((await call("POST", "/sessions", OPEN)).status).toBe(502);
    expect(manager.count()).toBe(0);
  });
});

describe("rendu d'une page", () => {
  it("renvoie le HTML rendu", async () => {
    let seen: unknown;
    const { call } = await start({
      render: async (input) => {
        seen = input;
        return {
          html: "<main>ok</main>",
          status: 200,
          url: "https://exemple.org/final",
        };
      },
    });
    const r = await call("POST", "/render", {
      url: "https://exemple.org/",
      wait_ms: 250,
      approve_hosts: ["www.exemple.org"],
    });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({
      html: "<main>ok</main>",
      status: 200,
      url: "https://exemple.org/final",
    });
    expect(seen).toEqual({
      url: "https://exemple.org/",
      waitMs: 250,
      approveHosts: ["www.exemple.org"],
    });
  });

  it("refuse une adresse non http(s) ou interne avant de lancer quoi que ce soit", async () => {
    let launched = 0;
    const { call } = await start({
      render: async () => {
        launched += 1;
        return { html: "", status: 200, url: "" };
      },
    });
    for (const url of [
      "file:///etc/passwd",
      "http://127.0.0.1/",
      "http://10.0.0.1/",
      "http://localhost/",
      "https://u:p@exemple.org/",
      "http://exemple.org:22/",
    ]) {
      const r = await call("POST", "/render", { url });
      expect(r.status, url).toBe(400);
      expect(r.json.error.code).toBe("url_not_allowed");
    }
    expect(launched).toBe(0);
  });

  it("signale une redirection vers un hôte non approuvé, pour que le site l'évalue", async () => {
    const { call } = await start({
      render: async () => {
        throw new RenderBlockedError("autre.example", "https://autre.example");
      },
    });
    const r = await call("POST", "/render", { url: "https://exemple.org/" });
    expect(r.status).toBe(422);
    expect(r.json.error).toMatchObject({
      code: "redirect_blocked",
      host: "autre.example",
    });
  });

  it("distingue délai et échec de navigation", async () => {
    const t = await start({
      render: async () => {
        throw new RenderFailedError("timeout");
      },
    });
    expect(
      (await t.call("POST", "/render", { url: "https://exemple.org/" })).status,
    ).toBe(504);
    const f = await start({
      render: async () => {
        throw new RenderFailedError("navigation_failed");
      },
    });
    expect(
      (await f.call("POST", "/render", { url: "https://exemple.org/" })).status,
    ).toBe(502);
  });
});

describe("robustesse", () => {
  it("refuse un corps trop gros, un JSON invalide, une route ou une méthode inconnue", async () => {
    const { call, base } = await start();
    const big = await call("POST", "/sessions", {
      ...OPEN,
      pad: "x".repeat(config.maxBodyBytes + 10),
    });
    expect(big.status).toBe(413);
    const bad = await fetch(`${base}/sessions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${SECRET}`,
        "content-type": "application/json",
      },
      body: "{pas du json",
    });
    expect(bad.status).toBe(400);
    expect((await call("GET", "/nimporte")).status).toBe(404);
    expect((await call("PUT", "/sessions/ses_a", {})).status).toBe(405);
  });

  it("une erreur interne ne divulgue rien", async () => {
    const { call } = await start({
      render: async () => {
        throw new Error("secret interne /etc/passwd");
      },
    });
    const r = await call("POST", "/render", { url: "https://exemple.org/" });
    expect(r.status).toBe(500);
    expect(r.text).not.toContain("passwd");
  });
});
