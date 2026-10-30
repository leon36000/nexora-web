import { createLogger } from "@nexora/log";
import { describe, expect, it } from "vitest";
import { handleCodeWorkspace, type PanelServicesDeps } from "./panel-handlers";
import { FakeCodeWorkspace, workspaceState } from "./test-support";

const SITE = "https://site.example";
type Ctx = { userId: string; organizationId: string; role: "owner" | "member" };
const owner: Ctx = { userId: "u1", organizationId: "org1", role: "owner" };
const member: Ctx = { userId: "u2", organizationId: "org1", role: "member" };

function setup(over: Partial<PanelServicesDeps> & { ctx?: Ctx | null } = {}): {
  deps: PanelServicesDeps;
  code: FakeCodeWorkspace;
  logs: string[];
} {
  const code = new FakeCodeWorkspace();
  const logs: string[] = [];
  const { ctx, ...rest } = over;
  const deps: PanelServicesDeps = {
    siteUrl: SITE,
    getContext: async () => (ctx === undefined ? owner : ctx),
    rateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
    log: createLogger({ name: "test", sink: (line) => logs.push(line) }),
    codeEnabled: () => true,
    code: () => code,
    ...rest,
  };
  return { deps, code, logs };
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
    expect(
      (await handleCodeWorkspace(get(url), setup({ ctx: null }).deps)).status,
    ).toBe(401);
    expect(
      (
        await handleCodeWorkspace(
          get(url),
          setup({ codeEnabled: () => false }).deps,
        )
      ).status,
    ).toBe(404);
    expect(
      (await handleCodeWorkspace(get(url), setup({ code: () => null }).deps))
        .status,
    ).toBe(503);
  });

  it("POST démarre l'environnement (origine contrôlée) et rend l'état « en démarrage »", async () => {
    const { deps, code } = setup({ ctx: member });
    const res = await handleCodeWorkspace(post(url, {}), deps);
    expect(res.status).toBe(202);
    expect((await res.json()).status).toBe("starting");
    expect(code.calls).toEqual([
      { method: "start", orgId: "org1", userId: "u2" },
    ]);
  });

  it("POST d'une autre origine : 403, rien n'est démarré", async () => {
    const { deps, code } = setup();
    const res = await handleCodeWorkspace(
      post(url, {}, "https://evil.example"),
      deps,
    );
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
    code.state = workspaceState({
      status: "ready",
      openUrl: "javascript:alert(1)",
    });
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
