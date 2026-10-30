import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { codeWorkspaces, eq, members, users } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newOrganization } from "../gateway/test-support";
import { loadKeyring } from "../vault/crypto";
import { putSecret } from "../vault/store";
import {
  authorizeWorkspace,
  handleWorkspaceAuth,
  handleWorkspaceProxy,
  type ProxyDeps,
} from "./workspace-proxy";
import { passwordRef } from "./workspace-service";

let t: TestDatabase;
let upstream: Server;
let upstreamPort = 0;
const keyring = loadKeyring({
  NEXORA_VAULT_MASTER_KEY: randomBytes(32).toString("base64"),
});
const SITE = "http://localhost:3722";
const logs: string[] = [];

type Seen = {
  method: string;
  url: string;
  headers: IncomingMessage["headers"];
  body: string;
};
const seen: Seen[] = [];

beforeAll(async () => {
  t = await createTestDatabase();
  upstream = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      seen.push({
        method: req.method ?? "",
        url: req.url ?? "",
        headers: req.headers,
        body: Buffer.concat(chunks).toString(),
      });
      const url = req.url ?? "";
      if (url.startsWith("/event")) {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
        });
        res.write("data: un\n\n");
        setTimeout(() => {
          res.write("data: deux\n\n");
          res.end();
        }, 150);
        return;
      }
      if (url.startsWith("/redirect-abs")) {
        res.writeHead(302, { location: "https://autre.example/x" });
        res.end();
        return;
      }
      if (url.startsWith("/redirect")) {
        res.writeHead(302, { location: "/session/abc" });
        res.end();
        return;
      }
      if (url.startsWith("/page")) {
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "set-cookie": "opencode_session=zzz; Path=/",
        });
        res.end("<html><script>fetch('/api/account/api-keys')</script></html>");
        return;
      }
      res.writeHead(200, {
        "content-type": "application/json",
        "set-cookie": "opencode_session_4096=secret; Path=/",
        "cache-control": "public, max-age=3600",
        "x-upstream": "oui",
      });
      res.end(JSON.stringify({ ok: true, path: url }));
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
async function workspace(
  over: { running?: boolean; port?: number; password?: string } = {},
) {
  seq += 1;
  const orgId = await newOrganization(t.db);
  const userId = `usr_px_${seq}_${randomBytes(3).toString("hex")}`;
  await t.db
    .insert(users)
    .values({ id: userId, name: "M", email: `${userId}@example.com` });
  await t.db.insert(members).values({
    id: `mem_${seq}_${randomBytes(3).toString("hex")}`,
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
      containerName: `nexora-code-px${seq}${randomBytes(4).toString("hex")}`,
      volumeName: `nexora-code-vol-px${seq}${randomBytes(4).toString("hex")}`,
      port: over.port ?? 41_000 + seq,
      desiredStatus: over.running === false ? "stopped" : "running",
    })
    .returning();
  if (!row) throw new Error("ligne");
  const password = over.password ?? `pw-${randomBytes(12).toString("hex")}`;
  await putSecret(t.db, keyring, {
    ref: passwordRef(row.id),
    value: password,
    kind: "other",
  });
  return { row, orgId, userId, password };
}

type Session = {
  userId: string;
  organizationId: string;
  emailVerified?: boolean;
  isStaff?: boolean;
  twoFactorEnabled?: boolean;
};
const deps = (
  session: Session | null,
  over: Partial<ProxyDeps> = {},
): ProxyDeps => ({
  db: () => t.db,
  keyring: () => keyring,
  siteUrl: SITE,
  now: () => new Date(),
  log: createLogger({ name: "test", sink: (l: string) => logs.push(l) }),
  upstreamHost: "127.0.0.1",
  allowSameOriginUi: false,
  // Chaque environnement de l'essai a son port (unique en base) ; ceux de 41000 à 41999 mènent au faux serveur.
  fetch: (input, init) =>
    fetch(String(input).replace(/:41\d{3}\//, `:${upstreamPort}/`), init),
  getContext: async () =>
    session
      ? {
          emailVerified: true,
          isStaff: false,
          twoFactorEnabled: false,
          ...session,
        }
      : null,
  ...over,
});

const call = (
  w: { row: { proxyId: string } },
  path: string,
  session: Session | null,
  init: RequestInit & { headers?: Record<string, string> } = {},
  over: Partial<ProxyDeps> = {},
) => {
  const url = `${SITE}/code/ws/${w.row.proxyId}${path}`;
  return handleWorkspaceProxy(
    new Request(url, init),
    w.row.proxyId,
    deps(session, over),
  );
};
const owner = (w: { userId: string; orgId: string }): Session => ({
  userId: w.userId,
  organizationId: w.orgId,
});

describe("autorisation", () => {
  it("sans session : 401 ; autre personne ou identifiant inconnu : la MÊME réponse 404", async () => {
    const w = await workspace();
    const other = await workspace();
    expect((await call(w, "/x", null)).status).toBe(401);
    const foreign = await call(w, "/x", owner(other));
    const unknown = await handleWorkspaceProxy(
      new Request(`${SITE}/code/ws/${"0".repeat(32)}/x`),
      "0".repeat(32),
      deps(owner(w)),
    );
    const malformed = await handleWorkspaceProxy(
      new Request(`${SITE}/code/ws/zz/x`),
      "zz",
      deps(owner(w)),
    );
    const answers = await Promise.all(
      [foreign, unknown, malformed].map(async (r) => ({
        s: r.status,
        b: await r.text(),
      })),
    );
    for (const a of answers) expect(a).toEqual(answers[0]);
    expect(answers[0]?.s).toBe(404);
    // et rien n'a atteint l'environnement
    expect(seen.length).toBe(0);
  });

  it("une personne qui n'est plus membre de l'organisation n'a plus accès", async () => {
    const w = await workspace();
    const res = await call(
      w,
      "/x",
      { userId: w.userId, organizationId: w.orgId },
      {},
      {
        isMember: async () => false,
      },
    );
    expect(res.status).toBe(404);
  });

  it("un compte du personnel sans 2FA est refusé (403)", async () => {
    const w = await workspace();
    expect(
      (
        await call(w, "/x", {
          ...owner(w),
          isStaff: true,
          twoFactorEnabled: false,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(w, "/x", {
          ...owner(w),
          isStaff: true,
          twoFactorEnabled: true,
        })
      ).status,
    ).toBe(200);
  });

  it("courriel non vérifié : 403", async () => {
    const w = await workspace();
    expect(
      (await call(w, "/x", { ...owner(w), emailVerified: false })).status,
    ).toBe(403);
  });

  it("environnement arrêté : 409 workspace_stopped, rien n'est transmis", async () => {
    const w = await workspace({ running: false });
    seen.length = 0;
    const res = await call(w, "/x", owner(w));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("workspace_stopped");
    expect(seen).toEqual([]);
  });

  it("authorizeWorkspace rend la cible (port, mot de passe) sans jamais l'exposer ailleurs", async () => {
    const w = await workspace({ password: "mdp-de-test-123" });
    const r = await authorizeWorkspace(w.row.proxyId, deps(owner(w)));
    expect(r.ok && r.target.port).toBe(w.row.port);
    expect(r.ok && r.target.password).toBe("mdp-de-test-123");
  });
});

describe("transmission", () => {
  it("ajoute l'authentification de l'environnement, retire cookies et en-têtes de la personne", async () => {
    const w = await workspace({ password: "mdp-test-abc" });
    seen.length = 0;
    const res = await call(w, "/session/list?limit=5&q=%C3%A9", owner(w), {
      headers: {
        cookie: "better-auth.session_token=SECRET",
        authorization: "Bearer nxk_pirate",
        origin: SITE,
        "x-forwarded-for": "1.2.3.4",
        accept: "application/json",
      },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      path: "/session/list?limit=5&q=%C3%A9",
    });
    const got = seen[0];
    expect(got?.url).toBe("/session/list?limit=5&q=%C3%A9");
    expect(got?.headers.authorization).toBe(
      `Basic ${Buffer.from("opencode:mdp-test-abc").toString("base64")}`,
    );
    expect(got?.headers.cookie).toBeUndefined();
    expect(got?.headers["x-forwarded-for"]).toBeUndefined();
    expect(got?.headers.origin).toBeUndefined();
    expect(got?.headers.accept).toBe("application/json");
  });

  it("transmet méthode et corps (POST, PATCH, DELETE) ; la même origine est exigée", async () => {
    const w = await workspace();
    seen.length = 0;
    const post = await call(w, "/session", owner(w), {
      method: "POST",
      headers: { origin: SITE, "content-type": "application/json" },
      body: JSON.stringify({ title: "essai" }),
    });
    expect(post.status).toBe(200);
    expect(seen[0]).toMatchObject({
      method: "POST",
      body: '{"title":"essai"}',
    });
    for (const method of ["PATCH", "DELETE", "PUT"]) {
      const ok = await call(w, "/session/1", owner(w), {
        method,
        headers: { origin: SITE },
        body: method === "DELETE" ? undefined : "{}",
      });
      expect(ok.status).toBe(200);
    }
    // origine étrangère ou absente : refusé avant tout transfert
    seen.length = 0;
    const evil = await call(w, "/session", owner(w), {
      method: "POST",
      headers: { origin: "https://evil.example" },
      body: "{}",
    });
    expect(evil.status).toBe(403);
    const none = await call(w, "/session", owner(w), {
      method: "POST",
      body: "{}",
    });
    expect(none.status).toBe(403);
    expect(seen).toEqual([]);
  });

  it("retire les cookies de l'environnement, rend le cache privé, garde le reste", async () => {
    const w = await workspace();
    const res = await call(w, "/session/list", owner(w));
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(res.headers.get("x-upstream")).toBe("oui");
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("diffuse un flux SSE au fil de l'eau, sans attendre la fin", async () => {
    const w = await workspace();
    const res = await call(w, "/event", owner(w));
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const t0 = Date.now();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain("data: un");
    expect(Date.now() - t0).toBeLessThan(120); // avant le second événement (150 ms)
    const second = await reader.read();
    expect(new TextDecoder().decode(second.value)).toContain("data: deux");
  });

  it("réécrit une redirection relative sous le préfixe et supprime une redirection vers l'extérieur", async () => {
    const w = await workspace();
    const res = await call(w, "/redirect", owner(w));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      `/code/ws/${w.row.proxyId}/session/abc`,
    );
    const abs = await call(w, "/redirect-abs", owner(w));
    expect(abs.headers.get("location")).toBeNull();
  });

  it("refuse les chemins qui sortent du préfixe (.., antislash, NUL)", async () => {
    const w = await workspace();
    seen.length = 0;
    for (const path of [
      "/../../api/account",
      "/%2e%2e/x",
      "/a%5cb",
      "/a%00b",
    ]) {
      const res = await call(w, path, owner(w));
      expect(res.status).toBe(400);
    }
    expect(seen).toEqual([]);
    // « a/%2E%2E/b » est normalisé par l'URL elle-même en « /b » : il reste sous le préfixe
    const inside = await call(w, "/a/%2E%2E/b", owner(w));
    expect((await inside.json()).path).toBe("/b");
  });

  it("l'environnement injoignable : 502, sans détail", async () => {
    const w = await workspace({
      port: 43_000 + Math.floor(Math.random() * 900),
    });
    const res = await call(w, "/x", owner(w));
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("ECONNREFUSED");
  });

  it("une demande WebSocket est refusée proprement (426) avec la marche à suivre", async () => {
    const w = await workspace();
    seen.length = 0;
    const res = await call(w, "/pty/abc/connect", owner(w), {
      headers: { upgrade: "websocket", connection: "Upgrade" },
    });
    expect(res.status).toBe(426);
    expect((await res.json()).error.code).toBe("websocket_unsupported");
    expect(seen).toEqual([]);
  });
});

describe("pages HTML (même origine que le site)", () => {
  it("refusées par défaut : un script de l'environnement ne doit pas tourner avec la session du site", async () => {
    const w = await workspace();
    const res = await call(w, "/page", owner(w), {
      headers: { "sec-fetch-dest": "document" },
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("dedicated_origin_required");
    // même sans l'en-tête du navigateur, une réponse HTML de l'environnement n'est pas relayée
    const sneaky = await call(w, "/page", owner(w));
    expect(sneaky.status).toBe(403);
  });

  it("admises seulement avec le réglage explicite (développement), toujours sans cookie de l'environnement", async () => {
    const w = await workspace();
    const res = await call(
      w,
      "/page",
      owner(w),
      {},
      { allowSameOriginUi: true },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("content-type")).toContain("text/html");
  });
});

describe("activité (arrêt automatique)", () => {
  it("note l'activité, au plus une fois toutes les 30 secondes", async () => {
    const w = await workspace();
    let now = new Date("2026-10-30T15:00:00Z");
    const d = { now: () => now };
    await call(w, "/a", owner(w), {}, d);
    const read = async () =>
      (
        await t.db
          .select()
          .from(codeWorkspaces)
          .where(eq(codeWorkspaces.id, w.row.id))
      )[0]?.lastActivityAt;
    expect((await read())?.toISOString()).toBe("2026-10-30T15:00:00.000Z");
    now = new Date("2026-10-30T15:00:10Z");
    await call(w, "/a", owner(w), {}, d);
    expect((await read())?.toISOString()).toBe("2026-10-30T15:00:00.000Z");
    now = new Date("2026-10-30T15:00:40Z");
    await call(w, "/a", owner(w), {}, d);
    expect((await read())?.toISOString()).toBe("2026-10-30T15:00:40.000Z");
  });
});

describe("GET /api/code/ws-auth (pour un mandataire de bordure qui porte les WebSocket)", () => {
  const ask = (id: string, session: Session | null, method = "GET") =>
    handleWorkspaceAuth(
      new Request(`${SITE}/api/code/ws-auth?id=${id}`, { method }),
      deps(session),
    );

  it("rend la cible et l'authentification à la personne propriétaire seulement, sans cache", async () => {
    const w = await workspace({ password: "mdp-bordure-1" });
    const res = await ask(w.row.proxyId, owner(w));
    expect(res.status).toBe(204);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-nexora-upstream")).toBe(
      `127.0.0.1:${w.row.port}`,
    );
    expect(res.headers.get("x-nexora-authorization")).toBe(
      `Basic ${Buffer.from("opencode:mdp-bordure-1").toString("base64")}`,
    );
  });

  it("sans session 401 ; autre personne ou inconnu 404 identiques ; arrêté 409 ; autre méthode 405", async () => {
    const w = await workspace();
    const other = await workspace();
    expect((await ask(w.row.proxyId, null)).status).toBe(401);
    const a = await ask(w.row.proxyId, owner(other));
    const b = await ask("0".repeat(32), owner(w));
    expect([a.status, await a.text()]).toEqual([b.status, await b.text()]);
    expect(a.status).toBe(404);
    const stopped = await workspace({ running: false });
    expect((await ask(stopped.row.proxyId, owner(stopped))).status).toBe(409);
    expect((await ask(w.row.proxyId, owner(w), "POST")).status).toBe(405);
  });
});

it("aucun secret dans les journaux", () => {
  const all = logs.join("\n");
  expect(all).not.toContain("SECRET");
  expect(all).not.toMatch(/Basic [A-Za-z0-9+/=]{10,}/);
});
