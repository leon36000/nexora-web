import { describe, expect, test } from "bun:test";
import { buildChecklist } from "./readiness";

const fx = {
  id: "f",
  usdToCadMicro: "1400000",
  effectiveAt: "2026-10-28T00:00:00.000Z",
};

describe("contrôles préalables à la publication", () => {
  test("tout est vert quand il ne manque rien", () => {
    const items = buildChecklist(
      { ready: true, issues: [], fx },
      { secretRef: "llm.deepinfra", hasRoutes: false },
    );
    expect(items.map((i) => [i.id, i.ok])).toEqual([
      ["fx", true],
      ["price", true],
      ["margin", true],
      ["provider", true],
      ["secret", true],
    ]);
    expect(items[0]?.detail).toContain("1,4 $ CA");
    expect(items.find((i) => i.id === "secret")?.detail).toContain(
      "llm.deepinfra",
    );
  });
  test("chaque manque est listé avec sa consigne", () => {
    const items = buildChecklist(
      {
        ready: false,
        fx: null,
        issues: [
          { code: "fx_missing" },
          { code: "price_missing", model: "nexora/x" },
          { code: "secret_missing", model: "nexora/x", provider: "deepinfra" },
        ],
      },
      { secretRef: "llm.deepinfra", hasRoutes: false },
    );
    const bad = items.filter((i) => !i.ok).map((i) => i.id);
    expect(bad).toEqual(["fx", "price", "secret"]);
    expect(items.find((i) => i.id === "secret")?.help).toContain("Coffre");
    // la consigne nomme la référence à saisir dans le Coffre
    expect(items.find((i) => i.id === "secret")?.help).toContain(
      "« llm.deepinfra »",
    );
    // sans prix, la marge ne peut pas être jugée : elle n'est pas fautive
    expect(items.find((i) => i.id === "margin")?.ok).toBe(true);
  });
  test("prix sous le plancher : la marge est fautive, avec le poste et la plage", () => {
    const items = buildChecklist(
      {
        ready: false,
        fx,
        issues: [
          { code: "below_margin_floor", model: "nexora/x", field: "output" },
          {
            code: "below_margin_floor",
            model: "nexora/x",
            field: "input",
            window: "creux",
          },
        ],
      },
      { secretRef: null, hasRoutes: false },
    );
    const margin = items.find((i) => i.id === "margin");
    expect(margin?.ok).toBe(false);
    expect(margin?.lines).toEqual([
      "nexora/x : prix sous le plancher de marge (sortie)",
      "nexora/x : prix sous le plancher de marge (entrée, plage « creux »)",
    ]);
  });
  test("les routes de secours ne sont contrôlées que s'il y en a", () => {
    const withRoutes = buildChecklist(
      {
        ready: false,
        fx,
        issues: [{ code: "route_secret_missing", model: "nexora/x", route: 1 }],
      },
      { secretRef: "llm.a", hasRoutes: true },
    );
    expect(withRoutes.find((i) => i.id === "routes")?.ok).toBe(false);
    expect(
      buildChecklist(
        { ready: true, issues: [], fx },
        { secretRef: "llm.a", hasRoutes: false },
      ).some((i) => i.id === "routes"),
    ).toBe(false);
  });
  test("un problème inconnu n'est jamais passé sous silence", () => {
    const items = buildChecklist(
      {
        ready: false,
        fx,
        issues: [{ code: "nouveau_code", model: "nexora/x" }],
      },
      { secretRef: null, hasRoutes: false },
    );
    expect(items.at(-1)).toMatchObject({ id: "other", ok: false });
  });
});

describe("contrôles préalables d'un modèle en aperçu", () => {
  const fxOk = {
    id: "f",
    usdToCadMicro: "1400000",
    effectiveAt: "2026-10-29T00:00:00.000Z",
  };
  test("la clé n'est pas exigée : le contrôle est vert et le dit", () => {
    const items = buildChecklist(
      { ready: true, issues: [], fx: fxOk },
      { secretRef: "llm.deepinfra", hasRoutes: false, availability: "preview" },
    );
    const secret = items.find((i) => i.id === "secret");
    expect(secret?.ok).toBe(true);
    expect(secret?.label).toContain("aperçu");
    expect(secret?.detail).toContain("Passer en service");
    expect(items.every((i) => i.ok)).toBe(true);
  });
  test("un modèle en service garde le contrôle de la clé", () => {
    const items = buildChecklist(
      {
        ready: false,
        fx: fxOk,
        issues: [
          { code: "secret_missing", model: "nexora/x", provider: "deepinfra" },
        ],
      },
      { secretRef: "llm.deepinfra", hasRoutes: false, availability: "live" },
    );
    const secret = items.find((i) => i.id === "secret");
    expect(secret?.ok).toBe(false);
    expect(secret?.label).toBe("Clé du fournisseur dans le Coffre");
  });
  test("un aperçu ne cache pas les autres problèmes (prix, fournisseur désactivé)", () => {
    const items = buildChecklist(
      {
        ready: false,
        fx: fxOk,
        issues: [
          { code: "price_missing", model: "nexora/x" },
          { code: "provider_disabled", model: "nexora/x" },
        ],
      },
      { secretRef: "llm.deepinfra", hasRoutes: false, availability: "preview" },
    );
    expect(items.filter((i) => !i.ok).map((i) => i.id)).toEqual([
      "price",
      "provider",
    ]);
  });
});
