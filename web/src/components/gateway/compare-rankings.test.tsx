import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CODE_70B,
  FIXTURES,
  MOE_PREVIEW,
  NO_SHEET,
  VISION_8B_PREVIEW,
} from "@/lib/models/fixtures";
import { ComparePage } from "./compare-view";
import { RankingsPage } from "./rankings-view";

const flat = (s: string) => s.replace(/[  ]/g, " ");
const compare = (ids: string[], lang: "fr" | "en" = "fr") =>
  flat(
    renderToStaticMarkup(
      <ComparePage lang={lang} catalog={FIXTURES} ids={ids} />,
    ),
  );
const rankings = (models = FIXTURES, lang: "fr" | "en" = "fr") =>
  flat(renderToStaticMarkup(<RankingsPage lang={lang} models={models} />));

describe("comparateur /modeles/comparer", () => {
  it("tableau côte à côte : prix, spécifications, benchmarks communs avec éditeur et source", () => {
    const html = compare([CODE_70B.id, MOE_PREVIEW.id]);
    expect(html).toContain("<table");
    expect(html).toContain("Exemple Code 70B");
    expect(html).toContain("Exemple MoE 400B");
    expect(html).toContain("Prix d’entrée");
    expect(html).toContain("0,30 $");
    expect(html).toContain("0,60 $");
    expect(html).toContain("131 072 jetons");
    expect(html).toContain("262 144 jetons");
    expect(html).toContain("400 Md au total · 32 Md actifs");
    expect(html).toContain("Benchmarks communs");
    expect(html).toContain("SWE-test");
    expect(html).toContain("Publié par Éditeur A");
    expect(html).toContain('href="https://example.org/mesures/swe-a"');
    expect(html).toContain("ne sont pas strictement comparables");
  });

  it("ne désigne un meilleur résultat que si l'éditeur et l'unité sont communs", () => {
    const same = compare([CODE_70B.id, MOE_PREVIEW.id]);
    // SWE-test (éditeur A) et Arène-test (tiers T, même unité) : meilleur résultat ; GPQA-test : deux éditeurs -> aucun
    expect(same.match(/>meilleur résultat<\/span>/g)).toHaveLength(2);
    const mixed = compare([CODE_70B.id, VISION_8B_PREVIEW.id]);
    expect(mixed).not.toContain("meilleur résultat</span>");
  });

  it("modèles sans épreuve commune : le dit, sans rien inventer", () => {
    const html = compare([VISION_8B_PREVIEW.id, NO_SHEET.id]);
    expect(html).toContain("aucune épreuve en commun");
    expect(html).not.toContain("Benchmarks communs");
  });

  it("moins de deux modèles : invite à choisir, ignore les identifiants inconnus", () => {
    const none = compare([]);
    expect(none).toContain("Choisissez au moins deux modèles");
    expect(none).not.toContain("<table");
    const one = compare([CODE_70B.id, "nexora/inconnu"]);
    expect(one).toContain("Choisissez au moins deux modèles");
    expect(one).toContain("a été ignoré");
    expect(one).toContain(
      `href="/modeles?m=${encodeURIComponent(CODE_70B.id)}"`,
    );
  });

  it("retirer un modèle recalcule l'adresse ; avec deux modèles, pas de bouton retirer", () => {
    const three = compare([CODE_70B.id, MOE_PREVIEW.id, VISION_8B_PREVIEW.id]);
    expect(three).toContain(
      `href="/modeles/comparer?m=${encodeURIComponent(MOE_PREVIEW.id)}&amp;m=${encodeURIComponent(VISION_8B_PREVIEW.id)}"`,
    );
    expect(compare([CODE_70B.id, MOE_PREVIEW.id])).not.toContain(
      "Retirer Exemple",
    );
  });

  it("anglais", () => {
    const html = compare([CODE_70B.id, MOE_PREVIEW.id], "en");
    expect(html).toContain("Shared benchmarks");
    expect(html).toContain("/en/modeles/nexora/exemple-code-70b");
    expect(html).not.toContain("Prix");
  });
});

describe("classements /modeles/benchmarks", () => {
  it("une table par épreuve publiée pour au moins trois modèles, triée, avec éditeur et source", () => {
    const html = rankings();
    expect(html.match(/<table/g)).toHaveLength(1);
    expect(html).toContain('id="swe-test"');
    expect(html).not.toContain("GPQA-test");
    const order = FIXTURES.length;
    expect(order).toBeGreaterThan(0);
    const names = [
      ...html.matchAll(/<th scope="row"[^>]*><a [^>]*>([^<]+)<\/a>/g),
    ].map((m) => m[1]);
    expect(names).toEqual([
      "Exemple Raisonnement XL",
      "Exemple Code 70B",
      "Exemple MoE 400B",
      "Exemple Contexte Long",
      "Exemple Vision 8B",
    ]);
    expect(html).toContain("61,5 %");
    expect(html).toContain('href="https://example.org/mesures/swe-d"');
    expect(html).toContain("Plusieurs éditeurs de mesures");
    expect(html).toContain("ne sont pas strictement comparables");
  });

  it("ne montre aucune donnée d'usage inventée", () => {
    const html = rankings();
    expect(html).not.toMatch(/populaire|le plus utilisé|most popular/i);
  });

  it("sans épreuve assez fournie : message honnête et retour au catalogue", () => {
    const html = rankings([CODE_70B, MOE_PREVIEW]);
    expect(html).not.toContain("<table");
    expect(html).toContain("Aucune épreuve n’est encore publiée");
    expect(html).toContain('href="/modeles"');
  });

  it("anglais, avec fil d'Ariane structuré", () => {
    const html = rankings(FIXTURES, "en");
    expect(html).toContain("Rankings by benchmark");
    expect(html).toContain("Measurement published by");
    expect(html).toContain("BreadcrumbList");
  });
});
