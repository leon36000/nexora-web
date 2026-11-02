import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LANGS } from "@/i18n/config";
import { ERROR_PAGE } from "@/i18n/error-page";
import { Digits404 } from "./digits-404";
import { ErrorScreen } from "./error-screen";

describe("écran d'erreur commun", () => {
  it.each(["404", "500", "503"] as const)(
    "dessine %s au trait de lumière, sans aucun carré (la mosaïque est retirée), décoratif",
    (code) => {
      const html = renderToStaticMarkup(<Digits404 code={code} />);
      expect(html).toContain(`>${code}</text>`);
      expect(html).not.toMatch(/<rect/);
      expect(html).toContain('aria-hidden="true"');
    },
  );

  it("un seul h1, le titre, le texte et les actions donnés", () => {
    const html = renderToStaticMarkup(
      <ErrorScreen code="500" label="Erreur 500" title="Titre" text="Texte">
        <a href="/x">Action</a>
      </ErrorScreen>,
    );
    expect(html.match(/<h1/g)).toHaveLength(1);
    for (const part of ["Erreur 500", "Titre", "Texte", ">Action<"])
      expect(html).toContain(part);
  });

  it("les textes de l'erreur 500 existent dans les deux langues, avec la même structure", () => {
    expect(Object.keys(ERROR_PAGE.en)).toEqual(Object.keys(ERROR_PAGE.fr));
    for (const lang of LANGS)
      for (const value of Object.values(ERROR_PAGE[lang]))
        expect(value.length).toBeGreaterThan(3);
    expect(ERROR_PAGE.fr.label).toContain("500");
    expect(ERROR_PAGE.en.label).toContain("500");
  });
});
