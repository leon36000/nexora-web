import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CODE_70B,
  EMBED_SMALL,
  FIXTURES,
  MOE_PREVIEW,
} from "@/lib/models/fixtures";
import { parseQuery } from "@/lib/models/query";
import type { PublicCatalog } from "@/server/gateway/read";
import { CatalogView } from "./catalog-view";

const catalog: PublicCatalog = {
  models: FIXTURES,
  publishedAt: "2026-10-27T04:02:37.786Z",
  version: "cat_x",
  available: true,
};
const render = (
  raw: Record<string, string | string[]> = {},
  lang: "fr" | "en" = "fr",
  models = FIXTURES,
) =>
  renderToStaticMarkup(
    <CatalogView
      lang={lang}
      catalog={{ ...catalog, models }}
      query={parseQuery(raw)}
    />,
  );

describe("liste des modèles : /modeles", () => {
  it("affiche le compteur, les cartes et les badges d'aperçu et de licence", () => {
    const html = render();
    expect(html).toContain("7 modèles sur 7");
    for (const m of FIXTURES) expect(html).toContain(`/modeles/${m.id}`);
    expect(html).toContain("Aperçu");
    expect(html).toContain("Poids ouverts");
    expect(html).toContain("Poids non publiés");
    expect(html).toContain("Éditeur A");
    expect(html).toContain("par million de jetons");
    expect(html).toContain("avant taxes");
  });

  it("filtre par l'adresse : compteur, pastille retirable et raccourci actif", () => {
    const html = render({ etiquette: "code" });
    expect(html).toContain("2 modèles sur 7");
    expect(html).toContain(CODE_70B.id);
    expect(html).not.toContain(EMBED_SMALL.id);
    // la pastille se retire par un lien vers la liste sans le filtre
    expect(html).toMatch(
      /<a aria-label="Retirer le filtre : Code"[^>]*href="\/modeles">/,
    );
    expect(html).toMatch(/<a aria-current="true"[^>]*>Code/);
    // le formulaire garde l'état : case cochée
    expect(html).toMatch(/name="etiquette" checked="" value="code"/);
  });

  it("n'expose que des liens et un formulaire GET : fonctionne sans JavaScript", () => {
    const html = render();
    expect(html).toContain('method="get"');
    expect(html).toContain("<search");
    expect(html).toContain('name="q"');
    expect(html).toContain('name="tri"');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onClick");
  });

  it("propose seulement les options qui existent au catalogue", () => {
    const html = render();
    expect(html).toContain('value="editeur-a"');
    expect(html).not.toContain('value="video"');
    // un seul lieu d'hébergement : pas de filtre d'hébergement
    expect(html).not.toContain('name="hebergement"');
  });

  it("état « aucun résultat » utile : filtres retirables et réinitialisation", () => {
    const html = render({ q: "introuvable", etiquette: "code" });
    expect(html).toContain("0 modèle sur 7");
    expect(html).toContain("Aucun modèle ne correspond");
    expect(html).toContain("Voir tous les modèles");
    expect(html).toMatch(
      /aria-label="Retirer le filtre : Recherche : introuvable"/,
    );
  });

  it("vue tableau : en-têtes triables, aria-sort et une ligne par modèle", () => {
    const html = render({ vue: "tableau", tri: "prix-entree" });
    expect(html).toContain("<table");
    expect(html).toContain('aria-sort="ascending"');
    expect(html).toMatch(
      /href="\/modeles\?tri=prix-entree-desc&amp;vue=tableau"/,
    );
    expect(html.match(/<tr /g)?.length).toBe(FIXTURES.length);
    expect(html).not.toContain("<article");
  });

  it("sélection à comparer : bouton par carte, barre de comparaison dès deux modèles, maximum de quatre", () => {
    const one = render({ m: CODE_70B.id });
    expect(one).toContain("Choisissez au moins deux modèles");
    expect(one).not.toContain("/modeles/comparer");
    expect(one).toContain("Retirer Exemple Code 70B de la comparaison");
    const two = render({ m: [CODE_70B.id, MOE_PREVIEW.id] });
    expect(two).toContain("2 modèles sélectionnés");
    expect(two).toContain(
      `href="/modeles/comparer?m=${encodeURIComponent(CODE_70B.id)}&amp;m=${encodeURIComponent(MOE_PREVIEW.id)}"`,
    );
    // ajouter un modèle conserve les filtres et ramène à la carte
    const added = render({ etiquette: "code", m: CODE_70B.id });
    expect(added).toMatch(
      /href="\/modeles\?etiquette=code&amp;m=nexora%2Fexemple-code-70b&amp;m=nexora%2Fexemple-moe#m-nexora-exemple-moe"/,
    );
    const four = render({
      m: FIXTURES.slice(0, 4).map((m) => m.id),
    });
    expect(four).toContain("Comparaison pleine");
  });

  it("anglais : libellés de la langue, adresses préfixées", () => {
    const html = render({ etiquette: "code" }, "en");
    expect(html).toContain("2 models of 7");
    expect(html).toContain("/en/modeles/nexora/exemple-code-70b");
    expect(html).toContain("Remove filter: Code");
    expect(html).not.toContain("modèle");
  });

  it("catalogue vide : message d'attente, sans filtres", () => {
    const html = render({}, "fr", []);
    expect(html).toContain("en cours de préparation");
    expect(html).not.toContain("<form");
  });
});

describe("bandeau « catalogue en aperçu » de /modeles", () => {
  const previews = FIXTURES.filter((m) => m.availability === "preview");
  const live = FIXTURES.filter((m) => m.availability !== "preview");

  it("sans aucun modèle disponible : bandeau sobre avec « Voir les tarifs » et « Me prévenir à l'ouverture »", () => {
    expect(previews.length).toBeGreaterThan(0);
    const html = render({}, "fr", previews);
    expect(html).toContain(
      "Catalogue en aperçu : fiches et prix de développement publics ; l’appel par API n’est pas encore ouvert.",
    );
    expect(html).toMatch(/<a [^>]*href="\/tarifs"[^>]*>[^<]*Voir les tarifs/);
    expect(html).toMatch(
      /<a [^>]*href="\/contact\?sujet=ouverture-plateforme"[^>]*>[^<]*Me prévenir à l’ouverture/,
    );
    // le bandeau est avant les raccourcis et les filtres
    expect(html.indexOf("Catalogue en aperçu")).toBeLessThan(
      html.indexOf("<search"),
    );
    // jamais de lien vers une liste vide
    expect(html).not.toContain("disponibilite=disponible");
    expect(html).not.toContain("Voir les modèles déjà disponibles");
  });

  it("en-CA : même bandeau, liens localisés", () => {
    const html = render({}, "en", previews);
    expect(html).toContain(
      "Preview catalogue: model sheets and development prices are public; API calls are not open yet.",
    );
    expect(html).toMatch(/<a [^>]*href="\/en\/pricing"[^>]*>[^<]*View pricing/);
    expect(html).toMatch(
      /<a [^>]*href="\/en\/contact\?sujet=ouverture-plateforme"[^>]*>[^<]*Notify me when it opens/,
    );
  });

  it("dès qu'un modèle est disponible, le bandeau disparaît", () => {
    expect(live.length).toBeGreaterThan(0);
    for (const lang of ["fr", "en"] as const) {
      const html = render({}, lang, FIXTURES);
      expect(html, lang).not.toContain("ouverture-plateforme");
      expect(html, lang).not.toMatch(/Catalogue en aperçu|Preview catalogue/);
    }
  });

  it("le filtre « Disponibilité » reste proposé même sans modèle disponible", () => {
    expect(render({}, "fr", previews)).toContain('name="disponibilite"');
  });
});
