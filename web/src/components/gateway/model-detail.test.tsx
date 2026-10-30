import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CODE_70B,
  EMBED_SMALL,
  FIXTURES,
  LONG_CONTEXT,
  MOE_PREVIEW,
  NO_SHEET,
} from "@/lib/models/fixtures";
import { ModelDetail, modelMetaDescription } from "./model-detail";

/** Les formats fr-CA séparent les milliers et le « $ » par des espaces insécables. */
const flat = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");

const render = (model: (typeof FIXTURES)[number], lang: "fr" | "en" = "fr") =>
  flat(
    renderToStaticMarkup(
      <ModelDetail model={model} catalog={FIXTURES} lang={lang} />,
    ),
  );

const jsonLd = (html: string) =>
  [
    ...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g),
  ].map((m) => JSON.parse((m[1] as string).replace(/\\u003c/g, "<")));

describe("fiche d'un modèle disponible", () => {
  const html = render(CODE_70B);

  it("en-tête : nom, identifiant exact, éditeur, famille, étiquettes, badges, puces de prix et de contexte", () => {
    expect(html).toContain("<h1");
    expect(html).toContain("Exemple Code 70B");
    expect(html).toContain("nexora/exemple-code-70b");
    expect(html).toContain("Par Éditeur A");
    expect(html).toContain("Famille Alpha");
    expect(html).toContain("Poids ouverts");
    expect(html).toContain("Contexte maximal");
    expect(html).toContain("131 072");
    expect(html).toContain("jetons");
    expect(html).toMatch(/Entrée<\/dt><dd[^>]*>0,30 \$/);
    expect(html).toMatch(/Sortie<\/dt><dd[^>]*>0,90 \$/);
    expect(html).not.toContain("Modèle en aperçu");
  });

  it("sections ancrées : aperçu, tarifs, benchmarks, similaires, API", () => {
    for (const id of ["apercu", "tarifs", "benchmarks", "similaires", "api"]) {
      expect(html).toContain(`href="#${id}"`);
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("spécifications : paramètres, quantification, modalités, dates, licence avec lien, hébergeur et politique", () => {
    expect(html).toContain("70 Md au total");
    expect(html).toContain("fp8");
    expect(html).toContain("Texte");
    expect(html).toContain("10 septembre 2026");
    expect(html).toContain("mars 2026");
    expect(html).toContain("Licence Libre Test");
    expect(html).toContain('href="https://example.org/licence"');
    expect(html).toContain("Hébergeur Test");
    expect(html).toContain("Politique de données de l’hébergeur (test).");
    expect(html).toContain("16 384 jetons");
  });

  it("tarifs en CAD avant taxes, entrée en cache comprise", () => {
    expect(html).toContain("Entrée en cache");
    expect(html).toContain("0,03 $");
    expect(html).toContain("avant taxes");
  });

  it("benchmarks groupés par catégorie, éditeur de la mesure, source précise et avertissement", () => {
    expect(html).toContain(">Code</h3>");
    expect(html).toContain(">Raisonnement</h3>");
    expect(html).toContain(">Autres mesures</h3>");
    expect(html).toContain("SWE-test");
    expect(html).toContain("61,5 %");
    expect(html).toContain("Publié par Éditeur A");
    expect(html).toContain("Publié par Tiers T");
    expect(html).toContain('href="https://example.org/mesures/swe-a"');
    expect(html).toContain("mesuré le 9 septembre 2026");
    expect(html).toContain("ne sont pas strictement comparables");
    // barre pour un pourcentage, pas pour un Elo
    expect(html.match(/style="width:61.5%"/g)).toHaveLength(1);
    expect(html).not.toContain("width:1250%");
    expect(html).toContain("Éditeur A, fiche");
    expect(html).toContain("lue le 2026-10-20");
  });

  it("modèles similaires et appel par l'API avec l'identifiant exact (cURL, Python, JavaScript)", () => {
    expect(html).toContain("Modèles similaires");
    expect(html).toContain("Exemple MoE 400B");
    expect(html).toContain(">curl<");
    expect(html).toContain("Python");
    expect(html).toContain("JavaScript");
    expect(html).toContain(
      "&quot;model&quot;: &quot;nexora/exemple-code-70b&quot;",
    );
    expect(html).not.toContain("Bientôt disponible");
    expect(html).toContain('href="/compte/inscription"');
    expect(html).toContain('href="/compte/facturation"');
  });

  it("données structurées : Product avec offres, marque affichée, fil d'Ariane, jamais d'avis ni de note", () => {
    const [product, crumbs] = jsonLd(html);
    expect(product["@type"]).toBe("Product");
    expect(product.sku).toBe("nexora/exemple-code-70b");
    expect(product.brand).toEqual({ "@type": "Brand", name: "Éditeur A" });
    expect(product.offers.map((o: { price: string }) => o.price)).toEqual([
      "0.3",
      "0.9",
      "0.03",
    ]);
    expect(product.offers[0].priceCurrency).toBe("CAD");
    expect(JSON.stringify(product)).not.toMatch(
      /aggregateRating|review|ratingValue/,
    );
    expect(crumbs["@type"]).toBe("BreadcrumbList");
    expect(crumbs.itemListElement).toHaveLength(3);
  });
});

describe("fiche d'un modèle en aperçu", () => {
  const html = render(MOE_PREVIEW);

  it("dit clairement « bientôt disponible » et n'offre aucun faux exemple d'appel", () => {
    expect(html).toContain("Bientôt disponible");
    expect(html).toContain("Modèle en aperçu");
    expect(html).not.toContain(">curl<");
    expect(html).not.toContain("Authorization");
    expect(html).not.toContain("nxk_");
    // l'identifiant reste affiché
    expect(html).toContain("nexora/exemple-moe");
  });

  it("« Me prévenir » mène au contact avec le sujet et le modèle", () => {
    expect(html).toContain(
      'href="/contact?sujet=modele-apercu&amp;modele=nexora%2Fexemple-moe"',
    );
    expect(render(MOE_PREVIEW, "en")).toContain(
      'href="/en/contact?sujet=modele-apercu&amp;modele=nexora%2Fexemple-moe"',
    );
  });

  it("paramètres actifs affichés, aucune offre structurée (rien à acheter encore)", () => {
    expect(html).toContain("400 Md au total · 32 Md actifs");
    const [product] = jsonLd(html);
    expect(product["@type"]).toBe("Product");
    expect(product.offers).toBeUndefined();
  });
});

describe("cas limites", () => {
  it("modèle sans fiche : ne devine rien, dit ce qui manque", () => {
    const html = render(NO_SHEET);
    expect(html).toContain("n’a pas encore fourni de description");
    expect(html).toContain("Aucune mesure chiffrée n’est publiée");
    expect(html).not.toContain("Modèles similaires");
    expect(html).not.toContain('href="#similaires"');
    expect(html).not.toContain("Par ");
    expect(html).not.toContain("Poids ouverts");
    expect(html).not.toContain("<table");
    const [product] = jsonLd(html);
    expect(product.brand).toBeUndefined();
  });

  it("embeddings : un seul prix, appel par /v1/embeddings", () => {
    const html = render(EMBED_SMALL);
    expect(html).toContain("/v1/embeddings");
    expect(html).not.toContain("Sortie 0");
    expect(html).toContain("Vecteurs (embeddings)");
    const [product] = jsonLd(html);
    expect(product.offers).toHaveLength(1);
  });

  it("plages horaires et écriture du cache en tableau, un prix de développement n'est jamais une offre", () => {
    const html = render(LONG_CONTEXT);
    expect(html).toContain("Plages horaires");
    expect(html).toContain("dim., sam.");
    expect(html).toContain("Écriture en cache");
    const dev = render({ ...CODE_70B, note: "prix de dev" });
    expect(dev).toContain("Prix de développement");
    expect(jsonLd(dev)[0].offers).toBeUndefined();
  });

  it("anglais : aucun mot français visible", () => {
    const html = render(MOE_PREVIEW, "en");
    expect(html).toContain("Coming soon");
    expect(html).toContain("Notify me when it opens");
    expect(html).toContain(
      "These figures are published by different publishers",
    );
    expect(html).not.toContain("Bientôt");
    expect(html).toContain("/en/modeles/benchmarks");
  });
});

describe("description pour les moteurs", () => {
  it("n'emploie que des faits de la fiche et reste utile en deux langues", () => {
    expect(flat(modelMetaDescription(CODE_70B, "fr"))).toBe(
      "Exemple Code 70B (Éditeur A) : 131 072 jetons de contexte, entrée à 0,30 $ et sortie à 0,90 $ par million de jetons (CAD). Spécifications, benchmarks sourcés et appel par API.",
    );
    expect(modelMetaDescription(EMBED_SMALL, "en")).toContain(
      "$0.02 per million tokens",
    );
    expect(modelMetaDescription(NO_SHEET, "fr")).not.toContain("Sans Fiche (");
  });
});
