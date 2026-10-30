import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LANGS } from "@/i18n/config";
import { ERROR_PAGE } from "@/i18n/error-page";
import { Digits404 } from "./digits-404";
import { ErrorScreen } from "./error-screen";

describe("écran d'erreur commun", () => {
  it.each([
    ["404", 30],
    ["500", 35],
    ["503", 34],
  ] as const)(
    "dessine %s en %i carrés, avec un seul point de passage, décoratif",
    (code, squares) => {
      const html = renderToStaticMarkup(<Digits404 code={code} />);
      expect(html.match(/<rect/g)).toHaveLength(squares);
      expect(html.match(/fill="var\(--fg\)"/g)).toHaveLength(1);
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
