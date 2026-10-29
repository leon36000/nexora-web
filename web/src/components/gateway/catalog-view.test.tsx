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
