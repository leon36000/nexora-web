import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ lang: "fr" as "fr" | "en" }));
vi.mock("next/root-params", () => ({ lang: async () => current.lang }));

import AppsPage from "./page";

const render = async (lang: "fr" | "en") => {
  current.lang = lang;
  return renderToStaticMarkup(await AppsPage());
};

describe("page Nexora Apps : /apps", () => {
  beforeEach(() => {
    current.lang = "fr";
  });

  it("le héros propose « Me prévenir à l'ouverture » vers le sujet de la plateforme (fr-CA et en-CA)", async () => {
    expect(await render("fr")).toMatch(
      /<a [^>]*href="\/contact\?sujet=ouverture-plateforme"[^>]*>[^<]*Me prévenir à l’ouverture/,
    );
    expect(await render("en")).toMatch(
      /<a [^>]*href="\/en\/contact\?sujet=ouverture-plateforme"[^>]*>[^<]*Notify me when it opens/,
    );
  });

  it("aucune carte n'est « disponible » : la légende n'affirme pas « Livré et utilisable aujourd'hui »", async () => {
    const fr = await render("fr");
    expect(fr).not.toContain("Livré et utilisable aujourd’hui");
    expect(fr).toContain("En préparation. Aucune date n’est annoncée.");
    expect(fr).toContain("Prévu à une étape ultérieure");
    const en = await render("en");
    expect(en).not.toContain("Shipped and usable today");
  });
});
