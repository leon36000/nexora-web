import { describe, expect, test } from "bun:test";
import {
  healthView,
  modelStatusView,
  priceSummary,
  regionLabel,
  vaultUrl,
  versionStatusLabel,
} from "./view";

describe("libellés d'état", () => {
  test("état d'un modèle", () => {
    expect(modelStatusView("draft")).toMatchObject({ label: "Brouillon" });
    expect(modelStatusView("approved").label).toBe("Approuvé");
    expect(modelStatusView("published")).toMatchObject({
      label: "Publié",
      tone: "success",
    });
    expect(modelStatusView("retired").label).toBe("Retiré");
    expect(modelStatusView("?").label).toBe("?");
  });
  test("santé d'un fournisseur, version, région", () => {
    expect(healthView("ok").label).toBe("Connexion vérifiée");
    expect(healthView("error").tone).toBe("danger");
    expect(healthView("unknown").label).toBe("Jamais testé");
    expect(versionStatusLabel("superseded")).toBe("remplacée");
    expect(regionLabel("etats_unis")).toBe("États-Unis");
  });
});

describe("résumé du prix en vigueur", () => {
  test("ventes en dollars canadiens par million de jetons, avec plages et cache", () => {
    const lines = priceSummary({
      sellInputCadMicro: "462000",
      sellOutputCadMicro: "1848000",
      sellCacheCadMicro: "46200",
      sellCacheWriteCadMicro: null,
      upstreamInputUsdMicro: "300000",
      upstreamOutputUsdMicro: "1200000",
      windows: [{}, {}],
      marginFloorBps: 1000,
    });
    expect(lines).toEqual([
      "Entrée 0,462 $ CA · sortie 1,848 $ CA · cache 0,0462 $ CA (par million de jetons)",
      "Coût amont : 0,3 $ US en entrée, 1,2 $ US en sortie · plancher de marge 10 %",
      "2 plages horaires",
    ]);
    expect(priceSummary(null)).toEqual(["Aucun prix saisi"]);
  });
});

describe("lien vers le Coffre", () => {
  test("même dossier d'administration que le module courant", () => {
    expect(vaultUrl("/admin/nexora-models")).toBe("/admin/nexora-vault");
    expect(vaultUrl("/admin/nexora-models/")).toBe("/admin/nexora-vault");
    expect(vaultUrl("/studio/admin/nexora-models")).toBe(
      "/studio/admin/nexora-vault",
    );
    expect(vaultUrl("/")).toBe("/admin/nexora-vault");
  });
});
