import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Mosaic, mosaicBlinks, mosaicCells, PALETTES } from "./mosaic";

const base = { cols: 24, rows: 12, seed: 7, tiers: 6 } as const;

describe("mosaïque (matière signature de Nexora AI)", () => {
  it("est déterministe : même graine, mêmes cellules (aucun écart entre serveur et client)", () => {
    expect(mosaicCells({ ...base, toward: "right", fade: 0.8 })).toEqual(
      mosaicCells({ ...base, toward: "right", fade: 0.8 }),
    );
    expect(mosaicCells({ ...base, toward: "right", fade: 0.8 })).not.toEqual(
      mosaicCells({ ...base, seed: 8, toward: "right", fade: 0.8 }),
    );
  });

  it("garde chaque cellule dans la grille et chaque teinte dans la rampe", () => {
    for (const toward of [
      "right",
      "left",
      "top",
      "bottom",
      "center",
    ] as const) {
      for (const c of mosaicCells({ ...base, toward, fade: 0.6 })) {
        expect(c.col).toBeGreaterThanOrEqual(0);
        expect(c.col).toBeLessThan(base.cols);
        expect(c.row).toBeGreaterThanOrEqual(0);
        expect(c.row).toBeLessThan(base.rows);
        expect(c.tier).toBeGreaterThanOrEqual(0);
        expect(c.tier).toBeLessThan(base.tiers);
      }
    }
  });

  it("sans fondu, remplit toute la grille (un champ de teintes, comme un fond de maquette)", () => {
    expect(mosaicCells({ ...base, toward: "right", fade: 0 })).toHaveLength(
      base.cols * base.rows,
    );
  });

  it("avec fondu, se dissout vers le côté opposé : plus de carrés du côté « toward »", () => {
    const cells = mosaicCells({ ...base, toward: "right", fade: 1 });
    const left = cells.filter((c) => c.col < base.cols / 2).length;
    const right = cells.length - left;
    expect(cells.length).toBeLessThan(base.cols * base.rows);
    expect(right).toBeGreaterThan(left * 2);
    // et les teintes soutenues sont du côté plein
    const deep = cells.filter((c) => c.tier >= base.tiers - 2);
    expect(deep.filter((c) => c.col >= base.cols / 2).length).toBeGreaterThan(
      deep.length * 0.8,
    );
  });

  it("dessine une couche par teinte : peu de nœuds, jamais un élément par carré", () => {
    const html = renderToStaticMarkup(
      <Mosaic {...base} toward="right" fade={0.9} palette="braise" />,
    );
    const paths = html.match(/<path/g)?.length ?? 0;
    expect(paths).toBeLessThanOrEqual(base.tiers);
    expect(paths).toBeGreaterThan(0);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/<img|<script|<rect|https?:\/\//);
  });

  it("toutes les rampes ont assez de teintes pour la mosaïque", () => {
    for (const ramp of Object.values(PALETTES)) {
      expect(ramp.length).toBeGreaterThanOrEqual(6);
      for (const hex of ramp) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("le mouvement ne passe que par des classes (désactivées sous prefers-reduced-motion)", () => {
    const html = renderToStaticMarkup(
      <Mosaic {...base} toward="left" fade={0.5} palette="ciel" animated />,
    );
    expect(html).toContain("mo-animate");
    expect(html).not.toMatch(/<style|animation/);
  });

  describe("pixels qui s'allument (mouvement discret)", () => {
    const cells = mosaicCells({ ...base, toward: "right", fade: 1 });

    it("choisit un petit nombre de cellules déjà dessinées, toujours les mêmes pour une graine", () => {
      const a = mosaicBlinks(cells, 6, 7);
      expect(a).toHaveLength(6);
      expect(a).toEqual(mosaicBlinks(cells, 6, 7));
      expect(a).not.toEqual(mosaicBlinks(cells, 6, 8));
      for (const b of a)
        expect(cells.some((c) => c.col === b.col && c.row === b.row)).toBe(
          true,
        );
      expect(new Set(a.map((b) => `${b.col}:${b.row}`)).size).toBe(6);
    });

    it("n'en promet pas plus qu'il n'y a de cellules, et décale les départs (aucun battement synchrone)", () => {
      expect(mosaicBlinks(cells.slice(0, 3), 10, 1)).toHaveLength(3);
      expect(mosaicBlinks(cells, 0, 1)).toEqual([]);
      const delays = mosaicBlinks(cells, 8, 3).map((b) => b.delay);
      expect(new Set(delays).size).toBeGreaterThan(4);
      for (const d of delays) {
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThan(12);
      }
    });

    it("n'ajoute rien au rendu tant que `blink` n'est pas demandé, et reste décoratif quand il l'est", () => {
      const off = renderToStaticMarkup(<Mosaic {...base} fade={1} />);
      expect(off).not.toContain("mo-blink");
      const on = renderToStaticMarkup(<Mosaic {...base} fade={1} blink={5} />);
      expect(on.match(/class="mo-blink"/g)).toHaveLength(5);
      expect(on).toContain('aria-hidden="true"');
      expect(on).not.toMatch(/<style|animation|https?:\/\//);
    });
  });
});
