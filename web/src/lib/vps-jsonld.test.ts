import { describe, expect, it } from "vitest";
import { app, plan } from "@/components/vps/test-fixtures";
import { jsonLdString } from "./jsonld";
import {
  buildBreadcrumbJsonLd,
  buildPlanProductsJsonLd,
  buildSoftwareApplicationJsonLd,
  type PlanJsonLdLabels,
} from "./vps-jsonld";

const labels: PlanJsonLdLabels = {
  term: { month: "Mensuel", year: "Annuel" },
  specs: (p) => [{ name: "vCPU", value: String(p.vcpu) }],
  description: (p) => p.descriptionFr,
};
const SITE = "https://nexora.example";

type Graph = { "@graph": Record<string, unknown>[] };
const products = (
  plans: Parameters<typeof buildPlanProductsJsonLd>[0]["plans"],
) =>
  buildPlanProductsJsonLd({
    siteUrl: SITE,
    pagePath: "/vps",
    plans,
    labels,
  }) as Graph | null;

describe("JSON-LD : fil d'Ariane", () => {
  it("positions à partir de 1 et URL absolues", () => {
    const ld = buildBreadcrumbJsonLd(SITE, [
      { name: "Accueil", path: "/" },
      { name: "VPS", path: "/vps" },
    ]);
    expect(ld["@type"]).toBe("BreadcrumbList");
    expect(ld.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "Accueil",
        item: "https://nexora.example/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "VPS",
        item: "https://nexora.example/vps",
      },
    ]);
  });
});

describe("JSON-LD : Product/Offer des plans", () => {
  it("une offre par durée tarifée, au prix affiché, en CAD avant taxes", () => {
    const graph = products([
      plan({
        code: "p1",
        priceMonthlyCents: 1500,
        priceYearlyCents: 15000,
        descriptionFr: "Pour démarrer",
      }),
    ]);
    const [product] = graph?.["@graph"] ?? [];
    expect(product).toMatchObject({
      "@type": "Product",
      name: "Plan 1",
      description: "Pour démarrer",
      url: `${SITE}/vps#plan-p1`,
    });
    const offers = product?.offers as Record<string, unknown>[];
    expect(offers.map((o) => [o.name, o.price, o.priceCurrency])).toEqual([
      ["Mensuel", "15.00", "CAD"],
      ["Annuel", "150.00", "CAD"],
    ]);
    expect(offers[0]?.priceSpecification).toMatchObject({
      valueAddedTaxIncluded: false,
      unitCode: "MON",
    });
    expect(offers[1]?.priceSpecification).toMatchObject({ unitCode: "ANN" });
  });

  it("jamais d'offre pour un plan de développement", () => {
    expect(products([plan({ isDevSample: true })])).toBeNull();
    const graph = products([
      plan({ code: "reel" }),
      plan({ code: "dev", isDevSample: true }),
    ]);
    expect(graph?.["@graph"].map((p) => p.name)).toEqual(["Plan 1"]);
    expect(JSON.stringify(graph)).not.toContain("plan-dev");
  });

  it("jamais de Product sans prix, ni d'offre pour une durée non offerte", () => {
    expect(
      products([plan({ priceMonthlyCents: null, priceYearlyCents: null })]),
    ).toBeNull();
    const graph = products([plan({ priceYearlyCents: null })]);
    const offers = graph?.["@graph"][0]?.offers as unknown[];
    expect(offers).toHaveLength(1);
  });

  it("aucun plan -> aucune donnée structurée", () => {
    expect(products([])).toBeNull();
  });

  it("n'inclut pas de description vide", () => {
    const graph = products([plan({ descriptionFr: "  " })]);
    expect(graph?.["@graph"][0]).not.toHaveProperty("description");
  });

  it("ne produit aucun '<' brut qui pourrait fermer la balise script", () => {
    const graph = products([
      plan({ name: "</script><b>", descriptionFr: "</script>" }),
    ]);
    expect(jsonLdString(graph)).not.toContain("<");
  });
});

describe("JSON-LD : SoftwareApplication", () => {
  const input = (a: ReturnType<typeof app>) => ({
    siteUrl: SITE,
    pagePath: "/vps/a1",
    app: a,
    description: "Accroche",
  });
  it("décrit une application installable avec sa version et sa licence", () => {
    expect(buildSoftwareApplicationJsonLd(input(app()))).toMatchObject({
      "@type": "SoftwareApplication",
      name: "App 1",
      softwareVersion: "1.2.3",
      license: "https://example.com/a1/LICENSE",
      url: `${SITE}/vps/a1`,
    });
  });
  it("rien pour un guide", () => {
    expect(
      buildSoftwareApplicationJsonLd(input(app({ kind: "guide" }))),
    ).toBeNull();
  });
  it("omet un lien de licence qui n'est pas http(s)", () => {
    const ld = buildSoftwareApplicationJsonLd(
      input(app({ licenseUrl: "javascript:alert(1)" })),
    );
    expect(ld).not.toHaveProperty("license");
  });
});
