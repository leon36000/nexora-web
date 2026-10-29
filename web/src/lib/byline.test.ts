import { describe, expect, it } from "vitest";
import { bylineDates, isArticleLike } from "./byline";

describe("bylineDates : dates affichées sous le titre d'un guide", () => {
  it("donne la date de publication et celle de mise à jour, en toutes lettres, selon la langue", () => {
    const d = bylineDates(
      {
        createdAt: "2026-10-20T14:00:00.000Z",
        updatedAt: "2026-10-29T15:30:00.000Z",
      },
      "fr",
    );
    expect(d.published?.label).toBe("20 octobre 2026");
    expect(d.updated?.label).toBe("29 octobre 2026");
    expect(d.published?.iso).toBe("2026-10-20");
    const en = bylineDates(
      {
        createdAt: "2026-10-20T14:00:00.000Z",
        updatedAt: "2026-10-29T15:30:00.000Z",
      },
      "en",
    );
    expect(en.updated?.label).toMatch(/October 29, 2026/);
  });

  it("n'affiche pas une mise à jour qui tombe le jour de la publication", () => {
    const d = bylineDates(
      {
        createdAt: "2026-10-29T10:00:00.000Z",
        updatedAt: "2026-10-29T18:00:00.000Z",
      },
      "fr",
    );
    expect(d.published?.label).toBe("29 octobre 2026");
    expect(d.updated).toBeNull();
  });

  it("compte le jour à l'heure de l'Est : un instant tardif en UTC reste le jour du Québec", () => {
    // 2026-10-30 02:00 UTC = 29 octobre 22 h à Montréal
    const d = bylineDates(
      {
        createdAt: "2026-10-01T12:00:00.000Z",
        updatedAt: "2026-10-30T02:00:00.000Z",
      },
      "fr",
    );
    expect(d.updated?.label).toBe("29 octobre 2026");
    expect(d.updated?.iso).toBe("2026-10-29");
  });

  it("n'invente aucune date : une date absente ou illisible est omise", () => {
    expect(bylineDates(null, "fr")).toEqual({ published: null, updated: null });
    expect(
      bylineDates({ createdAt: "pas une date", updatedAt: null }, "fr"),
    ).toEqual({ published: null, updated: null });
  });
});

describe("isArticleLike : quelles pages affichent la ligne de signature", () => {
  it("les guides et les fiches de gabarits, pas les pages de produit", () => {
    expect(isArticleLike("guides/ia-pme-quebec")).toBe(true);
    expect(isArticleLike("gabarits-flux-de-travaux/devis")).toBe(true);
    expect(isArticleLike("gabarits-flux-de-travaux")).toBe(true);
    expect(isArticleLike("workstudio")).toBe(false);
    expect(isArticleLike("")).toBe(false);
  });
});
