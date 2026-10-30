import { randomBytes } from "node:crypto";
import { configVersions, eq, models } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadKeyring } from "../vault/crypto";
import { putSecret, readSecret } from "../vault/store";
import {
  addFxRate,
  addPrice,
  addRoute,
  approveFxRate,
  approveVersion,
  createDraftVersion,
  createModel,
  createProvider,
  publishVersion,
  updateModel,
  updateRoute,
} from "./catalog";
import {
  apiBaseFor,
  createLitellmClient,
  litellmModelString,
  openrouterPreferences,
  routeDeploymentId,
  routePositionOf,
  SyncError,
  syncLitellm,
} from "./litellm";

/** Simulateur minimal de l'API d'administration de LiteLLM (état en mémoire). */
function fakeLitellm() {
  const state = {
    models: new Map<string, Record<string, unknown>>([
      ["config-file-model", { model_name: "dev/cloud-glm-5-3" }],
    ]),
    credentials: new Map<string, Record<string, unknown>>(),
    calls: [] as string[],
    failOn: null as string | null,
  };
  const fetchFn: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer master-test-key",
    );
    const path = url.pathname;
    state.calls.push(`${method} ${path}`);
    const json = (o: unknown, status = 200) => Response.json(o, { status });
    if (state.failOn === path) return json({ error: "boom" }, 500);
    if (path === "/model/info")
      return json({
        data: [...state.models].map(([id, m]) => ({
          ...m,
          model_info: { id },
        })),
      });
    if (path === "/credentials" && method === "GET")
      return json({
        credentials: [...state.credentials.keys()].map((n) => ({
          credential_name: n,
        })),
      });
    if (path === "/credentials" && method === "POST") {
      state.credentials.set(body.credential_name, body.credential_values);
      return json({ success: true });
    }
    if (path.startsWith("/credentials/") && method === "PATCH") {
      const name = decodeURIComponent(path.split("/")[2] ?? "");
      state.credentials.set(name, {
        ...state.credentials.get(name),
        ...body.credential_values,
      });
      return json({ success: true });
    }
    if (path.startsWith("/credentials/") && method === "DELETE") {
      state.credentials.delete(decodeURIComponent(path.split("/")[2] ?? ""));
      return json({ success: true });
    }
    if (path === "/model/new" || path === "/model/update") {
      state.models.set(body.model_info.id, body);
      return json({ ok: true });
    }
    if (path === "/model/delete") {
      state.models.delete(body.id);
      return json({ ok: true });
    }
    return json({}, 404);
  };
  return {
    state,
    client: createLitellmClient({
      baseUrl: "http://litellm.test",
      masterKey: "master-test-key",
      fetch: fetchFn,
    }),
  };
}

let t: TestDatabase;
const keyring = loadKeyring({
  NEXORA_VAULT_MASTER_KEY: randomBytes(32).toString("base64"),
});
const getSecret = (ref: string) => readSecret(t.db, keyring, ref);

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

async function publishOne(opts: {
  code: string;
  publicId: string;
  secret: string;
}) {
  await putSecret(t.db, keyring, {
    ref: `llm.${opts.code}`,
    value: opts.secret,
    kind: "llm_provider",
  });
  const provider = await createProvider(t.db, {
    code: opts.code,
    name: opts.code,
    type: "litellm_upstream",
    baseUrl: "http://127.0.0.1:4400",
    litellmBaseUrl: "http://127.0.0.1:4000",
    secretRef: `llm.${opts.code}`,
    region: "autre",
  });
  const model = await createModel(t.db, {
    publicId: opts.publicId,
    name: opts.publicId,
    providerId: provider.id,
    upstreamId: "dev/cloud-glm-5-3",
    contextMax: 100_000,
  });
  const fx = await addFxRate(t.db, {
    usdToCadMicro: 1_400_000n,
    effectiveAt: new Date(Date.now() - 1000),
  });
  await approveFxRate(t.db, fx.id, "test");
  await addPrice(t.db, model.id, {
    upstreamInputUsdMicro: 100_000n,
    upstreamOutputUsdMicro: 200_000n,
    sellInputCadMicro: 500_000n,
    sellOutputCadMicro: 1_000_000n,
    note: "DÉVELOPPEMENT",
  });
  await updateModel(t.db, model.id, { status: "approved" });
  await updateModel(t.db, model.id, { status: "published" });
  const { version } = await createDraftVersion(t.db);
  await approveVersion(t.db, version.id);
  return publishVersion(t.db, version.id);
}

describe("synchronisation LiteLLM", () => {
  it("refuse de synchroniser sans catalogue publié", async () => {
    const { client } = fakeLitellm();
    await expect(
      syncLitellm(t.db, { client, getSecret }),
    ).rejects.toBeInstanceOf(SyncError);
  });

  it("pousse crédentials puis modèles publiés, avec la clé tirée du coffre, et écrit l'état appliqué", async () => {
    const v = await publishOne({
      code: "dev-up",
      publicId: "nexora/glm-5-3",
      secret: "vk-super-secret-value-1",
    });
    const { state, client } = fakeLitellm();
    const at = new Date("2026-10-27T12:00:00Z");
    const { summary } = await syncLitellm(t.db, {
      client,
      getSecret,
      now: () => at,
    });
    expect(summary.models.created).toEqual(["nexora/glm-5-3"]);
    expect(state.credentials.get("nexora-prov-dev-up")).toEqual({
      api_key: "vk-super-secret-value-1",
      api_base: "http://127.0.0.1:4000/v1",
    });
    const pushed = state.models.get("nxm-nexora-glm-5-3") as {
      model_name: string;
      litellm_params: { model: string; litellm_credential_name: string };
    };
    expect(pushed.model_name).toBe("nexora/glm-5-3");
    expect(pushed.litellm_params.model).toBe("openai/dev/cloud-glm-5-3");
    expect(pushed.litellm_params.litellm_credential_name).toBe(
      "nexora-prov-dev-up",
    );
    // la clé n'est jamais dans le modèle, ni dans le résumé écrit en base
    expect(JSON.stringify(pushed)).not.toContain("vk-super-secret");
    // les crédentials sont créés avant les modèles
    expect(state.calls.indexOf("POST /credentials")).toBeLessThan(
      state.calls.indexOf("POST /model/new"),
    );
    // le modèle déclaré dans le fichier de configuration n'est pas touché
    expect(state.models.has("config-file-model")).toBe(true);

    const [row] = await t.db
      .select()
      .from(configVersions)
      .where(eq(configVersions.id, v.id));
    expect(row?.appliedStatus).toBe("applied");
    expect(row?.appliedAt?.toISOString()).toBe(at.toISOString());
    expect(JSON.stringify(row?.appliedDetail)).not.toContain("vk-super-secret");
  });

  it("est rejouable : met à jour, et retire ce qui n'est plus publié", async () => {
    const { state, client } = fakeLitellm();
    await syncLitellm(t.db, { client, getSecret });
    const second = await syncLitellm(t.db, { client, getSecret });
    expect(second.summary.models.created).toEqual([]);
    expect(second.summary.models.updated).toEqual(["nexora/glm-5-3"]);
    // un modèle géré par Nexora et dépublié disparaît de LiteLLM au prochain passage
    state.models.set("nxm-orphelin", { model_name: "nexora/orphelin" });
    state.credentials.set("nexora-prov-orphelin", {});
    const third = await syncLitellm(t.db, { client, getSecret });
    expect(third.summary.models.deleted).toEqual(["nxm-orphelin"]);
    expect(third.summary.credentials.deleted).toEqual(["nexora-prov-orphelin"]);
    expect(state.models.has("config-file-model")).toBe(true);
  });

  it("n'écrit que le publié : un modèle approuvé mais non publié n'est pas poussé", async () => {
    await t.db.update(models).set({ status: "retired" });
    const { state, client } = fakeLitellm();
    // le catalogue publié contient encore nexora/glm-5-3 (le retrait n'est pas publié)
    const { summary } = await syncLitellm(t.db, { client, getSecret });
    expect(summary.models.created).toEqual(["nexora/glm-5-3"]);
    expect(state.models.has("nxm-nexora-glm-5-3")).toBe(true);
  });

  it("inscrit l'échec (sans détail sensible) quand LiteLLM refuse", async () => {
    const { state, client } = fakeLitellm();
    state.failOn = "/model/new";
    await expect(
      syncLitellm(t.db, { client, getSecret }),
    ).rejects.toMatchObject({
      code: "litellm_unavailable",
    });
    const rows = await t.db
      .select()
      .from(configVersions)
      .where(eq(configVersions.status, "published"));
    expect(rows[0]?.appliedStatus).toBe("failed");
    expect(JSON.stringify(rows[0]?.appliedDetail)).not.toContain(
      "vk-super-secret",
    );
  });
});

describe("adresse de base transmise à LiteLLM", () => {
  it("garde telle quelle une adresse déjà versionnée (/v1, /api/v1, /v4) et ajoute /v1 sinon", () => {
    expect(
      apiBaseFor("openai_compatible", "https://api.z.ai/api/paas/v4"),
    ).toBe("https://api.z.ai/api/paas/v4");
    expect(apiBaseFor("openai_compatible", "https://api.minimax.io/v1/")).toBe(
      "https://api.minimax.io/v1",
    );
    expect(apiBaseFor("openai_compatible", "https://llm.exemple.ca")).toBe(
      "https://llm.exemple.ca/v1",
    );
    expect(
      apiBaseFor("openrouter", "https://openrouter.ai/api/v1"),
    ).toBeUndefined();
  });
});

describe("synchronisation LiteLLM : routes de secours et consignes de routage", () => {
  async function publishWithRoute() {
    await t.db.update(models).set({ status: "retired" });
    await putSecret(t.db, keyring, {
      ref: "llm.zai-r",
      value: "sk-zai-r-xxxxxxxxxxxx",
      kind: "llm_provider",
    });
    await putSecret(t.db, keyring, {
      ref: "llm.or-r",
      value: "sk-or-r-xxxxxxxxxxxxx",
      kind: "llm_provider",
    });
    const zai = await createProvider(t.db, {
      code: "zai-r",
      name: "Z.ai",
      type: "openai_compatible",
      baseUrl: "https://api.z.ai/api/paas/v4",
      secretRef: "llm.zai-r",
      region: "autre",
    });
    const or = await createProvider(t.db, {
      code: "or-r",
      name: "OpenRouter",
      type: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      secretRef: "llm.or-r",
      region: "autre",
    });
    const model = await createModel(t.db, {
      publicId: "nexora/route-test",
      name: "Route test",
      providerId: zai.id,
      upstreamId: "glm-5.3",
      contextMax: 100_000,
      routing: {
        dataCollection: "deny",
        allowFallbacks: true,
        ignore: ["alibaba"],
        maxPriceUsdMicro: { input: "1400000", output: "4400000" },
      },
    });
    const fx = await addFxRate(t.db, {
      usdToCadMicro: 1_400_000n,
      effectiveAt: new Date(Date.now() - 1000),
    });
    await approveFxRate(t.db, fx.id, "test");
    await addPrice(t.db, model.id, {
      upstreamInputUsdMicro: 1_400_000n,
      upstreamOutputUsdMicro: 4_400_000n,
      marginBps: 1000,
      marginFloorBps: 1000,
    });
    const route = await addRoute(t.db, model.id, {
      providerId: or.id,
      upstreamId: "z-ai/glm-5.3",
    });
    await updateModel(t.db, model.id, { status: "approved" });
    await updateModel(t.db, model.id, { status: "published" });
    const publish = async () => {
      const { version } = await createDraftVersion(t.db);
      await approveVersion(t.db, version.id);
      return publishVersion(t.db, version.id);
    };
    await publish();
    return { model, route, publish };
  }

  it("crée un déploiement par route dans l'ordre, transmet les consignes à OpenRouter, et retire une route désactivée", async () => {
    const { route, publish } = await publishWithRoute();
    const { state, client } = fakeLitellm();
    await syncLitellm(t.db, { client, getSecret });
    const primary = state.models.get("nxm-nexora-route-test") as Record<
      string,
      any
    >;
    const fallback = state.models.get("nxm-nexora-route-test~r1") as Record<
      string,
      any
    >;
    expect(primary.model_name).toBe("nexora/route-test");
    expect(fallback.model_name).toBe("nexora/route-test");
    expect(primary.litellm_params.order).toBe(1);
    expect(fallback.litellm_params.order).toBe(2);
    expect(primary.litellm_params.model).toBe("openai/glm-5.3");
    expect(primary.litellm_params.extra_body).toBeUndefined();
    expect(fallback.litellm_params.model).toBe("openrouter/z-ai/glm-5.3");
    expect(fallback.litellm_params.extra_body).toEqual({
      provider: {
        data_collection: "deny",
        allow_fallbacks: true,
        ignore: ["alibaba"],
        max_price: { prompt: 1.4, completion: 4.4 },
      },
    });
    // la clé de chaque fournisseur est dans son crédential, jamais dans un modèle
    expect(state.credentials.get("nexora-prov-or-r")).toMatchObject({
      api_key: "sk-or-r-xxxxxxxxxxxxx",
    });
    expect(JSON.stringify([primary, fallback])).not.toContain("sk-");

    await updateRoute(t.db, route.id, { enabled: false });
    await publish();
    await syncLitellm(t.db, { client, getSecret });
    expect(state.models.has("nxm-nexora-route-test")).toBe(true);
    expect(state.models.has("nxm-nexora-route-test~r1")).toBe(false);
    // le crédential du fournisseur de secours n'est plus utilisé : retiré
    expect(state.credentials.has("nexora-prov-or-r")).toBe(false);
  });
});

describe("identifiant d'un déploiement de route", () => {
  it("se relit sans ambiguïté, même si l'identifiant public finit comme une route", () => {
    expect(routeDeploymentId("nexora/glm", 0)).toBe("nxm-nexora-glm");
    expect(routeDeploymentId("nexora/glm", 2)).toBe("nxm-nexora-glm~r2");
    expect(routePositionOf("nxm-nexora-glm~r2")).toBe(2);
    expect(routePositionOf("nxm-nexora-glm")).toBe(0);
    // un modèle dont l'identifiant public finit par « -r1 » n'est pas pris pour une route
    expect(routePositionOf(routeDeploymentId("nexora/glm-r1", 0))).toBe(0);
    expect(routePositionOf(null)).toBe(0);
    expect(routePositionOf("n-importe-quoi~r0")).toBe(0);
  });
});

describe("OpenRouter : refus de la collecte de données chez l'amont (Privacy Router, standard)", () => {
  it("sans consigne de fiche, la collecte est refusée", () => {
    expect(openrouterPreferences(undefined)).toEqual({
      data_collection: "deny",
    });
    expect(openrouterPreferences({})).toEqual({ data_collection: "deny" });
  });
  it("conserve les autres consignes de la fiche et refuse la collecte même si la fiche l'autorisait", () => {
    expect(
      openrouterPreferences({
        dataCollection: "allow",
        zdr: true,
        only: ["z-ai"],
      }),
    ).toEqual({ data_collection: "deny", zdr: true, only: ["z-ai"] });
  });
});

describe("synchronisation LiteLLM : modèles en aperçu", () => {
  let p: TestDatabase;
  beforeAll(async () => {
    p = await createTestDatabase();
  });
  afterAll(async () => {
    await p.drop();
  });

  it("saute un modèle en aperçu sans lire le moindre secret, et pousse seulement le modèle appelable", async () => {
    // Fournisseur sans clé dans le Coffre (la clé n'est pas encore saisie) : modèle en aperçu.
    const noKey = await createProvider(p.db, {
      code: "deepinfra",
      name: "DeepInfra",
      type: "openai_compatible",
      baseUrl: "https://api.deepinfra.com/v1/openai",
      secretRef: "llm.deepinfra",
      region: "autre",
    });
    const preview = await createModel(p.db, {
      publicId: "nexora/apercu",
      name: "Aperçu",
      providerId: noKey.id,
      upstreamId: "org/Apercu",
      contextMax: 100_000,
      availability: "preview",
    });
    // Fournisseur avec clé : modèle appelable.
    await putSecret(p.db, keyring, {
      ref: "llm.autre",
      value: "vk-autre-secret-value-9",
      kind: "llm_provider",
    });
    const other = await createProvider(p.db, {
      code: "autre",
      name: "Autre",
      type: "litellm_upstream",
      baseUrl: "http://127.0.0.1:4400",
      secretRef: "llm.autre",
      region: "autre",
    });
    const live = await createModel(p.db, {
      publicId: "nexora/service",
      name: "Service",
      providerId: other.id,
      upstreamId: "up/service",
      contextMax: 100_000,
    });
    const fx = await addFxRate(p.db, {
      usdToCadMicro: 1_400_000n,
      effectiveAt: new Date(Date.now() - 1000),
    });
    await approveFxRate(p.db, fx.id, "test");
    for (const m of [preview, live]) {
      await addPrice(p.db, m.id, {
        upstreamInputUsdMicro: 100_000n,
        upstreamOutputUsdMicro: 200_000n,
        sellInputCadMicro: 500_000n,
        sellOutputCadMicro: 1_000_000n,
      });
      await updateModel(p.db, m.id, { status: "approved" });
      await updateModel(p.db, m.id, { status: "published" });
    }
    const draft = await createDraftVersion(p.db);
    expect(draft.issues).toEqual([]);
    await approveVersion(p.db, draft.version.id);
    await publishVersion(p.db, draft.version.id);

    const asked: string[] = [];
    const { state, client } = fakeLitellm();
    const { summary } = await syncLitellm(p.db, {
      client,
      getSecret: async (ref) => {
        asked.push(ref);
        return readSecret(p.db, keyring, ref);
      },
    });
    expect(asked).toEqual(["llm.autre"]);
    expect(summary.models.created).toEqual(["nexora/service"]);
    expect(summary.credentials.upserted).toEqual(["nexora-prov-autre"]);
    expect(state.models.has("nxm-nexora-apercu")).toBe(false);
    expect(state.credentials.has("nexora-prov-deepinfra")).toBe(false);
  });

  it("retire de LiteLLM le déploiement géré d'un modèle en aperçu (jamais appelable)", async () => {
    const { state, client } = fakeLitellm();
    state.models.set("nxm-nexora-apercu", { model_name: "nexora/apercu" });
    const { summary } = await syncLitellm(p.db, {
      client,
      getSecret: (ref) => readSecret(p.db, keyring, ref),
    });
    expect(summary.models.deleted).toEqual(["nxm-nexora-apercu"]);
  });
});

describe("chaîne de modèle LiteLLM selon le type", () => {
  it("garde openai/ pour la conversation et les embeddings, passe un reclasseur DeepInfra par deepinfra/", () => {
    expect(
      litellmModelString(
        "openai_compatible",
        "Qwen/Qwen3-Embedding-8B",
        "embedding",
        "https://api.deepinfra.com/v1/openai",
      ),
    ).toBe("openai/Qwen/Qwen3-Embedding-8B");
    expect(
      litellmModelString(
        "openai_compatible",
        "zai-org/GLM-5.3",
        "chat",
        "https://api.deepinfra.com/v1/openai",
      ),
    ).toBe("openai/zai-org/GLM-5.3");
    expect(
      litellmModelString(
        "openai_compatible",
        "Qwen/Qwen3-Reranker-4B",
        "rerank",
        "https://api.deepinfra.com/v1/openai",
      ),
    ).toBe("deepinfra/Qwen/Qwen3-Reranker-4B");
  });
  it("utilise le protocole Cohere pour un reclasseur d'un autre hébergeur compatible", () => {
    expect(
      litellmModelString(
        "openai_compatible",
        "bge-reranker",
        "rerank",
        "https://api.exemple.ca/v1",
      ),
    ).toBe("cohere/bge-reranker");
  });
  it("ne change rien pour OpenRouter et Ollama", () => {
    expect(
      litellmModelString(
        "openrouter",
        "a/b",
        "chat",
        "https://openrouter.ai/api/v1",
      ),
    ).toBe("openrouter/a/b");
    expect(
      litellmModelString("ollama", "qwen", "chat", "http://localhost:11434"),
    ).toBe("ollama_chat/qwen");
  });
});
