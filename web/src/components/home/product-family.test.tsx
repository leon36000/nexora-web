import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { APPS, findApp } from "@/i18n/apps";
import { LANGS } from "@/i18n/config";
import { FAMILY, familyState, ProductFamily } from "./product-family";

describe("bande « un compte, tous vos outils » de l'accueil", () => {
  for (const lang of LANGS) {
    const html = renderToStaticMarkup(<ProductFamily lang={lang} />);

    it(`${lang} : huit outils, chacun avec un lien localisé et un état écrit`, () => {
      expect(html.match(/<li class="reveal/g)).toHaveLength(8);
      const prefix = lang === "fr" ? "" : "/en";
      for (const path of [
        "/workstudio",
        "/apps/code",
        "/apps/rag",
        "/apps/bot",
        "/apps/creative",
        "/apps/webpilot",
        "/apps/privacy-router",
        "/vps",
      ])
        expect(html).toContain(`href="${prefix}${path}"`);
      expect(html).toContain('href="' + prefix + '/compte"');
      expect(html).toContain('aria-labelledby="family-title"');
      expect(html).toContain('id="family-title"');
    });

    it(`${lang} : décoratif sans ressource externe ni image`, () => {
      expect(html).not.toMatch(/<img|<script|https?:\/\//);
    });
  }

  it("l'état d'un outil de Nexora Apps est celui du registre ; WorkStudio disponible et les VPS bientôt suivent le site", () => {
    for (const entry of FAMILY) {
      if (entry.app) expect(familyState(entry)).toBe(findApp(entry.app)?.state);
    }
    expect(
      familyState(FAMILY.find((e) => e.id === "workstudio") as never),
    ).toBe("disponible");
    expect(familyState(FAMILY.find((e) => e.id === "vps") as never)).toBe(
      "bientot",
    );
    // chaque fiche citée existe au registre : aucune carte ne mène à une page absente
    for (const entry of FAMILY)
      if (entry.app) expect(APPS.some((a) => a.slug === entry.app)).toBe(true);
  });

  it("l'état écrit sur la carte vient de la langue de la page", () => {
    expect(renderToStaticMarkup(<ProductFamily lang="fr" />)).toContain(
      ">Disponible<",
    );
    expect(renderToStaticMarkup(<ProductFamily lang="en" />)).toContain(
      ">Available<",
    );
  });
});
