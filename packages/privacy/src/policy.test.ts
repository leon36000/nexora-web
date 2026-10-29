import { describe, expect, it } from "vitest";
import {
  DEFAULT_POLICY,
  hostMatches,
  modelMatches,
  parsePolicyConfig,
  resolvePolicy,
} from "./policy";

describe("politique par défaut", () => {
  it("est « standard » : tous les genres masqués, rien de bloqué, pièces jointes permises", () => {
    expect(DEFAULT_POLICY.level).toBe("standard");
    expect([...DEFAULT_POLICY.maskCategories].sort()).toEqual(
      ["credit_card", "email", "iban", "phone", "secret", "sin"].sort(),
    );
    expect(DEFAULT_POLICY.denyCategories).toEqual([]);
    expect(DEFAULT_POLICY.blockAttachments).toBe(false);
    expect(DEFAULT_POLICY.allowedHosts).toEqual([]);
  });
});

describe("resolvePolicy", () => {
  it("renforcé et souverain bloquent les pièces jointes par défaut, sauf choix contraire", () => {
    expect(resolvePolicy("renforce", {}).blockAttachments).toBe(true);
    expect(resolvePolicy("souverain", {}).blockAttachments).toBe(true);
    expect(
      resolvePolicy("renforce", { blockAttachments: false }).blockAttachments,
    ).toBe(false);
    expect(resolvePolicy("standard", {}).blockAttachments).toBe(false);
  });
  it("les secrets restent toujours masqués, même si la case est décochée", () => {
    const policy = resolvePolicy("standard", { maskCategories: ["email"] });
    expect(policy.maskCategories).toContain("secret");
    expect(policy.maskCategories).toContain("email");
    expect(policy.maskCategories).not.toContain("phone");
  });
  it("un genre à refuser n'est pas aussi masqué", () => {
    const policy = resolvePolicy("standard", {
      denyCategories: ["credit_card"],
    });
    expect(policy.denyCategories).toEqual(["credit_card"]);
    expect(policy.maskCategories).not.toContain("credit_card");
  });
});

describe("parsePolicyConfig", () => {
  it("accepte une configuration vide et applique les défauts", () => {
    const r = parsePolicyConfig({});
    expect(r.success).toBe(true);
  });
  it("normalise les hôtes (minuscules, point final) et refuse les adresses complètes", () => {
    const ok = parsePolicyConfig({
      allowedHosts: ["Exemple.CA.", "*.Interne.Exemple.ca"],
    });
    expect(ok.success && ok.data.allowedHosts).toEqual([
      "exemple.ca",
      "*.interne.exemple.ca",
    ]);
    for (const bad of [
      "https://exemple.ca",
      "exemple.ca/chemin",
      "exemple.ca:8080",
      "*",
      "*exemple.ca",
      "exé.ca",
      "",
      "a b.ca",
    ])
      expect(parsePolicyConfig({ allowedHosts: [bad] }).success, bad).toBe(
        false,
      );
  });
  it("refuse un genre inconnu, un champ inconnu et des listes démesurées", () => {
    expect(parsePolicyConfig({ maskCategories: ["nom"] }).success).toBe(false);
    expect(parsePolicyConfig({ autre: 1 }).success).toBe(false);
    expect(
      parsePolicyConfig({
        allowedModels: Array.from({ length: 201 }, (_, i) => `m${i}`),
      }).success,
    ).toBe(false);
  });
  it("accepte les modèles exacts et les préfixes avec « * » final", () => {
    expect(
      parsePolicyConfig({ allowedModels: ["mistral-small", "agent/*"] })
        .success,
    ).toBe(true);
    expect(parsePolicyConfig({ allowedModels: ["a b"] }).success).toBe(false);
    expect(parsePolicyConfig({ allowedModels: ["*a"] }).success).toBe(false);
  });
});

describe("hostMatches", () => {
  it("compare l'hôte exact sans tenir compte de la casse", () => {
    expect(hostMatches(["exemple.ca"], "Exemple.CA")).toBe(true);
    expect(hostMatches(["exemple.ca"], "autre.ca")).toBe(false);
    expect(hostMatches([], "exemple.ca")).toBe(false);
  });
  it("« *.x » couvre les sous-domaines mais ni le domaine seul ni un domaine voisin", () => {
    expect(hostMatches(["*.exemple.ca"], "api.exemple.ca")).toBe(true);
    expect(hostMatches(["*.exemple.ca"], "a.b.exemple.ca")).toBe(true);
    expect(hostMatches(["*.exemple.ca"], "exemple.ca")).toBe(false);
    expect(hostMatches(["*.exemple.ca"], "mauvaisexemple.ca")).toBe(false);
    expect(hostMatches(["*.exemple.ca"], "exemple.ca.evil.com")).toBe(false);
  });
});

describe("modelMatches", () => {
  it("compare l'identifiant exact ou le préfixe", () => {
    expect(modelMatches(["mistral-small"], "mistral-small")).toBe(true);
    expect(modelMatches(["mistral-small"], "mistral-small-2")).toBe(false);
    expect(modelMatches(["agent/*"], "agent/support")).toBe(true);
    expect(modelMatches(["agent/*"], "agentx")).toBe(false);
    expect(modelMatches([], "x")).toBe(false);
  });
});
