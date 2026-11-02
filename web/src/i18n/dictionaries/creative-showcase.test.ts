import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LANGS } from "../config";
import { getCreativeShowcase } from "./creative-showcase";

const WEB = join(import.meta.dirname, "..", "..", "..");
const CLAIMS = new Set<string>(
  (
    JSON.parse(
      readFileSync(join(WEB, "..", "cms", "content", "claims.json"), "utf8"),
    ) as { claims: { id: string }[] }
  ).claims.map((c) => c.id),
);

function strings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === "object") return Object.values(v).flatMap(strings);
  return [];
}

describe("vitrine Nexora Creative", () => {
  it("chaque affirmation citée existe dans le registre", () => {
    for (const lang of LANGS)
      for (const id of getCreativeShowcase(lang).claims)
        expect(CLAIMS.has(id), `${lang} ${id}`).toBe(true);
  });

  it("les deux langues ont la même structure", () => {
    const fr = getCreativeShowcase("fr");
    const en = getCreativeShowcase("en");
    expect(en.steps.length).toBe(fr.steps.length);
    expect(en.plans.map((p) => p.image)).toEqual(fr.plans.map((p) => p.image));
    expect(en.features.length).toBe(fr.features.length);
    expect(en.honest.length).toBe(fr.honest.length);
    expect(en.stats.map((s) => s.value.replace(/\D/g, ""))).toEqual(
      fr.stats.map((s) => s.value.replace(/\D/g, "")),
    );
  });

  it("chaque image existe dans public (à la racine : le proxy n'accepte les fichiers statiques que sans sous-dossier) et l'ancienne bande-annonce n'y est plus", () => {
    for (const old of [
      "creative-bande-annonce.mp4",
      "creative-terre-flotte.jpg",
    ])
      expect(existsSync(join(WEB, "public", old)), old).toBe(false);
    for (const p of getCreativeShowcase("fr").plans)
      expect(
        existsSync(join(WEB, "public", `creative-${p.image}.jpg`)),
        p.image,
      ).toBe(true);
  });

  it("la licence est respectée : MiniMax H3 et MiniMax-Music3 sont nommés, la vidéo est dite générée par IA", () => {
    for (const lang of LANGS) {
      const t = getCreativeShowcase(lang);
      expect(t.video.credit).toContain("MiniMax H3");
      expect(t.video.credit).toContain("MiniMax-Music3");
      expect(t.attribution).toContain("MiniMax H3");
    }
  });

  it("aucune promesse absolue, prix, garantie, certification ni mention de Qwen (licence de recherche)", () => {
    const forbidden: [RegExp, string][] = [
      [/\d\s*(\$|€|CAD|USD|%)/i, "prix ou pourcentage"],
      [/garanti|guarantee/i, "garantie"],
      [
        /\bleader\b|numéro un|#1|meilleur que|better than|Higgsfield/i,
        "superlatif ou concurrent",
      ],
      [/loi\s*25|law\s*25|certifi|conforme|compliant/i, "conformité"],
      [/qwen/i, "modèle sous licence de recherche"],
    ];
    for (const lang of LANGS)
      for (const s of strings(getCreativeShowcase(lang)))
        for (const [re, why] of forbidden)
          expect(re.test(s), `${lang} « ${s} » : ${why}`).toBe(false);
  });
});
