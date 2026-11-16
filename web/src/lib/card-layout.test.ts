import { describe, expect, it } from "vitest";
import { desktopRows, desktopSpans } from "./card-layout";

describe("répartition des cartes en bureau", () => {
  it("5 cartes sur 3 colonnes : 3 puis 2 (jamais une carte seule)", () => {
    expect(desktopRows(5, 3)).toEqual([3, 2]);
  });

  it("n'a jamais de rangée à une seule carte dès que deux cartes ou plus", () => {
    for (let max = 2; max <= 4; max++)
      for (let n = 2; n <= 24; n++) {
        const rows = desktopRows(n, max);
        expect(rows.reduce((a, b) => a + b, 0)).toBe(n);
        expect(rows.every((r) => r >= 2)).toBe(true);
        expect(Math.max(...rows)).toBeLessThanOrEqual(4);
      }
  });

  it("garde les cas simples tels quels", () => {
    expect(desktopRows(6, 3)).toEqual([3, 3]);
    expect(desktopRows(4, 2)).toEqual([2, 2]);
    expect(desktopRows(2, 3)).toEqual([2]);
    expect(desktopRows(1, 3)).toEqual([1]);
    expect(desktopRows(0, 3)).toEqual([]);
  });

  it("limite le nombre de colonnes aux valeurs prises en charge", () => {
    expect(desktopRows(6, 0)).toEqual([2, 2, 2]);
    expect(desktopRows(8, 5)).toEqual([4, 4]);
  });

  it("répartit sans déséquilibre : les rangées diffèrent d'une carte au plus", () => {
    expect(desktopRows(7, 3)).toEqual([3, 2, 2]);
    expect(desktopRows(7, 4)).toEqual([4, 3]);
    expect(desktopRows(5, 4)).toEqual([3, 2]);
    expect(desktopRows(3, 2)).toEqual([3]); // 2+1 serait orpheline : on passe à 3 colonnes
    expect(desktopRows(5, 2)).toEqual([3, 2]);
  });

  it("donne à chaque carte son empan sur une grille de 12 colonnes", () => {
    expect(desktopSpans(5, 3)).toEqual([4, 4, 4, 6, 6]);
    expect(desktopSpans(4, 4)).toEqual([3, 3, 3, 3]);
    expect(desktopSpans(1, 3)).toEqual([12]);
  });
});
