import { describe, expect, test } from "bun:test";
import {
  applyPreset,
  emptyProviderForm,
  PROVIDER_PRESETS,
  providerBody,
  providerNextStep,
  providerToForm,
  suggestCode,
  suggestPolicies,
  suggestSecretRef,
  validateProviderForm,
} from "./provider-form";

describe("aides de saisie", () => {
  test("code stable déduit du nom", () => {
    expect(suggestCode("DeepInfra")).toBe("deepinfra");
    expect(suggestCode("Moonshot AI (Kimi)")).toBe("moonshot-ai-kimi");
    expect(suggestCode("  Éole  Cloud ")).toBe("eole-cloud");
    expect(suggestCode("")).toBe("");
  });
  test("référence du Coffre selon la convention llm.<code>", () => {
    expect(suggestSecretRef("deepinfra")).toBe("llm.deepinfra");
    expect(suggestSecretRef("")).toBe("");
  });
  test("politique de données honnête : requêtes envoyées directement au fournisseur", () => {
    const p = suggestPolicies("DeepInfra");
    expect(p.fr).toBe("Requêtes envoyées directement à DeepInfra.");
    expect(p.en).toBe("Requests sent directly to DeepInfra.");
  });
  test("préréglages : adresses de base des fournisseurs courants", () => {
    const byId = Object.fromEntries(PROVIDER_PRESETS.map((p) => [p.id, p]));
    for (const id of [
      "deepseek",
      "zai",
      "minimax",
      "moonshot",
      "deepinfra",
      "openrouter",
    ])
      expect(byId[id]).toBeDefined();
    expect(byId.deepinfra?.baseUrl).toBe("https://api.deepinfra.com/v1/openai");
    expect(byId.openrouter?.type).toBe("openrouter");
    const f = applyPreset(emptyProviderForm(), "deepinfra");
    expect(f).toMatchObject({
      code: "deepinfra",
      name: "DeepInfra",
      type: "openai_compatible",
      secretRef: "llm.deepinfra",
      region: "autre",
      enabled: false,
    });
    expect(f.dataPolicyFr).toContain("DeepInfra");
  });
});

describe("validation", () => {
  const ok = () => applyPreset(emptyProviderForm(), "deepinfra");
  test("un fournisseur complet est valide", () => {
    expect(validateProviderForm(ok(), [])).toEqual({});
  });
  test("signale en français chaque champ fautif", () => {
    const e = validateProviderForm(
      {
        ...ok(),
        name: "",
        code: "A",
        baseUrl: "ftp://x",
        secretRef: "x",
        priority: "abc",
      },
      [],
    );
    expect(Object.keys(e).sort()).toEqual([
      "baseUrl",
      "code",
      "name",
      "priority",
      "secretRef",
    ]);
    expect(e.baseUrl).toContain("http");
    expect(e.code).toContain("minuscules");
  });
  test("refuse un code déjà pris et une référence réservée à la plateforme", () => {
    expect(validateProviderForm(ok(), ["deepinfra"]).code).toContain("déjà");
    expect(
      validateProviderForm({ ...ok(), secretRef: "stripe.secret" }, [])
        .secretRef,
    ).toContain("réservée");
    // le code ne se contrôle plus en modification
    expect(
      validateProviderForm({ ...ok(), id: "u" }, ["deepinfra"]).code,
    ).toBeUndefined();
  });
  test("une priorité saisie comme nombre est acceptée (champ numérique de Directus)", () => {
    expect(
      validateProviderForm({ ...ok(), priority: 20 as unknown as string }, []),
    ).toEqual({});
    expect(
      providerBody({ ...ok(), priority: 20 as unknown as string }).priority,
    ).toBe(20);
  });
  test("les types avec clé exigent une référence du Coffre", () => {
    expect(
      validateProviderForm({ ...ok(), secretRef: "" }, []).secretRef,
    ).toContain("Coffre");
    expect(
      validateProviderForm({ ...ok(), type: "vllm", secretRef: "" }, []),
    ).toEqual({});
  });
});

describe("corps envoyé à l'app", () => {
  test("création : jamais de clé, adresse LiteLLM vide -> absente", () => {
    const body = providerBody({
      ...applyPreset(emptyProviderForm(), "zai"),
      priority: "10",
    });
    expect(body).toEqual({
      code: "zai",
      name: "Z.ai",
      type: "openai_compatible",
      baseUrl: "https://api.z.ai/api/paas/v4",
      region: "autre",
      secretRef: "llm.zai",
      dataPolicyFr: "Requêtes envoyées directement à Z.ai.",
      dataPolicyEn: "Requests sent directly to Z.ai.",
      priority: 10,
      enabled: false,
    });
    expect(JSON.stringify(body)).not.toMatch(/secret"|apiKey|value/);
  });
  test("modification : pas de code, adresse LiteLLM nulle quand vide", () => {
    const existing = {
      id: "u1",
      code: "zai",
      name: "Z.ai",
      type: "openai_compatible",
      baseUrl: "https://api.z.ai/api/paas/v4",
      litellmBaseUrl: null,
      secretRef: "llm.zai",
      region: "autre",
      dataPolicyFr: "a",
      dataPolicyEn: "b",
      priority: 10,
      enabled: true,
    };
    const f = providerToForm(existing);
    expect(f.litellmBaseUrl).toBe("");
    const body = providerBody(f);
    expect(body).not.toHaveProperty("code");
    expect(body.litellmBaseUrl).toBeNull();
    expect(body.enabled).toBe(true);
  });
});

describe("prochaine étape d'un fournisseur", () => {
  const p = (over = {}) => ({
    secretRef: "llm.x",
    secretPresent: true,
    healthState: "ok",
    enabled: true,
    type: "openai_compatible",
    ...over,
  });
  test("clé, test, activation, puis prêt", () => {
    expect(providerNextStep(p({ secretPresent: false })).id).toBe("secret");
    expect(providerNextStep(p({ secretPresent: false })).text).toContain(
      "llm.x",
    );
    expect(providerNextStep(p({ healthState: "unknown" })).id).toBe("test");
    expect(providerNextStep(p({ healthState: "error" })).id).toBe("test");
    expect(providerNextStep(p({ enabled: false })).id).toBe("enable");
    expect(providerNextStep(p()).id).toBe("ready");
  });
  test("sans clé requise (modèle hébergé en interne), pas d'étape de clé", () => {
    expect(
      providerNextStep(
        p({
          type: "vllm",
          secretRef: null,
          secretPresent: null,
          healthState: "unknown",
        }),
      ).id,
    ).toBe("test");
  });
});
