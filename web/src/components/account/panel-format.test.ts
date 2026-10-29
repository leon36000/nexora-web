import { describe, expect, it } from "vitest";
import {
  formatDateTime,
  formatLatency,
  formatMicroCadExact,
  sharePercent,
} from "./panel-format";

/** Intl sépare les milliers par des espaces insécables : on les ramène à des espaces ordinaires. */
const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("montants en micro-CAD, sans flottant", () => {
  it("français : virgule décimale, deux à quatre décimales", () => {
    expect(plain(formatMicroCadExact("fr", 0n))).toBe("0,00 $");
    expect(plain(formatMicroCadExact("fr", 1_000_000n))).toBe("1,00 $");
    expect(plain(formatMicroCadExact("fr", 250n))).toBe("0,0003 $");
    expect(plain(formatMicroCadExact("fr", 12_345_678n))).toBe("12,3457 $");
    expect(plain(formatMicroCadExact("fr", 5_900n))).toBe("0,0059 $");
  });

  it("anglais : symbole devant, point décimal", () => {
    expect(plain(formatMicroCadExact("en", 12_345_678n))).toBe("$12.3457");
    expect(plain(formatMicroCadExact("en", 0n))).toBe("$0.00");
  });

  it("garde tous les chiffres entiers d'un très grand montant (au-delà de 2^53)", () => {
    // 123 456 789 012 345 678 micro-CAD : un flottant donnerait ...680 ; ici les chiffres sont exacts.
    expect(plain(formatMicroCadExact("fr", 123_456_789_012_345_678n))).toBe(
      "123 456 789 012,3457 $",
    );
    expect(plain(formatMicroCadExact("fr", 9_007_199_254_740_993n))).toBe(
      "9 007 199 254,741 $",
    );
  });

  it("affiche le signe d'un montant négatif", () => {
    expect(plain(formatMicroCadExact("fr", -1_500_000n))).toBe("-1,50 $");
  });
});

describe("part d'un total (largeur des barres)", () => {
  it("calcule en entiers, au centième de pour cent", () => {
    expect(sharePercent(0n, 0n)).toBe(0);
    expect(sharePercent(5n, 0n)).toBe(0);
    expect(sharePercent(1n, 3n)).toBe(33.33);
    expect(sharePercent(2n, 3n)).toBe(66.66);
    expect(sharePercent(3n, 3n)).toBe(100);
    // Très grands nombres : pas de perte de précision.
    expect(sharePercent(9_007_199_254_740_993n, 18_014_398_509_481_986n)).toBe(
      50,
    );
  });

  it("ne dépasse jamais 100 ni ne descend sous 0", () => {
    expect(sharePercent(10n, 3n)).toBe(100);
    expect(sharePercent(-5n, 3n)).toBe(0);
  });
});

describe("latence", () => {
  it("millisecondes sous la seconde, secondes au-delà", () => {
    expect(plain(formatLatency("fr", 812))).toBe("812 ms");
    expect(plain(formatLatency("en", 812))).toBe("812 ms");
    expect(plain(formatLatency("fr", 1234))).toBe("1,2 s");
    expect(plain(formatLatency("en", 12_000))).toBe("12 s");
  });
});

describe("date et heure du journal", () => {
  it("heure de Montréal, avec les secondes", () => {
    const d = new Date("2026-10-29T15:04:05Z"); // 11 h 04 à Montréal (heure d'été)
    expect(formatDateTime("fr", d)).toMatch(/11\D+04\D+05/);
    expect(formatDateTime("en", d)).toMatch(/11:04:05/);
  });
});
