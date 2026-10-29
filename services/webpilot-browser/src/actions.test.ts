import { describe, expect, it } from "vitest";
import { type ActionLimits, PRESS_KEYS, parseActions } from "./actions.ts";

const limits: ActionLimits = {
  maxActions: 5,
  maxWaitMs: 10_000,
  maxTextChars: 100,
  viewport: { width: 1280, height: 800 },
};
const ok = (input: unknown) => parseActions(input, limits);

describe("liste fermée d'actions", () => {
  it("accepte chacune des neuf actions du contrat", () => {
    const r = parseActions(
      [
        { type: "goto", url: "https://exemple.org/" },
        { type: "click", selector: "button.ok" },
        { type: "click", text: "Continuer" },
        { type: "click", x: 10, y: 20 },
        { type: "type", selector: "#q", text: "bonjour" },
        { type: "press", key: "Enter" },
        { type: "select", selector: "#s", value: "ca" },
        { type: "scroll", direction: "down", amount: 300 },
        { type: "wait", for: "selector", selector: "#r" },
        { type: "wait", for: "idle" },
        { type: "wait", for: "ms", ms: 500 },
        { type: "read" },
        { type: "screenshot" },
      ],
      { ...limits, maxActions: 20 },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.actions).toHaveLength(13);
  });

  it("refuse tout type hors liste, dont l'exécution de JavaScript fourni par l'appelant", () => {
    for (const type of [
      "evaluate",
      "eval",
      "script",
      "js",
      "download",
      "upload",
      "cookies",
      "addInitScript",
      "route",
    ])
      expect(ok([{ type, expression: "1+1" }]), type).toMatchObject({
        ok: false,
        index: 0,
      });
  });

  it("refuse les champs inconnus (aucun paramètre ignoré en silence)", () => {
    expect(ok([{ type: "read", script: "alert(1)" }]).ok).toBe(false);
    expect(
      ok([{ type: "goto", url: "https://exemple.org/", headers: {} }]).ok,
    ).toBe(false);
  });

  it("exige un seul moyen de viser pour click", () => {
    expect(ok([{ type: "click" }]).ok).toBe(false);
    expect(ok([{ type: "click", selector: "a", text: "b" }]).ok).toBe(false);
    expect(ok([{ type: "click", x: 1 }]).ok).toBe(false);
  });

  it("borne le nombre d'actions, la longueur du texte et les attentes", () => {
    expect(ok([]).ok).toBe(false);
    expect(ok(Array.from({ length: 6 }, () => ({ type: "read" }))).ok).toBe(
      false,
    );
    expect(
      ok([{ type: "type", selector: "#q", text: "x".repeat(101) }]).ok,
    ).toBe(false);
    expect(ok([{ type: "wait", for: "ms", ms: 10_001 }]).ok).toBe(false);
    expect(ok([{ type: "wait", for: "ms", ms: -1 }]).ok).toBe(false);
  });

  it("borne les coordonnées au viewport", () => {
    expect(ok([{ type: "click", x: 1280, y: 10 }]).ok).toBe(false);
    expect(ok([{ type: "click", x: -1, y: 10 }]).ok).toBe(false);
    expect(ok([{ type: "click", x: 1279, y: 799 }]).ok).toBe(true);
  });

  it("n'accepte pour press que des touches de navigation nommées, jamais un caractère imprimable", () => {
    for (const key of PRESS_KEYS)
      expect(ok([{ type: "press", key }]).ok).toBe(true);
    for (const key of [
      "a",
      "A",
      "1",
      "Shift+A",
      "Control+V",
      "Meta+V",
      " ",
      "Space",
      "@",
      "F12",
    ])
      expect(ok([{ type: "press", key }]).ok, key).toBe(false);
  });

  it("refuse les sélecteurs vides ou démesurés", () => {
    expect(ok([{ type: "click", selector: "" }]).ok).toBe(false);
    expect(ok([{ type: "click", selector: "a".repeat(501) }]).ok).toBe(false);
  });

  it("refuse une adresse qui n'est pas une chaîne ou qui est démesurée", () => {
    expect(ok([{ type: "goto", url: 5 }]).ok).toBe(false);
    expect(
      ok([{ type: "goto", url: `https://e.org/${"a".repeat(2100)}` }]).ok,
    ).toBe(false);
  });

  it("indique la position de la première action invalide", () => {
    const r = ok([{ type: "read" }, { type: "scroll", direction: "sideways" }]);
    expect(r).toMatchObject({ ok: false, index: 1 });
  });

  it("n'accepte qu'un tableau", () => {
    expect(ok({ type: "read" }).ok).toBe(false);
    expect(ok("read").ok).toBe(false);
  });
});
