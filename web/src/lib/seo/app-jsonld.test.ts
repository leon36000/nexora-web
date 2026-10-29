import { checkJsonLdConformity } from "@nexora/seo";
import { describe, expect, it } from "vitest";
import { APPS, getAppContent, getAppsDictionary } from "@/i18n/apps";
import { LANGS } from "@/i18n/config";
import { appBreadcrumb, appFaqJsonLd, appSoftwareJsonLd } from "./app-jsonld";

/** Texte visible d'une fiche tel que la page l'affiche : titre, accroche, listes, questions et réponses. */
function visibleText(lang: "fr" | "en", slug: string): string {
  const c = getAppContent(lang, slug);
  if (!c) return "";
  const t = getAppsDictionary(lang).list;
  return [
    t.label,
    c.name,
    c.hook,
    c.audience,
    c.accessText,
    c.answer,
    ...c.ready,
    ...c.coming,
    ...c.faq.flatMap((q) => [q.question, q.answer]),
  ].join(" ");
}

describe("SoftwareApplication d'une fiche Nexora Apps", () => {
  it("décrit ce que la page montre : nom, accroche, adresse localisée, catégorie, aucune offre ni note", () => {
    const c = getAppContent("fr", "webpilot");
    const out = appSoftwareJsonLd("fr", "webpilot");
    expect(out).toMatchObject({
      "@type": "SoftwareApplication",
      name: c?.name,
      description: c?.hook,
      applicationCategory: "DeveloperApplication",
    });
    expect(out?.url).toMatch(/\/apps\/webpilot$/);
    // un produit non livré n'a ni prix, ni note, ni système d'exploitation annoncés
    for (const key of ["offers", "aggregateRating", "operatingSystem"])
      expect(out).not.toHaveProperty(key);
  });

  it("rattache l'éditeur à l'Organization de l'entreprise (même @id que le reste du site)", () => {
    const out = appSoftwareJsonLd("fr", "rag") as unknown as {
      publisher?: { "@id"?: string; name?: string };
    };
    expect(out.publisher?.["@id"]).toMatch(/#organization$/);
    expect(out.publisher?.name).toBe("Nexora AI");
  });

  it("l'adresse anglaise porte le préfixe /en", () => {
    expect(appSoftwareJsonLd("en", "rag")?.url).toMatch(/\/en\/apps\/rag$/);
  });

  it("renvoie null pour un outil inconnu", () => {
    expect(appSoftwareJsonLd("fr", "inconnu")).toBeNull();
    expect(appSoftwareJsonLd("fr", "__proto__")).toBeNull();
  });
});

describe("FAQPage d'une fiche Nexora Apps", () => {
  it("reprend exactement les questions et les réponses affichées", () => {
    const c = getAppContent("en", "code");
    const out = appFaqJsonLd("en", "code") as {
      "@type": string;
      mainEntity: {
        name: string;
        acceptedAnswer: { "@type": string; text: string };
      }[];
    } | null;
    expect(out?.["@type"]).toBe("FAQPage");
    expect(out?.mainEntity.map((q) => [q.name, q.acceptedAnswer.text])).toEqual(
      c?.faq.map((q) => [q.question, q.answer]),
    );
  });

  it("renvoie null pour un outil inconnu", () => {
    expect(appFaqJsonLd("fr", "inconnu")).toBeNull();
  });
});

describe("conformité au visible de toutes les fiches", () => {
  it("noms, descriptions, questions et réponses figurent dans le texte de la page, dans les deux langues", () => {
    for (const app of APPS)
      for (const lang of LANGS) {
        const software = appSoftwareJsonLd(lang, app.slug);
        const faq = appFaqJsonLd(lang, app.slug);
        const visible = visibleText(lang, app.slug);
        expect(software, `${lang} ${app.slug}`).not.toBeNull();
        expect(faq, `${lang} ${app.slug}`).not.toBeNull();
        expect(
          checkJsonLdConformity([software, faq], visible),
          `${lang} ${app.slug}`,
        ).toEqual([]);
      }
  });
});

describe("fil d'Ariane d'une fiche", () => {
  it("Accueil > Nexora Apps > outil, avec des adresses absolues localisées", () => {
    const out = appBreadcrumb("en", [
      { name: "Nexora Apps", path: "/apps" },
      { name: "Nexora WebPilot", path: "/apps/webpilot" },
    ]) as { itemListElement: { name: string; item: string }[] } | null;
    expect(out?.itemListElement.map((i) => i.name)).toEqual([
      "Home",
      "Nexora Apps",
      "Nexora WebPilot",
    ]);
    expect(out?.itemListElement[2]?.item).toMatch(/\/en\/apps\/webpilot$/);
  });
});
