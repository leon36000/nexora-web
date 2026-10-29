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
