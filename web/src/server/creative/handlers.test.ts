import { describe, expect, it } from "vitest";
import { type CreativeConfig, defaultCreativeConfig } from "./config";
import {
  type CreativeAdminDeps,
  handleCreativeAdmin,
  handleCreativeService,
} from "./handlers";

const ADMIN = "jeton-admin-assez-long-pour-les-tests";
const SERVICE = "jeton-service-creative-assez-long";

function deps(initial: CreativeConfig = defaultCreativeConfig()) {
  let stored: {
    config: CreativeConfig;
    updatedAt: Date | null;
    updatedBy: string | null;
  } = { config: initial, updatedAt: null, updatedBy: null };
  const writes: CreativeConfig[] = [];
  const d: CreativeAdminDeps = {
    adminToken: ADMIN,
    serviceToken: SERVICE,
    store: {
      read: async () => stored,
      write: async (config, by) => {
        stored = {
          config,
          updatedAt: new Date("2026-10-31T12:00:00Z"),
          updatedBy: by,
        };
        writes.push(config);
        return stored.updatedAt as Date;
      },
    },
    catalog: async () => [
      { publicId: "glm-5.3", label: "GLM 5.3", hosting: "cloud" },
      {
        publicId: "nexora-local-8b",
        label: "Nexora local 8B",
        hosting: "local",
      },
    ],
    secrets: async () => [
      { ref: "comfy-cloud-key", kind: "other" },
      { ref: "stripe.secret_key", kind: "payment" },
    ],
    resolveSecret: async (ref) => {
      if (ref !== "comfy-cloud-key") throw new Error("not_found");
      return "VALEUR-SECRETE";
    },
    secretHosts: (_scope, target) =>
      new URL(target).hostname === "cloud.comfy.org"
        ? null
        : "hôte non autorisé",
    log: {
      error: () => {},
      warn: () => {},
      info: () => {},
      debug: () => {},
    } as never,
  };
  return { d, writes };
}

const req = (
  method: string,
  token: string | null,
  body?: unknown,
  url = "https://x.example/api/admin/creative/config",
) =>
  new Request(url, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "content-type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const valid = (): CreativeConfig => ({
  version: 1,
  llm: { default: "glm-5.3", roles: { moderation: "nexora-local-8b" } },
  engines: [
    {
      id: "rtx5090",
      label: "RTX 5090",
      kind: "local",
      baseUrl: "http://10.0.0.5:8189",
      comfyUrl: "http://10.0.0.5:8188",
      recipes: ["h3-fast", "h3-max"],
    },
    {
      id: "comfy-cloud",
      label: "Comfy Cloud",
      kind: "cloud",
      baseUrl: "https://cloud.comfy.org",
      comfyUrl: "https://cloud.comfy.org",
      recipes: ["qwen"],
      apiKeyRef: "comfy-cloud-key",
    },
  ],
});

describe("API d'administration de Nexora Creative", () => {
  it("exige le jeton d'administration (401) et refuse le jeton du service", async () => {
    const { d } = deps();
    expect(
      (await handleCreativeAdmin(req("GET", null), ["config"], d)).status,
    ).toBe(401);
    expect(
      (await handleCreativeAdmin(req("GET", "mauvais"), ["config"], d)).status,
    ).toBe(401);
    expect(
      (await handleCreativeAdmin(req("GET", SERVICE), ["config"], d)).status,
    ).toBe(401);
  });

  it("GET config : la configuration, ses options (modèles du catalogue, recettes, clés du coffre éligibles) et jamais une valeur de secret", async () => {
    const { d } = deps(valid());
    const r = await handleCreativeAdmin(req("GET", ADMIN), ["config"], d);
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).not.toContain("VALEUR-SECRETE");
    const body = JSON.parse(text);
    expect(body.config.engines).toHaveLength(2);
    expect(body.options.llmModels).toEqual([
      { publicId: "glm-5.3", label: "GLM 5.3", hosting: "cloud" },
      {
        publicId: "nexora-local-8b",
        label: "Nexora local 8B",
        hosting: "local",
      },
    ]);
    expect(body.options.recipes).toContain("h3-fast");
    expect(body.options.secretRefs).toEqual(["comfy-cloud-key"]);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("PUT config valide : enregistre et renvoie la configuration avec sa date", async () => {
    const { d, writes } = deps();
    const r = await handleCreativeAdmin(
      req("PUT", ADMIN, valid()),
      ["config"],
      d,
    );
    expect(r.status).toBe(200);
    expect(writes).toHaveLength(1);
    expect((await r.json()).updatedAt).toBe("2026-10-31T12:00:00.000Z");
  });

  it("PUT config invalide : 422 avec les champs en cause, rien n'est écrit", async () => {
    const { d, writes } = deps();
    const cfg = valid();
    cfg.llm.default = "modele-inconnu";
    cfg.engines[1].apiKeyRef = "stripe.secret_key";
    const r = await handleCreativeAdmin(req("PUT", ADMIN, cfg), ["config"], d);
    expect(r.status).toBe(422);
    const body = await r.json();
    expect(body.issues).toEqual(
      expect.arrayContaining([
        { path: "llm.default", code: "unknown_model" },
        { path: "engines.1.apiKeyRef", code: "forbidden_secret" },
      ]),
    );
    expect(writes).toHaveLength(0);
  });

  it("refuse une clé qui partirait vers un hôte non autorisé par l'opérateur", async () => {
    const { d, writes } = deps();
    const cfg = valid();
    cfg.engines[1].baseUrl = "https://gpu.evil.example";
    cfg.engines[1].comfyUrl = "https://gpu.evil.example";
    const r = await handleCreativeAdmin(req("PUT", ADMIN, cfg), ["config"], d);
    expect(r.status).toBe(422);
    expect((await r.json()).issues).toEqual([
      { path: "engines.1.apiKeyRef", code: "forbidden_host" },
    ]);
    expect(writes).toHaveLength(0);
  });

  it("méthode ou route inconnue : 405 ou 404", async () => {
    const { d } = deps();
    expect(
      (await handleCreativeAdmin(req("DELETE", ADMIN), ["config"], d)).status,
    ).toBe(405);
    expect(
      (await handleCreativeAdmin(req("GET", ADMIN), ["autre"], d)).status,
    ).toBe(404);
  });
});

describe("configuration lue par le service Nexora Creative", () => {
  const url = "https://x.example/api/creative/config";
  it("exige le jeton du service (pas celui de l'administration)", async () => {
    const { d } = deps(valid());
    expect(
      (await handleCreativeService(req("GET", null, undefined, url), d)).status,
    ).toBe(401);
    expect(
      (await handleCreativeService(req("GET", ADMIN, undefined, url), d))
        .status,
    ).toBe(401);
  });

  it("non configuré : { configured: false } (l'application garde son environnement)", async () => {
    const { d } = deps();
    const r = await handleCreativeService(
      req("GET", SERVICE, undefined, url),
      d,
    );
    expect(await r.json()).toEqual({ configured: false });
  });

  it("configuré : renvoie la configuration avec la clé des moteurs cloud résolue, et seulement pour eux", async () => {
    const { d } = deps(valid());
    await d.store.write(valid(), "admin");
    const r = await handleCreativeService(
      req("GET", SERVICE, undefined, url),
      d,
    );
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.configured).toBe(true);
    expect(body.engines[0].apiKey).toBeUndefined();
    expect(body.engines[1].apiKey).toBe("VALEUR-SECRETE");
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("un moteur dont la clé n'est plus lisible est signalé sans clé (le reste de la configuration reste servi)", async () => {
    const { d } = deps(valid());
    await d.store.write(
      {
        ...valid(),
        engines: [{ ...valid().engines[1], apiKeyRef: "revoquee" }],
      },
      "admin",
    );
    const body = await (
      await handleCreativeService(req("GET", SERVICE, undefined, url), d)
    ).json();
    expect(body.engines[0].apiKey).toBeUndefined();
    expect(body.engines[0].keyError).toBe("secret_unavailable");
  });
});
