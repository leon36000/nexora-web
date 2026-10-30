import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatDateTime,
  formatLatency,
  formatMicroCadExact,
  formatTokensCompact,
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
  it("AAAA-MM-JJ HH:MM:SS à l'heure de Montréal, identique dans les deux langues", () => {
    expect(formatDateTime(new Date("2026-10-29T15:04:05Z"))).toBe(
      "2026-10-29 11:04:05", // heure d'été (UTC-4)
    );
    expect(formatDateTime(new Date("2026-12-01T05:00:00Z"))).toBe(
      "2026-12-01 00:00:00", // minuit : jamais « 24 »
    );
    expect(formatDateTime(new Date("2026-01-15T03:30:00Z"))).toBe(
      "2026-01-14 22:30:00", // heure normale (UTC-5), veille
    );
  });
});

describe("jetons en millions", () => {
  it("français : « 1,2 M », « 5 M », « 850 k », entiers sous 1 000", () => {
    expect(plain(formatTokensCompact("fr", 5_000_000))).toBe("5 M");
    expect(plain(formatTokensCompact("fr", 1_234_000))).toBe("1,2 M");
    expect(plain(formatTokensCompact("fr", 850_000))).toBe("850 k");
    expect(plain(formatTokensCompact("fr", 0))).toBe("0");
    expect(plain(formatTokensCompact("fr", 999))).toBe("999");
  });
  it("anglais : point décimal", () => {
    expect(plain(formatTokensCompact("en", 1_234_000))).toBe("1.2 M");
    expect(plain(formatTokensCompact("en", 5_000_000))).toBe("5 M");
  });
});

describe("octets (1 Go = 1 000 000 000 octets, comme le quota)", () => {
  it("français : o, Ko, Mo, Go, To, virgule décimale", () => {
    expect(plain(formatBytes("fr", 0))).toBe("0 o");
    expect(plain(formatBytes("fr", 999))).toBe("999 o");
    expect(plain(formatBytes("fr", 1_000))).toBe("1 Ko");
    expect(plain(formatBytes("fr", 250_000_000))).toBe("250 Mo");
    expect(plain(formatBytes("fr", 1_000_000_000))).toBe("1 Go");
    expect(plain(formatBytes("fr", 1_500_000_000))).toBe("1,5 Go");
    expect(plain(formatBytes("fr", 12_345_678))).toBe("12,3 Mo");
    expect(plain(formatBytes("fr", 50_000_000_000))).toBe("50 Go");
    expect(plain(formatBytes("fr", 2_000_000_000_000))).toBe("2 To");
  });

  it("anglais : B, KB, MB, GB, TB, point décimal", () => {
    expect(plain(formatBytes("en", 1_500_000_000))).toBe("1.5 GB");
    expect(plain(formatBytes("en", 640))).toBe("640 B");
  });

  it("un nombre négatif ou invalide donne zéro, jamais un texte étrange", () => {
    expect(plain(formatBytes("fr", -5))).toBe("0 o");
    expect(plain(formatBytes("fr", Number.NaN))).toBe("0 o");
  });

  it("l'espace insécable sépare le nombre de l'unité (jamais de retour à la ligne entre les deux)", () => {
    expect(formatBytes("fr", 1_000_000_000)).toContain(" Go");
  });
});
