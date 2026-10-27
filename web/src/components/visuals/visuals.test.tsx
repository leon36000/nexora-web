import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { bentoSpans } from "@/components/blocks/cards-block";
import { LANGS } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { getVisualsDictionary } from "@/i18n/visuals";
import { SECTION_VISUALS } from "@/server/cms/model";
import { SectionVisualFigure } from "./index";

const SHOWN = SECTION_VISUALS.filter((v) => v !== "aucun");

/** Les clés (chemins) d'un objet de dictionnaire, tableaux compris. */
function keys(o: unknown, prefix = ""): string[] {
  if (typeof o === "string") return [prefix];
  if (Array.isArray(o)) return o.flatMap((v, i) => keys(v, `${prefix}[${i}]`));
  return Object.entries(o as object).flatMap(([k, v]) =>
    keys(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe("illustrations de section (champ `visual`)", () => {
  for (const lang of LANGS) {
    for (const visual of SHOWN) {
      it(`${visual} (${lang}) : image nommée par le texte alternatif du dictionnaire, sans ressource externe`, () => {
        const html = renderToStaticMarkup(
          <SectionVisualFigure visual={visual} lang={lang} />,
        );
        const alt = getDictionary(lang).cms.visuals[visual];
        expect(alt.length).toBeGreaterThan(40);
        expect(html).toContain('role="img"');
        expect(html).toContain(`aria-label="${alt}"`);
        // Aucune image, aucune police, aucun script, aucune URL : tout est dessiné.
        expect(html).not.toMatch(/<img|<script|https?:\/\//);
      });
    }
  }

  it("une maquette dit qu'elle en est une ; un schéma de principe dit qu'il n'est pas une capture", () => {
    const v = getVisualsDictionary("fr");
    for (const mock of [
      "flux-workstudio",
      "catalogue-modeles",
      "console-vps",
      "tableau-de-bord",
    ] as const)
      expect(
        renderToStaticMarkup(<SectionVisualFigure visual={mock} lang="fr" />),
      ).toContain(v.caption.mock);
    for (const concept of ["vision-sur-place", "croissance-canaux"] as const)
      expect(
        renderToStaticMarkup(
          <SectionVisualFigure visual={concept} lang="fr" />,
        ),
      ).toContain(v.caption.concept);
  });

  it("le dictionnaire des visuels a la même structure en fr-CA et en en-CA", () => {
    expect(keys(getVisualsDictionary("en"))).toEqual(
      keys(getVisualsDictionary("fr")),
    );
  });

  it("la maquette du flux montre l'approbation humaine avant l'écriture (la garde centrale du produit)", () => {
    const html = renderToStaticMarkup(
      <SectionVisualFigure visual="flux-workstudio" lang="fr" />,
    );
    const approval = html.indexOf("Une personne décide");
    const write = html.indexOf("Écrire en comptabilité");
    expect(approval).toBeGreaterThan(0);
    expect(write).toBeGreaterThan(approval);
  });

  it("le schéma Vision ne dessine aucune reconnaissance faciale et dit que les images restent sur place", () => {
    const html = renderToStaticMarkup(
      <SectionVisualFigure visual="vision-sur-place" lang="fr" />,
    );
    expect(html).toContain("Les images restent sur place");
    expect(html).not.toMatch(/visage|reconnaissance|biom/i);
  });
});

describe("mosaïque de cartes", () => {
  it("remplit toujours des rangées de six colonnes, quel que soit le nombre de cartes", () => {
    for (let n = 1; n <= 12; n++) {
      const spans = bentoSpans(n);
      expect(spans).toHaveLength(n);
      let row = 0;
      for (const s of spans) {
        row += s;
        if (row === 6) row = 0;
        expect(row, `n=${n}`).toBeLessThan(6);
      }
      expect(row, `n=${n} : rangée finale incomplète`).toBe(0);
    }
  });
});

describe("mouvement", () => {
  it("toute animation CSS est déclarée sous prefers-reduced-motion: no-preference", () => {
    const css = readFileSync(
      new URL("../../app/globals.css", import.meta.url),
      "utf8",
    );
    // Retire les blocs @media (prefers-reduced-motion: no-preference) { … } (accolades équilibrées).
    let rest = css;
    for (;;) {
      const start = rest.indexOf(
        "@media (prefers-reduced-motion: no-preference)",
      );
      if (start === -1) break;
      let depth = 0;
      let end = rest.indexOf("{", start);
      for (let i = end; i < rest.length; i++) {
        if (rest[i] === "{") depth++;
        if (rest[i] === "}" && --depth === 0) {
          end = i;
          break;
        }
      }
      rest = rest.slice(0, start) + rest.slice(end + 1);
    }
    // Hors de ces blocs, ni propriété `animation`, ni `scroll-behavior: smooth` : les @keyframes seuls sont permis.
    const withoutKeyframes = rest.replace(
      /@keyframes[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/g,
      "",
    );
    expect(withoutKeyframes).not.toMatch(/animation(-[a-z]+)?\s*:/);
    expect(withoutKeyframes).not.toMatch(/scroll-behavior\s*:\s*smooth/);
  });
});
