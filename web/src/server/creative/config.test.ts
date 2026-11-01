import { describe, expect, it } from "vitest";
import {
  CREATIVE_RECIPES,
  defaultCreativeConfig,
  LLM_ROLES,
  validateCreativeConfig,
} from "./config";

const ctx = {
  llmModels: new Set(["glm-5.3", "nexora-local-8b"]),
  secretCheck: (ref: string, url: string) =>
    ref === "comfy-cloud-key"
      ? new URL(url).hostname === "cloud.comfy.org" ||
        new URL(url).hostname === "x.example"
        ? null
        : ("forbidden_host" as const)
      : ref === "stripe-key"
        ? ("forbidden_secret" as const)
        : ("unknown_secret" as const),
};

const base = () => ({
  version: 1 as const,
  llm: { default: "glm-5.3", roles: { redaction: "nexora-local-8b" } },
  engines: [
    {
      id: "rtx5090",
      label: "RTX 5090",
      kind: "local" as const,
      baseUrl: "http://10.0.0.5:8189",
      comfyUrl: "http://10.0.0.5:8188",
      recipes: ["h3-fast", "h3-max"],
    },
  ],
});

describe("configuration de Nexora Creative", () => {
  it("la configuration par défaut est valide et ne force rien (l'application garde son environnement)", () => {
    const d = defaultCreativeConfig();
    expect(d.llm).toEqual({ default: null, roles: {} });
    expect(d.engines).toEqual([]);
    expect(validateCreativeConfig(d, ctx).ok).toBe(true);
  });

  it("connaît les rôles LLM et les recettes de l'application", () => {
    expect(LLM_ROLES).toEqual([
      "redaction",
      "realisation",
      "boost",
      "musique",
      "moderation",
      "publication",
      "idees",
      "juge",
    ]);
    expect(CREATIVE_RECIPES).toEqual([
      "h3-fast",
      "h3-max",
      "music3",
      "qwen21",
      "qwen",
      "flux2",
    ]);
  });

  it("accepte des modèles du catalogue et des moteurs locaux ou cloud", () => {
    const cfg = base();
    cfg.engines.push({
      id: "comfy-cloud",
      label: "Comfy Cloud",
      kind: "cloud" as never,
      baseUrl: "https://cloud.comfy.org",
      comfyUrl: "https://cloud.comfy.org",
      recipes: ["qwen"],
      apiKeyRef: "comfy-cloud-key",
    } as never);
    const r = validateCreativeConfig(cfg, ctx);
    expect(r.ok).toBe(true);
  });

  it("refuse un modèle LLM absent du catalogue, en nommant le champ", () => {
    const cfg = base();
    cfg.llm.roles = { moderation: "modele-inconnu" } as never;
    const r = validateCreativeConfig(cfg, ctx);
    expect(r).toEqual({
      ok: false,
      issues: [{ path: "llm.roles.moderation", code: "unknown_model" }],
    });
  });

  it("refuse un rôle inconnu et une recette inconnue (erreurs de forme)", () => {
    const cfg = base() as unknown as {
      llm: { roles: Record<string, string> };
      engines: { recipes: string[] }[];
    };
    cfg.llm.roles.magie = "glm-5.3";
    cfg.engines[0].recipes = ["h3-fast", "sora"];
    const r = validateCreativeConfig(cfg, ctx);
    expect(r.ok).toBe(false);
    const codes = (
      r as { issues: { path: string; code: string }[] }
    ).issues.map((i) => `${i.path}:${i.code}`);
    expect(codes).toEqual(
      expect.arrayContaining([
        "llm.roles:unrecognized_keys",
        "engines.0.recipes.1:invalid_value",
      ]),
    );
  });

  it("refuse deux moteurs de même identifiant", () => {
    const cfg = base();
    cfg.engines.push({ ...cfg.engines[0] });
    expect(validateCreativeConfig(cfg, ctx)).toEqual({
      ok: false,
      issues: [{ path: "engines.1.id", code: "duplicate_engine" }],
    });
  });

  it("un moteur cloud exige https et une clé du coffre qui existe ; un moteur local n'a pas de clé", () => {
    const cloud = (over: Record<string, unknown>) => ({
      ...base(),
      engines: [
        {
          id: "cloud-1",
          label: "Cloud",
          kind: "cloud",
          baseUrl: "https://x.example",
          comfyUrl: "https://x.example",
          recipes: ["qwen"],
          apiKeyRef: "comfy-cloud-key",
          ...over,
        },
      ],
    });
    expect(
      validateCreativeConfig(cloud({ baseUrl: "http://x.example" }), ctx),
    ).toMatchObject({ ok: false });
    expect(
      validateCreativeConfig(cloud({ apiKeyRef: undefined }), ctx),
    ).toMatchObject({ ok: false });
    expect(
      validateCreativeConfig(cloud({ apiKeyRef: "absente" }), ctx),
    ).toEqual({
      ok: false,
      issues: [{ path: "engines.0.apiKeyRef", code: "unknown_secret" }],
    });
    expect(
      validateCreativeConfig(cloud({ apiKeyRef: "stripe-key" }), ctx),
    ).toEqual({
      ok: false,
      issues: [{ path: "engines.0.apiKeyRef", code: "forbidden_secret" }],
    });
    expect(
      validateCreativeConfig(
        cloud({
          baseUrl: "https://gpu.evil.example",
          comfyUrl: "https://gpu.evil.example",
        }),
        ctx,
      ),
    ).toEqual({
      ok: false,
      issues: [{ path: "engines.0.apiKeyRef", code: "forbidden_host" }],
    });
    const local = base();
    (local.engines[0] as Record<string, unknown>).apiKeyRef = "comfy-cloud-key";
    expect(validateCreativeConfig(local, ctx)).toMatchObject({ ok: false });
  });

  it("refuse les adresses qui ne sont pas http(s) ou qui portent des identifiants", () => {
    for (const baseUrl of [
      "file:///etc/passwd",
      "ftp://x",
      "http://user:pass@10.0.0.5:8189",
      "pas une url",
    ]) {
      const cfg = base();
      cfg.engines[0].baseUrl = baseUrl;
      expect(validateCreativeConfig(cfg, ctx).ok, baseUrl).toBe(false);
    }
  });
});
