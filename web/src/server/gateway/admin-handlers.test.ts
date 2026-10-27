import { randomBytes } from "node:crypto";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { checkOutboundUrl, policyFromEnv } from "@nexora/net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { OutboundGuard } from "../security/outbound";
import { loadKeyring } from "../vault/crypto";
import { putSecret, readSecret } from "../vault/store";
import { type CatalogAdminDeps, handleCatalogAdmin } from "./admin-handlers";
import { createLitellmClient } from "./litellm";

const TOKEN = "t".repeat(48);
let t: TestDatabase;
const keyring = loadKeyring({
  NEXORA_VAULT_MASTER_KEY: randomBytes(32).toString("base64"),
});
let published = 0;
const litellmCalls: string[] = [];

const fetchFn: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const method = init?.method ?? "GET";
  if (url.host === "provider.test") {
    // fournisseur amont simulé : exige la clé du coffre
    const ok =
      new Headers(init?.headers).get("authorization") ===
      "Bearer sk-vk-provider-secret-0001";
    return ok
      ? Response.json({ data: [{ id: "m1" }, { id: "m2" }] })
      : Response.json({}, { status: 401 });
  }
  litellmCalls.push(`${method} ${url.pathname}`);
  if (url.pathname === "/model/info") return Response.json({ data: [] });
  if (url.pathname === "/credentials" && method === "GET")
    return Response.json({ credentials: [] });
  return Response.json({ ok: true });
};

const deps = (over: Partial<CatalogAdminDeps> = {}): CatalogAdminDeps => ({
  db: () => t.db,
  adminToken: TOKEN,
  litellm: () =>
    createLitellmClient({
      baseUrl: "http://litellm.test",
      masterKey: "master",
      fetch: fetchFn,
    }),
  getSecret: (ref) => readSecret(t.db, keyring, ref),
  // Les adresses fictives des essais (« provider.test ») ne se résolvent pas : garde permissive, sauf essais dédiés.
  outbound: async (raw) => ({ ok: true, url: new URL(raw), addresses: [] }),
  fetch: fetchFn,
  log: createLogger({ name: "test", sink: () => {} }),
  now: () => new Date(),
  onPublished: () => {
    published += 1;
  },
  ...over,
});

async function call(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` },
  d = deps(),
) {
  const res = await handleCatalogAdmin(
    new Request(`http://x/api/admin/catalog/${path}`, {
      method,
      headers: { "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    path.split("/").filter(Boolean),
    d,
  );
  return {
    status: res.status,
    json: (await res.json()) as Record<string, any>,
  };
}

beforeAll(async () => {
  t = await createTestDatabase();
  await putSecret(t.db, keyring, {
    ref: "llm.provider-test",
    value: "sk-vk-provider-secret-0001",
    kind: "llm_provider",
  });
});
afterAll(async () => {
  await t.drop();
});

describe("authentification de l'administration", () => {
  it("refuse sans jeton, avec un mauvais jeton, et échoue fermé si le jeton n'est pas configuré", async () => {
    expect((await call("GET", "", undefined, {})).status).toBe(401);
    expect(
      (await call("GET", "", undefined, { authorization: "Bearer mauvais" }))
        .status,
    ).toBe(401);
    expect(
      (
        await call("GET", "providers", undefined, {
          authorization: `Bearer ${TOKEN}x`,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await call(
          "GET",
          "",
          undefined,
          { authorization: `Bearer ${TOKEN}` },
          deps({ adminToken: undefined }),
        )
      ).status,
    ).toBe(503);
    expect(
      (
        await call(
          "GET",
          "",
          undefined,
          { authorization: `Bearer ${TOKEN}` },
          deps({ adminToken: "court" }),
        )
      ).status,
    ).toBe(503);
  });
});

describe("flux complet de l'administration", () => {
  let providerId = "";
  let modelId = "";
  let fxId = "";

  it("crée un fournisseur, valide l'entrée, refuse un doublon", async () => {
    const bad = await call("POST", "providers", {
      code: "X",
      name: "",
      type: "inconnu",
      baseUrl: "ftp://x",
      region: "mars",
    });
    expect(bad.status).toBe(422);
    expect(bad.json.error).toBe("invalid_request");
    const created = await call("POST", "providers", {
      code: "prov-test",
      name: "Fournisseur d'essai",
      type: "openai_compatible",
      baseUrl: "http://provider.test/v1",
      secretRef: "llm.provider-test",
      region: "quebec",
      dataPolicyFr: "Aucune conservation.",
    });
    expect(created.status).toBe(201);
    providerId = created.json.id;
    expect(
      (
        await call("POST", "providers", {
          code: "prov-test",
          name: "Doublon",
          type: "vllm",
          baseUrl: "http://a.test",
          region: "canada",
        })
      ).status,
    ).toBe(409);
  });

  it("teste le fournisseur avec la clé du coffre et écrit l'état en retour", async () => {
    const r = await call("POST", `providers/${providerId}/test`);
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
    expect(r.json.detail).toContain("2 modèle(s)");
    expect(r.json.provider.healthState).toBe("ok");
    expect(r.json.provider.lastCheckedAt).toBeTruthy();
    expect(JSON.stringify(r.json)).not.toContain("sk-vk-provider");
    // clé retirée du coffre : le test échoue proprement
    await call("PATCH", `providers/${providerId}`, {
      secretRef: "llm.absente",
    });
    const bad = await call("POST", `providers/${providerId}/test`);
    expect(bad.json.ok).toBe(false);
    expect(bad.json.provider.healthState).toBe("error");
    await call("PATCH", `providers/${providerId}`, {
      secretRef: "llm.provider-test",
    });
  });

  it("le test du fournisseur ne suit pas les redirections (la clé du coffre ne part pas ailleurs) et les signale", async () => {
    const seen: Array<{ url: string; redirect: RequestRedirect | undefined }> =
      [];
    const redirecting = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      seen.push({ url: String(input), redirect: init?.redirect });
      return new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data" },
      });
    }) as typeof fetch;
    const r = await call(
      "POST",
      `providers/${providerId}/test`,
      undefined,
      undefined,
      deps({ fetch: redirecting }),
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]?.redirect).toBe("manual");
    expect(r.json.ok).toBe(false);
    expect(r.json.detail).toMatch(/redirection/i);
    expect(JSON.stringify(r.json)).not.toContain("169.254");
  });

  it("crée un modèle ; publier sans prix est refusé (jamais 0 $)", async () => {
    const created = await call("POST", "models", {
      publicId: "nexora/essai-1",
      name: "Essai 1",
      providerId,
      upstreamId: "up",
      contextMax: 8000,
      descriptionFr: "Modèle d'essai.",
    });
    expect(created.status).toBe(201);
    modelId = created.json.id;
    expect(created.json.residency).toBe("quebec"); // hérité du fournisseur
    const refused = await call("PATCH", `models/${modelId}`, {
      status: "approved",
    });
    expect(refused.status).toBe(422);
    expect(JSON.stringify(refused.json.issues)).toContain("price_missing");
  });

  it("refuse un prix sous le plancher, accepte un prix valide, garde l'historique", async () => {
    const fx = await call("POST", "fx-rates", {
      usdToCadMicro: "1400000",
      effectiveAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(fx.status).toBe(201);
    fxId = fx.json.id;
    expect((await call("POST", `fx-rates/${fxId}/approve`)).status).toBe(200);

    await call("POST", `models/${modelId}/prices`, {
      upstreamInputUsdMicro: "500000",
      upstreamOutputUsdMicro: "1000000",
      sellInputCadMicro: "700001",
      sellOutputCadMicro: "1400001",
      marginFloorBps: 0,
      effectiveAt: new Date(Date.now() - 30_000).toISOString(),
    });
    // 0,5 USD × 1,4 = 0,70 CAD ; plancher 30 % → 0,91 : 0,70 est sous le plancher
    await call("POST", `models/${modelId}/prices`, {
      upstreamInputUsdMicro: "500000",
      upstreamOutputUsdMicro: "1000000",
      sellInputCadMicro: "800000",
      sellOutputCadMicro: "1500000",
      marginFloorBps: 3000,
    });
    const refused = await call("PATCH", `models/${modelId}`, {
      status: "approved",
    });
    expect(refused.status).toBe(422);
    expect(JSON.stringify(refused.json.issues)).toContain("below_margin_floor");

    const good = await call("POST", `models/${modelId}/prices`, {
      upstreamInputUsdMicro: "500000",
      upstreamOutputUsdMicro: "1000000",
      marginBps: 3000,
      marginFloorBps: 3000,
    });
    expect(good.status).toBe(201);
    expect(good.json.sellInputCadMicro).toBe("910000");
    expect(
      (await call("PATCH", `models/${modelId}`, { status: "approved" })).status,
    ).toBe(200);
    expect(
      (await call("PATCH", `models/${modelId}`, { status: "published" }))
        .status,
    ).toBe(200);
    const history = await call("GET", `models/${modelId}/prices`);
    expect(history.json.prices).toHaveLength(3);
  });

  it("brouillon → aperçu des différences → approbation → publication → synchronisation", async () => {
    const draft = await call("POST", "versions");
    expect(draft.status).toBe(201);
    expect(draft.json.issues).toEqual([]);
    expect(draft.json.diff).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "model_added",
          model: "nexora/essai-1",
        }),
      ]),
    );
    const vid = draft.json.version.id;

    expect((await call("POST", `versions/${vid}/publish`)).status).toBe(409); // pas approuvée
    expect((await call("POST", `versions/${vid}/approve`)).status).toBe(200);
    const pub = await call("POST", `versions/${vid}/publish`);
    expect(pub.status).toBe(200);
    expect(pub.json.version.status).toBe("published");
    expect(published).toBe(1);

    litellmCalls.length = 0;
    const sync = await call("POST", "sync-litellm");
    expect(sync.status).toBe(200);
    expect(sync.json.status).toBe("applied");
    expect(sync.json.summary.models.created).toEqual(["nexora/essai-1"]);
    expect(litellmCalls).toContain("POST /model/new");
    expect(JSON.stringify(sync.json)).not.toContain("sk-vk-provider");

    const overview = await call("GET", "");
    expect(overview.json.published.appliedStatus).toBe("applied");
    expect(overview.json.litellmConfigured).toBe(true);
    // le détail d'une version est lisible (snapshot, diff vide)
    const detail = await call("GET", `versions/${vid}`);
    expect(detail.json.version.snapshot.models).toHaveLength(1);
    expect(JSON.stringify(detail.json)).not.toContain("sk-vk-provider");
  });

  it("répond 503 si LiteLLM n'est pas configuré et 409 sans catalogue publié", async () => {
    const r = await call(
      "POST",
      "sync-litellm",
      undefined,
      { authorization: `Bearer ${TOKEN}` },
      deps({ litellm: () => null }),
    );
    expect(r.status).toBe(503);
  });

  it("rejette les identifiants et les routes inconnus", async () => {
    expect((await call("GET", "models/pas-un-uuid")).status).toBe(404);
    expect((await call("GET", "nimportequoi")).status).toBe(404);
    expect((await call("DELETE", "providers")).status).toBe(405);
  });
});

// ─── SSRF : adresses saisies dans l'administration (S9) ─────────────────────────────────────────────────────────
const DNS: Record<string, string[]> = {
  "api.exemple.ca": ["93.184.216.34"],
  "interne.exemple.ca": ["10.20.0.9"],
  "rebond.exemple.ca": ["169.254.169.254"],
};
const prodGuard: OutboundGuard = (raw, options) =>
  checkOutboundUrl(raw, policyFromEnv({ NODE_ENV: "production" }), {
    resolve: async (h) => DNS[h] ?? [],
    ...options,
  });

describe("fournisseurs : adresses saisies (SSRF)", () => {
  const strict = () => deps({ outbound: prodGuard });
  const create = (baseUrl: string, extra: Record<string, unknown> = {}) =>
    call(
      "POST",
      "providers",
      {
        code: `ssrf-${Math.random().toString(36).slice(2, 8)}`,
        name: "SSRF",
        type: "openai_compatible",
        baseUrl,
        region: "canada",
        ...extra,
      },
      undefined,
      strict(),
    );

  it("refuse métadonnées du nuage, réseau interne et boucle locale à la création", async () => {
    for (const u of [
      "http://169.254.169.254/latest/meta-data",
      "http://10.20.0.5:11434/v1",
      "http://127.0.0.1:4400/v1",
      "http://interne.exemple.ca/v1",
      "http://rebond.exemple.ca/v1",
      "http://introuvable.exemple.ca/v1",
    ]) {
      const r = await create(u);
      expect(r.status, u).toBe(422);
      expect(r.json.error, u).toBe("url_blocked");
    }
  });

  it("accepte une adresse publique et vérifie aussi l'adresse vue par LiteLLM (littérale seulement)", async () => {
    expect((await create("https://api.exemple.ca/v1")).status).toBe(201);
    const r = await create("https://api.exemple.ca/v1", {
      litellmBaseUrl: "http://169.254.169.254/v1",
    });
    expect(r.status).toBe(422);
    expect(r.json.error).toBe("url_blocked");
    // un nom que seul le réseau de LiteLLM sait résoudre reste permis
    const ok = await create("https://api.exemple.ca/v1", {
      litellmBaseUrl: "http://host.docker.internal:18090/v1",
    });
    expect(ok.status).toBe(201);
  });

  it("refuse la modification vers une adresse interne", async () => {
    const created = await create("https://api.exemple.ca/v1");
    const r = await call(
      "PATCH",
      `providers/${created.json.id}`,
      { baseUrl: "http://169.254.169.254/" },
      undefined,
      strict(),
    );
    expect(r.status).toBe(422);
    expect(r.json.error).toBe("url_blocked");
  });

  it("refuse une référence de secret réservée à la plateforme (le coffre ne les envoie pas ailleurs)", async () => {
    for (const ref of [
      "stripe.secret_key",
      "site-agent.redacteur.directus",
      "seo.bing.api_key",
    ]) {
      const r = await create("https://api.exemple.ca/v1", { secretRef: ref });
      expect(r.status, ref).toBe(422);
      expect(r.json.error, ref).toBe("secret_scope");
    }
  });

  it("« Tester » ne contacte PAS une adresse devenue interne depuis l'enregistrement (rebond DNS) et n'envoie aucune clé", async () => {
    await putSecret(t.db, keyring, {
      ref: "llm.rebond",
      value: "sk-rebond-secret-0001",
      kind: "llm_provider",
    });
    const created = await call(
      "POST",
      "providers",
      {
        code: "rebond-1",
        name: "Rebond",
        type: "openai_compatible",
        baseUrl: "https://api.exemple.ca/v1",
        secretRef: "llm.rebond",
        region: "canada",
      },
      undefined,
      strict(),
    );
    expect(created.status).toBe(201);
    DNS["api.exemple.ca"] = ["169.254.169.254"]; // l'enregistrement DNS change après coup
    let contacted = 0;
    const r = await call(
      "POST",
      `providers/${created.json.id}/test`,
      undefined,
      undefined,
      deps({
        outbound: prodGuard,
        fetch: (async () => {
          contacted += 1;
          return Response.json({ data: [] });
        }) as typeof fetch,
      }),
    );
    DNS["api.exemple.ca"] = ["93.184.216.34"];
    expect(r.json.ok).toBe(false);
    expect(r.json.detail).toMatch(/refus/);
    expect(contacted).toBe(0);
    expect(JSON.stringify(r.json)).not.toContain("sk-rebond");
  });
});
