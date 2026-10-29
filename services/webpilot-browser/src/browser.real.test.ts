import { existsSync, readdirSync, readFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBrowserRuntime, RenderBlockedError } from "./browser.ts";
import { configFromEnv } from "./config.ts";
import { createEgressProxy } from "./proxy.ts";
import { SessionManager } from "./sessions.ts";

/**
 * ESSAI RÉEL avec Chromium : une page locale servie par un petit serveur d'essai, sous deux « noms » (alpha et beta)
 * que le résolveur d'essai envoie tous deux vers la boucle locale. Ignoré si Chromium n'est pas installé sur la
 * machine (CI sans navigateur) : les mêmes comportements sont alors couverts par les essais à faux navigateur.
 */
type ChromiumType = typeof import("playwright-core")["chromium"];
let chromium: ChromiumType | null = null;
try {
  chromium = (await import("playwright-core")).chromium;
  const path = process.env.BROWSER_EXECUTABLE_PATH ?? chromium.executablePath();
  if (!existsSync(path)) chromium = null;
  else process.env.BROWSER_EXECUTABLE_PATH = path;
} catch {
  chromium = null;
}

const SECRET = "x".repeat(40);
const ALPHA = "alpha.example.test";
const BETA = "beta.example.test";

const PAGE = (body: string) =>
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Essai</title></head><body>${body}</body></html>`;

const seen: string[] = [];
let origin: http.Server;
let port = 0;

function children(): number {
  const file = `/proc/${process.pid}/task/${process.pid}/children`;
  try {
    return readFileSync(file, "utf8").trim().split(/\s+/).filter(Boolean)
      .length;
  } catch {
    return readdirSync("/proc").length > 0 ? 0 : 0;
  }
}
async function waitFor(check: () => boolean, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return check();
}

beforeAll(async () => {
  if (!chromium) return;
  origin = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    seen.push(`${req.headers.host}${url.pathname}`);
    const html = (body: string, extra: Record<string, string> = {}) => {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        ...extra,
      });
      res.end(PAGE(body));
    };
    switch (url.pathname) {
      case "/":
        return html(`
          <h1 id="titre">Bonjour</h1>
          <input id="nom" type="text" aria-label="Nom">
          <input id="mdp" type="password" aria-label="Mot de passe">
          <input id="carte" name="card_number" type="text">
          <button id="go" onclick="document.getElementById('sortie').textContent = 'Salut ' + document.getElementById('nom').value">Saluer</button>
          <p id="sortie"></p>
          <a id="vers-beta" href="http://${BETA}:${port}/">Aller chez beta</a>
          <a id="vers-redir" href="/redir">Redirection</a>
          <a id="telechargement" href="/fichier">Télécharger</a>
          <script>document.title = 'Essai JS';
            const d = document.createElement('div'); d.id = 'rendu-js'; d.textContent = 'Rendu par JavaScript'; document.body.append(d);</script>`);
      case "/redir":
        res.writeHead(302, { location: `http://${BETA}:${port}/` });
        return res.end();
      case "/fichier":
        res.writeHead(200, {
          "content-type": "application/octet-stream",
          "content-disposition": 'attachment; filename="secret.bin"',
        });
        return res.end("octets");
      case "/cookie":
        return html("<p>posé</p>", { "set-cookie": "sid=abc123; Path=/" });
      case "/qui":
        return html(
          `<p id="cookies">cookies=[${req.headers.cookie ?? ""}]</p>`,
        );
      default:
        return html(`<p>${url.pathname}</p>`);
    }
  });
  await new Promise<void>((r) => origin.listen(0, "127.0.0.1", () => r()));
  port = (origin.address() as AddressInfo).port;
});
afterAll(async () => {
  origin?.closeAllConnections();
  await new Promise<void>((r) => origin?.close(() => r()));
});

async function runtime(allowLoopback: boolean) {
  const config = {
    ...configFromEnv({ WEBPILOT_BROWSER_SECRET: SECRET }),
    policy: { allowedPorts: [80, 443, port], allowLoopback },
    actionTimeoutMs: 5_000,
    navTimeoutMs: 10_000,
  };
  const blocked: string[] = [];
  const proxy = createEgressProxy({
    policy: config.policy,
    resolve: async (host) =>
      host.endsWith(".example.test") ? ["127.0.0.1"] : ["10.1.2.3"],
    onBlocked: (host) => blocked.push(host),
  });
  const { port: proxyPort } = await proxy.listen();
  const rt = createBrowserRuntime({
    config,
    chromium: chromium as ChromiumType,
    proxyPort,
    proxy,
  });
  const manager = new SessionManager({
    driver: rt.driver,
    now: () => Date.now(),
    maxSessions: 4,
    maxSeconds: 600,
    maxIdleSeconds: 300,
    tombstoneMs: 60_000,
  });
  return { rt, manager, blocked, config };
}

const open = (m: SessionManager, id: string) =>
  m.open({ id, maxSeconds: 120, idleSeconds: 60 });

describe.skipIf(!chromium)("navigateur réel (Chromium)", () => {
  it("ouvre, navigue, lit, saisit, clique, capture et ferme une session sur une page locale", async () => {
    const { rt, manager } = await runtime(true);
    try {
      await open(manager, "ses_reel");
      const first = await manager.run(
        "ses_reel",
        [
          { type: "goto", url: `http://${ALPHA}:${port}/` },
          { type: "wait", for: "selector", selector: "#rendu-js" },
          { type: "type", selector: "#nom", text: "Marie-Ève" },
          { type: "click", selector: "#go" },
          { type: "wait", for: "idle" },
          { type: "read" },
          { type: "screenshot" },
        ],
        { approveHosts: [ALPHA] },
      );
      expect(first.results.map((r) => [r.type, r.ok])).toEqual([
        ["goto", true],
        ["wait", true],
        ["type", true],
        ["click", true],
        ["wait", true],
        ["read", true],
        ["screenshot", true],
      ]);
      const read = first.results[5] as unknown as {
        html: string;
        title: string;
      };
      expect(read.html).toContain("Salut Marie-Ève");
      expect(read.html).toContain("Rendu par JavaScript");
      expect(read.title).toBe("Essai JS");
      const shot = first.results[6] as unknown as {
        mime: string;
        data_base64: string;
      };
      expect(shot.mime).toBe("image/png");
      expect(
        Buffer.from(shot.data_base64, "base64").subarray(1, 4).toString(),
      ).toBe("PNG");
      expect(first.url).toBe(`http://${ALPHA}:${port}/`);

      const click = await manager.run(
        "ses_reel",
        [
          { type: "click", text: "Saluer" },
          { type: "scroll", direction: "down", amount: 200 },
          { type: "press", key: "Tab" },
        ],
        { approveHosts: [] },
      );
      expect(click.results.every((r) => r.ok)).toBe(true);

      await manager.close("ses_reel", "closed_by_client");
    } finally {
      await rt.close();
    }
  });

  it("détruit le navigateur à la fermeture (plus aucun processus enfant)", async () => {
    const { rt, manager } = await runtime(true);
    try {
      const before = children();
      await open(manager, "ses_proc");
      expect(children()).toBeGreaterThan(before);
      await manager.close("ses_proc", "closed_by_client");
      expect(await waitFor(() => children() <= before)).toBe(true);
    } finally {
      await rt.close();
    }
  });

  it("n'atteint JAMAIS le réseau interne (boucle locale, privé, métadonnées), même admis par une page", async () => {
    const { rt, manager, blocked } = await runtime(false);
    try {
      await open(manager, "ses_ssrf");
      seen.length = 0;
      for (const url of [
        `http://127.0.0.1:${port}/`,
        `http://localhost:${port}/`,
        `http://[::1]:${port}/`,
        `http://${ALPHA}:${port}/`,
        "http://169.254.169.254/latest/meta-data/",
        "http://10.0.0.1/",
        "file:///etc/passwd",
        "ftp://exemple.org/",
        `http://exemple.org:22/`,
        "http://user:pw@exemple.org/",
      ]) {
        const out = await manager.run("ses_ssrf", [{ type: "goto", url }], {
          approveHosts: [
            "127.0.0.1",
            "localhost",
            "[::1]",
            "::1",
            ALPHA,
            "169.254.169.254",
            "10.0.0.1",
            "exemple.org",
          ],
        });
        expect(out.results[0]?.ok, url).toBe(false);
      }
      expect(seen).toEqual([]);
      expect(blocked.length).toBeGreaterThan(0);
    } finally {
      await rt.close();
    }
  });

  it("n'admet une navigation de premier niveau que vers un hôte approuvé (clic, redirection)", async () => {
    const { rt, manager } = await runtime(true);
    try {
      await open(manager, "ses_nav");
      await manager.run(
        "ses_nav",
        [{ type: "goto", url: `http://${ALPHA}:${port}/` }],
        { approveHosts: [ALPHA] },
      );
      seen.length = 0;
      const clicked = await manager.run(
        "ses_nav",
        [{ type: "click", selector: "#vers-beta" }],
        { approveHosts: [] },
      );
      expect(clicked.results[0]).toMatchObject({
        ok: false,
        error: { code: "navigation_blocked" },
      });
      expect(clicked.url).toBe("about:blank");
      const redirected = await manager.run(
        "ses_nav",
        [{ type: "goto", url: `http://${ALPHA}:${port}/redir` }],
        { approveHosts: [ALPHA] },
      );
      expect(redirected.results[0]).toMatchObject({
        ok: false,
        error: { code: "navigation_blocked" },
      });
      expect(seen.some((s) => s.startsWith(BETA))).toBe(false);
      const allowed = await manager.run(
        "ses_nav",
        [{ type: "goto", url: `http://${ALPHA}:${port}/redir` }],
        { approveHosts: [ALPHA, BETA] },
      );
      expect(allowed.results[0]).toMatchObject({ ok: true });
      expect(allowed.url).toBe(`http://${BETA}:${port}/`);
    } finally {
      await rt.close();
    }
  });

  it("les hôtes approuvés valent pour UN lot : ils ne se cumulent pas (la politique a pu changer entre deux lots)", async () => {
    const { rt, manager } = await runtime(true);
    try {
      await open(manager, "ses_cumul");
      const a = await manager.run(
        "ses_cumul",
        [{ type: "goto", url: `http://${ALPHA}:${port}/` }],
        { approveHosts: [ALPHA] },
      );
      expect(a.results[0]).toMatchObject({ ok: true });
      const b = await manager.run(
        "ses_cumul",
        [{ type: "goto", url: `http://${BETA}:${port}/` }],
        { approveHosts: [BETA] },
      );
      expect(b.results[0]).toMatchObject({ ok: true });
      seen.length = 0;
      const back = await manager.run(
        "ses_cumul",
        [{ type: "goto", url: `http://${ALPHA}:${port}/` }],
        { approveHosts: [BETA] },
      );
      expect(back.results[0]).toMatchObject({
        ok: false,
        error: { code: "navigation_blocked" },
      });
      expect(seen).toEqual([]);
    } finally {
      await rt.close();
    }
  });

  it("refuse de saisir un mot de passe ou un numéro de carte, et si la page n'est plus celle évaluée", async () => {
    const { rt, manager } = await runtime(true);
    try {
      await open(manager, "ses_sens");
      await manager.run(
        "ses_sens",
        [{ type: "goto", url: `http://${ALPHA}:${port}/` }],
        { approveHosts: [ALPHA] },
      );
      for (const selector of ["#mdp", "#carte"]) {
        const out = await manager.run(
          "ses_sens",
          [{ type: "type", selector, text: "x" }],
          { approveHosts: [] },
        );
        expect(out.results[0], selector).toMatchObject({
          ok: false,
          error: { code: "sensitive_field_refused" },
        });
      }
      const moved = await manager.run(
        "ses_sens",
        [{ type: "type", selector: "#nom", text: "x", expected_host: BETA }],
        { approveHosts: [] },
      );
      expect(moved.results[0]).toMatchObject({
        ok: false,
        error: { code: "host_changed" },
      });
      const read = await manager.run("ses_sens", [{ type: "read" }], {
        approveHosts: [],
      });
      expect(
        (read.results[0] as unknown as { html: string }).html,
      ).not.toContain('value="x"');
    } finally {
      await rt.close();
    }
  });

  it("annule les téléchargements et ne garde aucun cookie d'une session à l'autre", async () => {
    const { rt, manager } = await runtime(true);
    try {
      await open(manager, "ses_a");
      await open(manager, "ses_b");
      const dl = await manager.run(
        "ses_a",
        [{ type: "goto", url: `http://${ALPHA}:${port}/fichier` }],
        { approveHosts: [ALPHA] },
      );
      expect(dl.results[0]?.ok).toBe(false);
      await manager.run(
        "ses_a",
        [{ type: "goto", url: `http://${ALPHA}:${port}/cookie` }],
        { approveHosts: [ALPHA] },
      );
      const a = await manager.run(
        "ses_a",
        [
          { type: "goto", url: `http://${ALPHA}:${port}/qui` },
          { type: "read" },
        ],
        { approveHosts: [ALPHA] },
      );
      expect((a.results[1] as unknown as { html: string }).html).toContain(
        "sid=abc123",
      );
      const b = await manager.run(
        "ses_b",
        [
          { type: "goto", url: `http://${ALPHA}:${port}/qui` },
          { type: "read" },
        ],
        { approveHosts: [ALPHA] },
      );
      expect((b.results[1] as unknown as { html: string }).html).toContain(
        "cookies=[]",
      );
    } finally {
      await rt.close();
    }
  });

  it("rend une page après exécution de son JavaScript (POST /render)", async () => {
    const { rt } = await runtime(true);
    try {
      const out = await rt.render({
        url: `http://${ALPHA}:${port}/`,
        waitMs: 0,
        approveHosts: [],
      });
      expect(out.status).toBe(200);
      expect(out.html).toContain("Rendu par JavaScript");
      expect(out.url).toBe(`http://${ALPHA}:${port}/`);
    } finally {
      await rt.close();
    }
  });

  it("le rendu signale une redirection vers un autre hôte au lieu de la suivre", async () => {
    const { rt } = await runtime(true);
    try {
      seen.length = 0;
      await expect(
        rt.render({
          url: `http://${ALPHA}:${port}/redir`,
          waitMs: 0,
          approveHosts: [],
        }),
      ).rejects.toBeInstanceOf(RenderBlockedError);
      expect(seen.some((s) => s.startsWith(BETA))).toBe(false);
      const ok = await rt.render({
        url: `http://${ALPHA}:${port}/redir`,
        waitMs: 0,
        approveHosts: [BETA],
      });
      expect(ok.url).toBe(`http://${BETA}:${port}/`);
    } finally {
      await rt.close();
    }
  });
});
