import { createLogger } from "@nexora/log";
import { describe, expect, it } from "vitest";
import {
  handleCodeWorkspace,
  handleCreateRag,
  type PanelServicesDeps,
} from "./panel-handlers";
import { FakeCodeWorkspace, FakeRagPanel, workspaceState } from "./test-support";

const SITE = "https://site.example";
type Ctx = { userId: string; organizationId: string; role: "owner" | "member" };
const owner: Ctx = { userId: "u1", organizationId: "org1", role: "owner" };
const member: Ctx = { userId: "u2", organizationId: "org1", role: "member" };

function setup(
  over: Partial<PanelServicesDeps> & { ctx?: Ctx | null } = {},
): { deps: PanelServicesDeps; rag: FakeRagPanel; code: FakeCodeWorkspace; logs: string[] } {
  const rag = new FakeRagPanel();
  const code = new FakeCodeWorkspace();
  const logs: string[] = [];
  const { ctx, ...rest } = over;
  const deps: PanelServicesDeps = {
    siteUrl: SITE,
    getContext: async () => (ctx === undefined ? owner : ctx),
    rateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
    log: createLogger({ name: "test", sink: (line) => logs.push(line) }),
    ragEnabled: () => true,
    codeEnabled: () => true,
    rag: () => rag,
    code: () => code,
    ...rest,
  };
  return { deps, rag, code, logs };
}

const post = (url: string, body: unknown, origin: string | null = SITE) =>
  new Request(`${SITE}${url}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(origin ? { origin } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const get = (url: string) => new Request(`${SITE}${url}`);

describe("POST /api/account/rag : créer mon RAG en un clic", () => {
  const url = "/api/account/rag";

  it("crée la base et sa clé, montre la clé UNE fois et ne la met pas en cache", async () => {
    const { deps, rag } = setup();
    const res = await handleCreateRag(post(url, { name: " Contrats " }), deps);
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.key).toEqual({
      id: "k1",
      prefix: "nxk_abcd",
      secret: "nxk_abcd_SECRET_VALUE",
    });
    expect(body.base).toMatchObject({ name: "Contrats", usedBytes: 0 });
    expect(body.connection.mcpUrl).toBe("https://site.example/v1/rag/mcp");
    // L'organisation et la personne viennent de la session, jamais du corps de la requête.
    expect(rag.created).toEqual([
      { orgId: "org1", userId: "u1", name: "Contrats" },
    ]);
  });

  it("n'écrit jamais la clé dans le journal", async () => {
    const { deps, logs } = setup();
    await handleCreateRag(post(url, { name: "Mon RAG" }), deps);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.join("\n")).not.toContain("SECRET_VALUE");
    expect(logs.join("\n")).not.toContain("nxk_");
  });

  it("origine étrangère ou absente : refusé avant tout", async () => {
    const { deps, rag } = setup();
    expect(
      (await handleCreateRag(post(url, { name: "x" }, "https://evil.example"), deps)).status,
    ).toBe(403);
    expect((await handleCreateRag(post(url, { name: "x" }, null), deps)).status).toBe(403);
    expect(rag.created).toEqual([]);
  });

  it("sans session : 401 ; membre simple : 403 (seul le propriétaire crée des clés)", async () => {
    expect(
      (await handleCreateRag(post(url, { name: "x" }), setup({ ctx: null }).deps)).status,
    ).toBe(401);
    const m = setup({ ctx: member });
    expect((await handleCreateRag(post(url, { name: "x" }), m.deps)).status).toBe(403);
    expect(m.rag.created).toEqual([]);
  });

  it("trop d'appels : 429 avec Retry-After", async () => {
    const { deps } = setup({
      rateLimit: async () => ({ allowed: false, retryAfterSeconds: 42 }),
    });
    const res = await handleCreateRag(post(url, { name: "x" }), deps);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("42");
  });

  it("interrupteur éteint : 404 not_available, le service n'est pas appelé ; allumé sans service : 503", async () => {
    const off = setup({ ragEnabled: () => false });
    const res = await handleCreateRag(post(url, { name: "x" }), off.deps);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_available");
    expect(off.rag.created).toEqual([]);
    const none = setup({ rag: () => null });
    expect((await handleCreateRag(post(url, { name: "x" }), none.deps)).status).toBe(503);
  });

  it("corps invalide : nom vide, trop long, champ inconnu, JSON cassé → 422", async () => {
    const { deps, rag } = setup();
    for (const body of [
      {},
      { name: "   " },
      { name: "x".repeat(81) },
      { name: "ok", orgId: "autre" },
      "pas du json",
    ])
      expect((await handleCreateRag(post(url, body), deps)).status, JSON.stringify(body)).toBe(422);
    expect(rag.created).toEqual([]);
  });

  it("chaque refus du service a son code HTTP et aucune clé n'est rendue", async () => {
    const cases: [string, number][] = [
      ["quota_exceeded", 402],
      ["no_credits", 402],
      ["base_exists", 409],
      ["base_limit", 409],
      ["key_limit", 409],
      ["unavailable", 503],
    ];
    for (const [reason, status] of cases) {
      const { deps, rag } = setup();
      rag.nextCreate = { ok: false, reason: reason as never };
      const res = await handleCreateRag(post(url, { name: "x" }), deps);
      expect(res.status, reason).toBe(status);
      const body = await res.json();
      expect(body.error, reason).toBe(reason);
      expect(JSON.stringify(body)).not.toContain("secret");
    }
  });

  it("une erreur du service donne 500 sans fuite de son message", async () => {
    const { deps, rag, logs } = setup();
    rag.nextCreate = new Error("postgres://user:pass@db/app");
    const res = await handleCreateRag(post(url, { name: "x" }), deps);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("postgres");
    expect(logs.join("\n")).not.toContain("pass@db");
  });
});

describe("/api/account/code/workspace : l'environnement de la personne", () => {
  const url = "/api/account/code/workspace";

  it("GET rend l'état de CETTE personne ; un membre simple y a droit", async () => {
    const { deps, code } = setup({ ctx: member });
    code.state = workspaceState({
      status: "ready",
      usedBytes: 12,
      openUrl: "https://code.example/u2",
    });
    const res = await handleCodeWorkspace(get(url), deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      status: "ready",
      usedBytes: 12,
      openUrl: "https://code.example/u2",
    });
    expect(code.calls).toEqual([
      { method: "getState", orgId: "org1", userId: "u2" },
    ]);
  });

  it("GET sans session : 401 ; interrupteur éteint : 404 ; sans service : 503", async () => {
    expect((await handleCodeWorkspace(get(url), setup({ ctx: null }).deps)).status).toBe(401);
    expect(
      (await handleCodeWorkspace(get(url), setup({ codeEnabled: () => false }).deps)).status,
    ).toBe(404);
    expect(
      (await handleCodeWorkspace(get(url), setup({ code: () => null }).deps)).status,
    ).toBe(503);
  });

  it("POST démarre l'environnement (origine contrôlée) et rend l'état « en démarrage »", async () => {
    const { deps, code } = setup({ ctx: member });
    const res = await handleCodeWorkspace(post(url, {}), deps);
    expect(res.status).toBe(202);
    expect((await res.json()).status).toBe("starting");
    expect(code.calls).toEqual([{ method: "start", orgId: "org1", userId: "u2" }]);
  });

  it("POST d'une autre origine : 403, rien n'est démarré", async () => {
    const { deps, code } = setup();
    const res = await handleCodeWorkspace(post(url, {}, "https://evil.example"), deps);
    expect(res.status).toBe(403);
    expect(code.calls).toEqual([]);
  });

  it("POST : espace épuisé → 402, service indisponible → 503, panne → 500 sans fuite", async () => {
    const q = setup();
    q.code.nextStart = { ok: false, reason: "quota_exceeded" };
    const quota = await handleCodeWorkspace(post(url, {}), q.deps);
    expect(quota.status).toBe(402);
    expect((await quota.json()).error).toBe("quota_exceeded");
    const u = setup();
    u.code.nextStart = { ok: false, reason: "unavailable" };
    expect((await handleCodeWorkspace(post(url, {}), u.deps)).status).toBe(503);
    const e = setup();
    e.code.nextStart = new Error("docker.sock refusé");
    const res = await handleCodeWorkspace(post(url, {}), e.deps);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("docker");
  });

  it("une adresse d'ouverture dangereuse n'est jamais rendue au navigateur", async () => {
    const { deps, code } = setup();
    code.state = workspaceState({ status: "ready", openUrl: "javascript:alert(1)" });
    const body = await (await handleCodeWorkspace(get(url), deps)).json();
    expect(body.openUrl).toBeNull();
    expect(body.status).toBe("starting");
  });

  it("POST trop fréquent : 429", async () => {
    const { deps } = setup({
      rateLimit: async () => ({ allowed: false, retryAfterSeconds: 7 }),
    });
    expect((await handleCodeWorkspace(post(url, {}), deps)).status).toBe(429);
  });
});
