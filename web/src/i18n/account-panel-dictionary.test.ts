import { describe, expect, it } from "vitest";
import { PANEL_NAV } from "@/components/account/panel-logic";
import { ACTIVITY_PERIODS } from "@/server/gateway/activity";
import { getAccountDictionary } from "./account";

/** Chemins de toutes les chaînes d'un dictionnaire (`a.b.c`) avec leur valeur. */
function leaves(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([k, v]) =>
      leaves(v, path ? `${path}.${k}` : k),
    );
  throw new Error(`valeur inattendue à ${path}`);
}
const placeholders = (s: string) =>
  [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const fr = getAccountDictionary("fr");
const en = getAccountDictionary("en");

describe("dictionnaires du panneau client (fr-CA / en-CA)", () => {
  const frPanel = leaves(fr.panel);
  const enPanel = leaves(en.panel);

  it("mêmes clés, dans le même ordre", () => {
    expect(enPanel.map(([k]) => k)).toEqual(frPanel.map(([k]) => k));
    // Le reste du dictionnaire : mêmes clés (l'ordre y est libre).
    expect(
      leaves(en)
        .map(([k]) => k)
        .sort(),
    ).toEqual(
      leaves(fr)
        .map(([k]) => k)
        .sort(),
    );
  });

  it("aucune chaîne vide, et les mêmes marqueurs {nom} dans les deux langues", () => {
    const enByKey = new Map(enPanel);
    for (const [key, text] of frPanel) {
      expect(text.trim(), `fr ${key}`).not.toBe("");
      expect(enByKey.get(key)?.trim(), `en ${key}`).not.toBe("");
      expect(placeholders(enByKey.get(key) ?? ""), key).toEqual(
        placeholders(text),
      );
    }
  });

  it("l'anglais ne recopie pas le français (phrases de trois mots et plus)", () => {
    const enByKey = new Map(enPanel);
    const words = (text: string) =>
      text
        .replace(/\{\w+\}/g, "")
        .split(/\s+/)
        .filter((w) => /[a-zà-ÿ]{2,}/i.test(w));
    // Les noms propres de produits ne se traduisent pas : « Nexora Privacy Router », « Nexora Code (MCP) ».
    const PROPER_NOUNS = new Set([
      "Nexora Privacy Router",
      "Nexora Code (MCP)",
    ]);
    const same = frPanel.filter(
      ([key, text]) =>
        text === enByKey.get(key) &&
        words(text).length >= 3 &&
        !PROPER_NOUNS.has(text),
    );
    expect(same).toEqual([]);
  });

  it("chaque entrée de la navigation et chaque période a son libellé", () => {
    for (const d of [fr, en]) {
      for (const item of PANEL_NAV)
        expect(d.panel.nav.items[item.id], item.id).toBeTruthy();
      for (const period of ACTIVITY_PERIODS)
        expect(d.panel.activity.filters.periods[period], period).toBeTruthy();
    }
  });
});
