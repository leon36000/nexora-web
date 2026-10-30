import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { codeWorkspaces, members, staffAccounts, users } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newOrganization } from "../gateway/test-support";
import { loadKeyring } from "../vault/crypto";
import { putSecret } from "../vault/store";
import { signToken } from "./ticket";
import {
  DEDICATED_COOKIE,
  enterUrl,
  handleCodeOpen,
  handleDedicatedProxy,
} from "./workspace-dedicated";
import type { ProxyDeps } from "./workspace-proxy";
import { passwordRef } from "./workspace-service";

let t: TestDatabase;
let upstream: Server;
let upstreamPort = 0;
const keyring = loadKeyring({
  NEXORA_VAULT_MASTER_KEY: randomBytes(32).toString("base64"),
});
const SECRET = "d".repeat(40);
const SUFFIX = "code.localhost";
const SITE = "http://localhost:3722";
const now = new Date("2026-10-30T15:00:00Z");

type Seen = {
  method: string;
  url: string;
  headers: IncomingMessage["headers"];
};
const seen: Seen[] = [];

beforeAll(async () => {
  t = await createTestDatabase();
  upstream = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      seen.push({
        method: req.method ?? "",
        url: req.url ?? "",
        headers: req.headers,
      });
      if ((req.url ?? "").startsWith("/page")) {
        res.writeHead(200, {
          "content-type": "text/html",
          "set-cookie": "opencode_session=zz; Path=/",
        });
        res.end("<html>interface</html>");
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ path: req.url }));
    });
  });
  await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", r));
  upstreamPort = (upstream.address() as AddressInfo).port;
});
afterAll(async () => {
  await new Promise<void>((r) => upstream.close(() => r()));
  await t.drop();
});

let seq = 0;
async function workspace(over: { running?: boolean } = {}) {
  seq += 1;
  const orgId = await newOrganization(t.db);
  const userId = `usr_dd_${seq}_${randomBytes(3).toString("hex")}`;
  await t.db.insert(users).values({
    id: userId,
    name: "M",
    email: `${userId}@example.com`,
    emailVerified: true,
  });
  await t.db.insert(members).values({
    id: `mem_dd_${seq}_${randomBytes(3).toString("hex")}`,
    organizationId: orgId,
    userId,
    role: "owner",
  });
  const [row] = await t.db
    .insert(codeWorkspaces)
    .values({
      organizationId: orgId,
      userId,
      proxyId: randomBytes(16).toString("hex"),
      containerName: `nexora-code-dd${seq}${randomBytes(4).toString("hex")}`,
      volumeName: `nexora-code-vol-dd${seq}${randomBytes(4).toString("hex")}`,
      port: 42_000 + seq,
      desiredStatus: over.running === false ? "stopped" : "running",
    })
    .returning();
  if (!row) throw new Error("ligne");
  await putSecret(t.db, keyring, {
    ref: passwordRef(row.id),
    value: "mdp-dedie-1",
    kind: "other",
  });
  return { row, orgId, userId };
}

const deps = (over: Partial<ProxyDeps> = {}): ProxyDeps => ({
  db: () => t.db,
  keyring: () => keyring,
  siteUrl: SITE,
  now: () => now,
  log: createLogger({ name: "test", sink: () => {} }),
  upstreamHost: "127.0.0.1",
  allowSameOriginUi: false,
  fetch: (input, init) =>
    fetch(String(input).replace(/:42\d{3}\//, `:${upstreamPort}/`), init),
  getContext: async () => null, // la session du site ne sert JAMAIS sur l'hôte dédié
  dedicated: {
    suffix: SUFFIX,
    secret: SECRET,
    loadUser: async (userId) => {
      const [u] = await t.db.select().from(users).where(eq2(userId));
      if (!u) return null;
      const staff = await t.db.select().from(staffAccounts);
      return {
        emailVerified: u.emailVerified,
        isStaff: staff.some((s) => s.userId === userId && !s.revokedAt),
        twoFactorEnabled: u.twoFactorEnabled ?? false,
      };
    },
  },
  ...over,
});

import { eq } from "@nexora/db";

const eq2 = (userId: string) => eq(users.id, userId);

const hostOf = (pid: string) => `${pid}.${SUFFIX}:3722`;
const req = (
  pid: string,
  path: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
) =>
  new Request(`${SITE}/code/ws/${pid}${path}`, {
    method: init.method ?? "GET",
    headers: { host: hostOf(pid), ...init.headers },
    body: init.body,
  });
const params = (pid: string, path: string) => ({
  id: pid,
  path: path.replace(/^\//, "").split("?")[0]?.split("/").filter(Boolean),
});
const session = (w: { row: { proxyId: string }; userId: string }, ttl = 3600) =>
  `${DEDICATED_COOKIE}=${signToken(SECRET, { k: "session", pid: w.row.proxyId, uid: w.userId }, ttl, now)}`;

describe("entrée par billet", () => {
  it("le site produit un lien d'entrée sur l'hôte dédié, avec un billet de 60 s", () => {
    const pid = "ab".repeat(16);
    const url = enterUrl(deps(), pid, "u1");
    expect(
      url?.startsWith(`http://${pid}.${SUFFIX}:3722/_nexora/enter?t=`),
    ).toBe(true);
    expect(enterUrl(deps({ dedicated: null }), pid, "u1")).toBeNull();
  });

  it("un billet valide pose un cookie propre à l'hôte (HttpOnly, sans Domain) et redirige vers la racine", async () => {
    const w = await workspace();
    const ticket = signToken(
      SECRET,
      { k: "enter", pid: w.row.proxyId, uid: w.userId },
      60,
      now,
    );
    const res = await handleDedicatedProxy(
      req(w.row.proxyId, `/_nexora/enter?t=${encodeURIComponent(ticket)}`),
      params(w.row.proxyId, "/_nexora/enter"),
      deps(),
    );
    expect(res?.status).toBe(302);
    expect(res?.headers.get("location")).toBe("/");
    const cookie = res?.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${DEDICATED_COOKIE}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=28800");
    expect(cookie).not.toMatch(/Domain=/i);
    expect(cookie).not.toContain("Secure"); // http en développement
    expect(res?.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res?.headers.get("cache-control")).toBe("no-store");
  });

  it("refuse un billet absent, expiré, modifié, d'un autre environnement ou du mauvais genre (même réponse)", async () => {
    const a = await workspace();
    const b = await workspace();
    const good = signToken(
      SECRET,
      { k: "enter", pid: a.row.proxyId, uid: a.userId },
      60,
      now,
    );
    const tickets = [
      "",
      "n-importe-quoi",
      signToken(
        SECRET,
        { k: "enter", pid: a.row.proxyId, uid: a.userId },
        -5,
        now,
      ),
      `${good}x`,
      signToken(
        SECRET,
        { k: "enter", pid: b.row.proxyId, uid: b.userId },
        60,
        now,
      ), // billet de b présenté à a
      signToken(
        SECRET,
        { k: "session", pid: a.row.proxyId, uid: a.userId },
        60,
        now,
      ), // cookie présenté comme billet
      signToken(
        "z".repeat(40),
        { k: "enter", pid: a.row.proxyId, uid: a.userId },
        60,
        now,
      ),
    ];
    const answers = [];
    for (const t of tickets) {
      const res = await handleDedicatedProxy(
        req(a.row.proxyId, `/_nexora/enter?t=${encodeURIComponent(t)}`),
        params(a.row.proxyId, "/_nexora/enter"),
        deps(),
      );
      answers.push({
        s: res?.status,
        b: await res?.text(),
        c: res?.headers.get("set-cookie"),
      });
    }
    for (const x of answers) expect(x).toEqual(answers[0]);
    expect(answers[0]?.s).toBe(403);
    expect(answers[0]?.c).toBeNull();
  });
});

describe("requêtes sur l'hôte dédié", () => {
  it("avec le cookie : l'interface (HTML) est servie, authentifiée côté serveur, sans cookie de l'environnement", async () => {
    const w = await workspace();
    seen.length = 0;
    const res = await handleDedicatedProxy(
      req(w.row.proxyId, "/page", { headers: { cookie: session(w) } }),
      params(w.row.proxyId, "/page"),
      deps(),
    );
    expect(res?.status).toBe(200);
    expect(res?.headers.get("content-type")).toContain("text/html");
    expect(res?.headers.get("set-cookie")).toBeNull();
    expect(await res?.text()).toContain("interface");
    expect(seen[0]?.headers.authorization).toBe(
      `Basic ${Buffer.from("opencode:mdp-dedie-1").toString("base64")}`,
    );
    expect(seen[0]?.headers.cookie).toBeUndefined(); // le cookie de l'hôte dédié ne va pas à l'environnement
  });

  it("transmet le chemin et la requête (api avec segments codés)", async () => {
    const w = await workspace();
    seen.length = 0;
    const res = await handleDedicatedProxy(
      new Request(
        `${SITE}/code/ws/${w.row.proxyId}/session/a%20b/list?limit=3`,
        {
          headers: { host: hostOf(w.row.proxyId), cookie: session(w) },
        },
      ),
      { id: w.row.proxyId, path: ["session", "a b", "list"] },
      deps(),
    );
    expect(res?.status).toBe(200);
    expect(seen[0]?.url).toBe("/session/a%20b/list?limit=3");
  });

  it("sans cookie, cookie expiré, cookie d'un autre environnement ou billet d'entrée : 401", async () => {
    const a = await workspace();
    const b = await workspace();
    const cookies = [
      undefined,
      session(a, -5),
      session(b), // cookie de b présenté à l'hôte de a
      `${DEDICATED_COOKIE}=${signToken(SECRET, { k: "enter", pid: a.row.proxyId, uid: a.userId }, 60, now)}`,
    ];
    for (const cookie of cookies) {
      const res = await handleDedicatedProxy(
        req(a.row.proxyId, "/x", { headers: cookie ? { cookie } : {} }),
        params(a.row.proxyId, "/x"),
        deps(),
      );
      expect(res?.status).toBe(401);
    }
  });

  it("un cookie signé pour une autre personne que le propriétaire : 404", async () => {
    const w = await workspace();
    const other = await workspace();
    const forged = `${DEDICATED_COOKIE}=${signToken(SECRET, { k: "session", pid: w.row.proxyId, uid: other.userId }, 60, now)}`;
    const res = await handleDedicatedProxy(
      req(w.row.proxyId, "/x", { headers: { cookie: forged } }),
      params(w.row.proxyId, "/x"),
      deps(),
    );
    expect(res?.status).toBe(404);
  });

  it("la session du site ne vaut rien ici (getContext du site ignoré)", async () => {
    const w = await workspace();
    const res = await handleDedicatedProxy(
      req(w.row.proxyId, "/x"),
      params(w.row.proxyId, "/x"),
      deps({
        getContext: async () => ({
          userId: w.userId,
          organizationId: w.orgId,
          emailVerified: true,
          isStaff: false,
          twoFactorEnabled: false,
        }),
      }),
    );
    expect(res?.status).toBe(401);
  });

  it("les écritures exigent l'origine de l'hôte dédié (ni le site, ni un tiers)", async () => {
    const w = await workspace();
    const dedicated = `http://${hostOf(w.row.proxyId)}`;
    seen.length = 0;
    for (const origin of [SITE, "https://evil.example", undefined]) {
      const res = await handleDedicatedProxy(
        req(w.row.proxyId, "/session", {
          method: "POST",
          body: "{}",
          headers: { cookie: session(w), ...(origin ? { origin } : {}) },
        }),
        params(w.row.proxyId, "/session"),
        deps(),
      );
      expect(res?.status).toBe(403);
    }
    expect(seen).toEqual([]);
    const ok = await handleDedicatedProxy(
      req(w.row.proxyId, "/session", {
        method: "POST",
        body: "{}",
        headers: { cookie: session(w), origin: dedicated },
      }),
      params(w.row.proxyId, "/session"),
      deps(),
    );
    expect(ok?.status).toBe(200);
  });

  it("environnement arrêté : 409 ; courriel non vérifié ou personnel sans 2FA : 403", async () => {
    const stopped = await workspace({ running: false });
    expect(
      (
        await handleDedicatedProxy(
          req(stopped.row.proxyId, "/x", {
            headers: { cookie: session(stopped) },
          }),
          params(stopped.row.proxyId, "/x"),
          deps(),
        )
      )?.status,
    ).toBe(409);
    const w = await workspace();
    const staff = await handleDedicatedProxy(
      req(w.row.proxyId, "/x", { headers: { cookie: session(w) } }),
      params(w.row.proxyId, "/x"),
      deps({
        dedicated: {
          suffix: SUFFIX,
          secret: SECRET,
          loadUser: async () => ({
            emailVerified: true,
            isStaff: true,
            twoFactorEnabled: false,
          }),
        },
      }),
    );
    expect(staff?.status).toBe(403);
    const unverified = await handleDedicatedProxy(
      req(w.row.proxyId, "/x", { headers: { cookie: session(w) } }),
      params(w.row.proxyId, "/x"),
      deps({
        dedicated: {
          suffix: SUFFIX,
          secret: SECRET,
          loadUser: async () => ({
            emailVerified: false,
            isStaff: false,
            twoFactorEnabled: false,
          }),
        },
      }),
    );
    expect(unverified?.status).toBe(403);
  });

  it("un hôte qui n'est pas dédié (autre suffixe, autre identifiant, rien de configuré) n'est pas traité", async () => {
    const w = await workspace();
    const other = await workspace();
    const cookie = session(w);
    const wrongSuffix = new Request(`${SITE}/code/ws/${w.row.proxyId}/x`, {
      headers: { host: `${w.row.proxyId}.autre.example`, cookie },
    });
    expect(
      await handleDedicatedProxy(
        wrongSuffix,
        params(w.row.proxyId, "/x"),
        deps(),
      ),
    ).toBeNull();
    const mismatch = req(other.row.proxyId, "/x", { headers: { cookie } });
    expect(
      await handleDedicatedProxy(mismatch, params(w.row.proxyId, "/x"), deps()),
    ).toBeNull();
    expect(
      await handleDedicatedProxy(
        req(w.row.proxyId, "/x", { headers: { cookie } }),
        params(w.row.proxyId, "/x"),
        deps({ dedicated: null }),
      ),
    ).toBeNull();
  });
});

describe("GET /api/account/code/open (la personne ouvre son interface)", () => {
  const site = (
    w: { userId: string; orgId: string },
    over: Record<string, boolean> = {},
  ) =>
    deps({
      getContext: async () => ({
        userId: w.userId,
        organizationId: w.orgId,
        emailVerified: true,
        isStaff: false,
        twoFactorEnabled: false,
        ...over,
      }),
    });
  const open = (d: ProxyDeps, method = "GET") =>
    handleCodeOpen(new Request(`${SITE}/api/account/code/open`, { method }), d);

  it("redirige la personne propriétaire, session ouverte, vers l'hôte dédié avec un billet", async () => {
    const w = await workspace();
    const res = await open(site(w));
    expect(res.status).toBe(302);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.host).toBe(`${w.row.proxyId}.${SUFFIX}:3722`);
    expect(location.pathname).toBe("/_nexora/enter");
    expect(location.searchParams.get("t")?.split(".")).toHaveLength(2);
  });

  it("sans session 401 ; environnement absent 404 ; arrêté 409 ; non configuré 404 ; autre méthode 405", async () => {
    const w = await workspace();
    expect((await open(deps())).status).toBe(401);
    const none = { userId: w.userId, orgId: (await workspace()).orgId };
    expect((await open(site(none))).status).toBe(404);
    const stopped = await workspace({ running: false });
    expect((await open(site(stopped))).status).toBe(409);
    expect((await open({ ...site(w), dedicated: null })).status).toBe(404);
    expect((await open(site(w), "POST")).status).toBe(405);
  });

  it("courriel non vérifié ou personnel sans 2FA : 403", async () => {
    const w = await workspace();
    expect((await open(site(w, { emailVerified: false }))).status).toBe(403);
    expect((await open(site(w, { isStaff: true }))).status).toBe(403);
  });
});
