import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { checkOutboundUrl, policyFromEnv } from "@nexora/net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { OutboundGuard } from "../security/outbound";
import {
  type HostedAgentsAdminDeps,
  handleHostedAgentsAdmin,
} from "./handlers";

const TOKEN = "jeton-admin-de-test-0123456789abcdef-0123";
const WS_KEY = "sk-nexora-CLE-WORKSTUDIO-SECRETE-0123456789abcdef";

let t: TestDatabase;
let lines: string[];
let changes: number;
let wsFetch: (url: string) => Response | Promise<Response>;
let vault: Map<string, string>;

const deps = (
  over: Partial<HostedAgentsAdminDeps> = {},
): HostedAgentsAdminDeps => ({
  db: () => t.db,
  adminToken: TOKEN,
  getSecret: async (ref) => {
    const v = vault.get(ref);
    if (!v) throw new Error("absent");
    return v;
  },
  // Les adresses fictives des essais (« a.b ») ne se résolvent pas : garde permissive, sauf essais dédiés.
  outbound: async (raw) => ({ ok: true, url: new URL(raw), addresses: [] }),
  fetch: (async (url) => wsFetch(String(url))) as typeof fetch,
  log: createLogger({ name: "test", sink: (l) => lines.push(l) }),
  now: () => new Date(),
  onChanged: () => {
    changes += 1;
  },
  ...over,
});

async function call(
  method: string,
  path: string,
  body?: unknown,
  token: string | null = TOKEN,
  d: HostedAgentsAdminDeps = deps(),
) {
  const segments = path.split("/").filter(Boolean);
  const res = await handleHostedAgentsAdmin(
    new Request(`http://localhost/api/admin/hosted-agents/${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    segments,
    d,
  );
  const text = await res.text();
  return { status: res.status, text, json: text ? JSON.parse(text) : null };
}

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});
beforeEach(() => {
  lines = [];
  changes = 0;
  vault = new Map([["workstudio.essai", WS_KEY]]);
  wsFetch = () =>
    Response.json({
      data: [
        {
          id: "agent:Assistant général",
          name: "Assistant général",
          description: "Répond.",
        },
      ],
    });
});

let n = 0;
async function newInstance(over: Record<string, unknown> = {}) {
  n += 1;
  const res = await call("POST", "instances", {
    code: `ws-${n}`,
    name: "WorkStudio d'essai",
    baseUrl: "http://127.0.0.1:3200/v1/",
    secretRef: "workstudio.essai",
    ...over,
  });
  expect(res.status).toBe(201);
  return res.json as { id: string; baseUrl: string };
}

describe("authentification", () => {
  it("refuse sans jeton, avec un mauvais jeton, et échoue fermé sans configuration", async () => {
    expect((await call("GET", "", undefined, null)).status).toBe(401);
    expect((await call("GET", "", undefined, `${TOKEN}x`)).status).toBe(401);
    const res = await handleHostedAgentsAdmin(
      new Request("http://localhost/x", {
        headers: { authorization: `Bearer ${TOKEN}` },
      }),
      [],
      deps({ adminToken: undefined }),
    );
    expect(res.status).toBe(503);
  });
});

describe("instances", () => {
  it("crée une instance, normalise l'adresse et n'expose jamais la clé", async () => {
    const inst = await newInstance();
    expect(inst.baseUrl).toBe("http://127.0.0.1:3200");
    const list = await call("GET", "instances");
    expect(list.status).toBe(200);
    expect(list.text).not.toContain(WS_KEY);
    expect(list.json.instances[0]).toMatchObject({
      secretRef: "workstudio.essai",
    });
  });

  it("refuse une adresse, un code ou des champs invalides", async () => {
    for (const body of [
      { code: "AB", name: "x", baseUrl: "http://a.b" },
      { code: "ok-code", name: "x", baseUrl: "ftp://a.b" },
      { code: "ok-code", name: "x", baseUrl: "http://u:p@a.b" },
      { code: "ok-code", name: "x", baseUrl: "http://a.b", extra: 1 },
      {
        code: "ok-code",
        name: "x",
        baseUrl: "http://a.b",
        secretRef: "Pas Valide",
      },
    ])
      expect((await call("POST", "instances", body)).status).toBe(422);
  });

  it("refuse un code déjà pris (409)", async () => {
    const body = { code: "doublon-1", name: "x", baseUrl: "http://a.b" };
    expect((await call("POST", "instances", body)).status).toBe(201);
    expect((await call("POST", "instances", body)).status).toBe(409);
  });

  it("teste la connexion et garde un résumé sans secret", async () => {
    const inst = await newInstance();
    const ok = await call("POST", `instances/${inst.id}/test`);
    expect(ok.status).toBe(200);
    expect(ok.json).toMatchObject({ ok: true });
    expect(ok.json.instance.healthState).toBe("ok");
    wsFetch = () =>
      Response.json({ error: { message: `refus ${WS_KEY}` } }, { status: 401 });
    const ko = await call("POST", `instances/${inst.id}/test`);
    expect(ko.json.ok).toBe(false);
    expect(ko.json.instance.healthState).toBe("error");
    expect(ko.text).not.toContain(WS_KEY);
    expect(lines.join("\n")).not.toContain(WS_KEY);
  });
});

describe("découverte et publication", () => {
  it("découvre des brouillons sans rien publier, puis publie seulement un agent complet avec prix", async () => {
    const inst = await newInstance();
    const found = await call("POST", `instances/${inst.id}/discover`);
    expect(found.status).toBe(200);
    expect(found.json.created).toHaveLength(1);
    const agent = found.json.created[0];
    expect(agent).toMatchObject({
      status: "draft",
      slug: "assistant-general",
      nameEn: "",
    });

    // Redécouvrir ne recrée rien.
    const again = await call("POST", `instances/${inst.id}/discover`);
    expect(again.json.created).toHaveLength(0);
    expect(again.json.seen).toHaveLength(1);

    const refused = await call("PATCH", `agents/${agent.id}`, {
      status: "published",
    });
    expect(refused.status).toBe(422);
    expect(refused.json.error).toBe("publication_refused");
    expect(
      refused.json.issues.map((i: { code: string }) => i.code).sort(),
    ).toEqual(["description_en_missing", "name_en_missing", "price_missing"]);

    expect(
      (
        await call("PATCH", `agents/${agent.id}`, {
          nameEn: "General assistant",
          descriptionEn: "Answers.",
          category: "general",
        })
      ).status,
    ).toBe(200);
    const price = await call("POST", `agents/${agent.id}/prices`, {
      perRunCadMicro: "50000",
      inputCadMicro: 1_000_000,
    });
    expect(price.status).toBe(201);
    expect(price.json).toMatchObject({
      perRunCadMicro: "50000",
      isTrial: true,
    });
    const published = await call("PATCH", `agents/${agent.id}`, {
      status: "published",
    });
    expect(published.status).toBe(200);
    expect(published.json).toMatchObject({ status: "published", issues: [] });
    expect(published.json.currentPrice).toMatchObject({ isTrial: true });
    expect(changes).toBeGreaterThan(0);
  });

  it("répond 502 à une découverte impossible, sans clé dans la réponse", async () => {
    const inst = await newInstance({ secretRef: "workstudio.absent" });
    const res = await call("POST", `instances/${inst.id}/discover`);
    expect(res.status).toBe(502);
    expect(res.json.detail).toContain("coffre");
  });

  it("refuse un prix à 0 $ et des champs inconnus", async () => {
    const inst = await newInstance();
    const found = await call("POST", `instances/${inst.id}/discover`);
    const id = found.json.created[0]?.id ?? found.json.seen[0]?.id;
    expect(
      (await call("POST", `agents/${id}/prices`, { perRunCadMicro: "0" }))
        .status,
    ).toBe(422);
    expect(
      (
        await call("POST", `agents/${id}/prices`, {
          perRunCadMicro: 1,
          prixAmont: 1,
        })
      ).status,
    ).toBe(422);
    expect(
      (await call("PATCH", `agents/${id}`, { slug: "autre" })).status,
    ).toBe(422);
    expect(
      (await call("PATCH", `agents/${id}`, { upstreamId: "gpt-4" })).status,
    ).toBe(422);
  });

  it("répond 404 pour un identifiant inconnu ou une route inconnue, 405 pour une méthode refusée", async () => {
    expect(
      (await call("GET", "agents/00000000-0000-4000-8000-000000000000")).status,
    ).toBe(404);
    expect((await call("GET", "agents/pas-un-uuid")).status).toBe(404);
    expect((await call("GET", "inconnu")).status).toBe(404);
    expect((await call("DELETE", "instances")).status).toBe(405);
  });
});

describe("bulle WorkStudio", () => {
  it("lit et enregistre le réglage avec validation", async () => {
    expect((await call("GET", "embed")).json).toMatchObject({ enabled: false });
    const saved = await call("PATCH", "embed", {
      origin: "http://localhost:3200",
      chatIdentifier: "assistant-9bc75ebb",
      pages: ["/agents"],
      enabled: true,
    });
    expect(saved.status).toBe(200);
    expect(saved.json).toMatchObject({
      enabled: true,
      origin: "http://localhost:3200",
    });
    expect(
      (await call("PATCH", "embed", { origin: "https://*.exemple.ca" })).status,
    ).toBe(422);
    expect(
      (await call("PATCH", "embed", { pages: ["pas-un-chemin"] })).status,
    ).toBe(422);
    expect((await call("PATCH", "embed", { enabled: "oui" })).status).toBe(422);
  });

  it("la vue d'ensemble regroupe instances, agents et bulle", async () => {
    const res = await call("GET", "");
    expect(Object.keys(res.json).sort()).toEqual([
      "agents",
      "embed",
      "instances",
    ]);
  });
});

// ─── SSRF : adresse d'instance saisie dans l'administration (S9) ───────────────────────────────────────────────────
describe("instances : adresses saisies (SSRF)", () => {
  const DNS: Record<string, string[]> = {
    "ws.exemple.ca": ["93.184.216.34"],
    "interne.exemple.ca": ["10.20.0.9"],
  };
  const prodGuard: OutboundGuard = (raw, options) =>
    checkOutboundUrl(raw, policyFromEnv({ NODE_ENV: "production" }), {
      resolve: async (h) => DNS[h] ?? [],
      ...options,
    });
  const strict = () => deps({ outbound: prodGuard });
  const create = (baseUrl: string, extra: Record<string, unknown> = {}) =>
    call(
      "POST",
      "instances",
      {
        code: `ssrf-${Math.random().toString(36).slice(2, 8)}`,
        name: "SSRF",
        baseUrl,
        ...extra,
      },
      TOKEN,
      strict(),
    );

  it("refuse métadonnées du nuage, réseau interne et boucle locale", async () => {
    for (const u of [
      "http://169.254.169.254",
      "http://10.20.0.5:3200",
      "http://127.0.0.1:3200",
      "http://interne.exemple.ca:3200",
    ]) {
      const r = await create(u);
      expect(r.status, u).toBe(422);
      expect(r.json.error, u).toBe("url_blocked");
    }
    expect((await create("https://ws.exemple.ca")).status).toBe(201);
  });

  it("refuse une référence de secret réservée à la plateforme", async () => {
    const r = await create("https://ws.exemple.ca", {
      secretRef: "stripe.secret_key",
    });
    expect(r.status).toBe(422);
    expect(r.json.error).toBe("secret_scope");
  });

  it("test et découverte ne contactent pas une adresse devenue interne, et n'envoient pas la clé", async () => {
    const inst = await create("https://ws.exemple.ca", {
      secretRef: "workstudio.essai",
    });
    expect(inst.status).toBe(201);
    DNS["ws.exemple.ca"] = ["169.254.169.254"];
    let contacted = 0;
    const d = deps({
      outbound: prodGuard,
      fetch: (async () => {
        contacted += 1;
        return Response.json({ data: [] });
      }) as typeof fetch,
    });
    for (const action of ["test", "discover"]) {
      const r = await call(
        "POST",
        `instances/${inst.json.id}/${action}`,
        undefined,
        TOKEN,
        d,
      );
      expect(JSON.stringify(r.json), action).toMatch(/refus/);
      expect(JSON.stringify(r.json)).not.toContain(WS_KEY);
    }
    DNS["ws.exemple.ca"] = ["93.184.216.34"];
    expect(contacted).toBe(0);
  });
});
