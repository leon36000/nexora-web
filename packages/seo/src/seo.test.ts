import { describe, expect, it } from "vitest";
import {
  checkJsonLdConformity,
  checkSite,
  extractPageSeo,
  generateIndexNowKey,
  isValidIndexNowKey,
  normalizeUrl,
  numbersIn,
  parseSitemapXml,
} from "./index.ts";

const FR = "https://nexora.test/solutions";
const EN = "https://nexora.test/en/solutions";

type Opts = {
  title?: string;
  description?: string;
  canonical?: string;
  alternates?: [string, string][];
  robots?: string;
  h1?: string;
  body?: string;
  ld?: unknown[];
  lang?: string;
};

function html(o: Opts = {}): string {
  const alts = (o.alternates ?? [])
    .map(([l, h]) => `<link rel="alternate" hreflang="${l}" href="${h}">`)
    .join("");
  const ld = (o.ld ?? [])
    .map(
      (d) =>
        `<script type="application/ld+json">${typeof d === "string" ? d : JSON.stringify(d)}</script>`,
    )
    .join("");
  return `<!doctype html><html lang="${o.lang ?? "fr-CA"}"><head>
<title>${o.title ?? "Solutions d'IA souveraine au Québec"}</title>
<meta name="description" content="${o.description ?? "Des solutions d'intelligence artificielle hébergées au Québec pour les entreprises qui veulent garder la maîtrise de leurs données."}">
${o.canonical === undefined ? `<link rel="canonical" href="${FR}">` : o.canonical ? `<link rel="canonical" href="${o.canonical}">` : ""}
${o.robots ? `<meta name="robots" content="${o.robots}">` : ""}
${alts}${ld}</head><body><header>Nexora</header><main>${o.h1 === "" ? "" : `<h1>${o.h1 ?? "Nos solutions"}</h1>`}${o.body ?? "<p>Bonjour</p>"}</main></body></html>`;
}

const GOOD_ALTS: [string, string][] = [
  ["fr-CA", FR],
  ["en-CA", EN],
  ["x-default", FR],
];

const pair = (frOpts: Opts = {}, enOpts: Opts = {}) => [
  extractPageSeo(html({ alternates: GOOD_ALTS, ...frOpts }), FR, {
    status: 200,
  }),
  extractPageSeo(
    html({
      lang: "en-CA",
      title: "Sovereign AI solutions built in Quebec for business",
      description:
        "Artificial intelligence solutions hosted in Quebec for companies that want to keep control of their data and their costs.",
      canonical: EN,
      alternates: GOOD_ALTS,
      ...enOpts,
    }),
    EN,
    { status: 200 },
  ),
];

const rules = (f: { rule: string }[]) => f.map((x) => x.rule);

describe("extractPageSeo", () => {
  it("extrait titre, description, canonical absolu, hreflang, h1, robots, JSON-LD et texte visible", () => {
    const p = extractPageSeo(
      html({
        canonical: "/solutions",
        alternates: GOOD_ALTS,
        robots: "NOINDEX, Follow",
        ld: [{ "@type": "Organization", name: "Nexora" }, "{pas du json"],
        body: "<p>Un</p><p>Deux</p><script>var x = 'caché'</script><style>.a{}</style>",
      }),
      FR,
      { status: 200, xRobotsTag: "noarchive" },
    );
    expect(p.title).toBe("Solutions d'IA souveraine au Québec");
    expect(p.canonical).toBe(FR);
    expect(p.alternates).toHaveLength(3);
    expect(p.h1s).toEqual(["Nos solutions"]);
    expect(p.lang).toBe("fr-CA");
    expect(p.robots).toBe("noindex, follow, noarchive");
    expect(p.noindex).toBe(true);
    expect(p.jsonLd).toHaveLength(1);
    expect(p.jsonLdErrors).toHaveLength(1);
    expect(p.visibleText).toContain("Un Deux");
    expect(p.visibleText).not.toContain("caché");
    expect(p.visibleText).not.toContain("Organization");
  });
});

describe("checkSite", () => {
  it("accepte deux pages cohérentes (fr/en)", () => {
    const f = checkSite(pair(), { sitemapUrls: [FR, EN] });
    expect(f.filter((x) => x.severity !== "info")).toEqual([]);
  });

  it("repère un titre en double et une description en double", () => {
    const [fr, en] = pair(
      {},
      {
        title: "Solutions d'IA souveraine au Québec",
        description:
          "Des solutions d'intelligence artificielle hébergées au Québec pour les entreprises qui veulent garder la maîtrise de leurs données.",
      },
    );
    const r = rules(checkSite([fr as never, en as never]));
    expect(r).toContain("title.duplicate");
    expect(r).toContain("description.duplicate");
  });

  it("signale les longueurs hors bornes et l'absence de titre", () => {
    const [fr, en] = pair({ title: "Court" }, { description: "x".repeat(200) });
    const r = rules(checkSite([fr as never, en as never]));
    expect(r).toContain("title.short");
    expect(r).toContain("description.long");
    const [noTitle] = [
      extractPageSeo("<html><body><h1>a</h1></body></html>", FR),
    ];
    expect(rules(checkSite([noTitle as never]))).toEqual(
      expect.arrayContaining([
        "title.missing",
        "description.missing",
        "canonical.missing",
      ]),
    );
  });

  it("exige un canonical absolu", () => {
    const rel = extractPageSeo(html({ canonical: "/solutions" }), FR);
    // extractPageSeo absolutise : on simule un canonical relatif resté tel quel
    const f = checkSite([{ ...rel, canonical: "/solutions" }]);
    expect(rules(f)).toContain("canonical.relative");
  });

  it("détecte un hreflang non réciproque", () => {
    const [fr, en] = pair(
      {},
      {
        alternates: [
          ["en-CA", EN],
          ["x-default", EN],
        ],
      },
    );
    const f = checkSite([fr as never, en as never]);
    const bad = f.find((x) => x.rule === "hreflang.not-reciprocal");
    expect(bad?.url).toBe(FR);
  });

  it("exige x-default et l'auto-référence", () => {
    const [fr, en] = pair(
      {
        alternates: [
          ["fr-CA", FR],
          ["en-CA", EN],
        ],
      },
      { alternates: [["fr-CA", FR]] },
    );
    const r = rules(checkSite([fr as never, en as never]));
    expect(r).toContain("hreflang.x-default-missing");
    expect(r).toContain("hreflang.self-missing");
  });

  it("refuse une page noindex dans le sitemap et signale une page indexable absente", () => {
    const [fr, en] = pair({ robots: "noindex" });
    const r = rules(
      checkSite([fr as never, en as never], { sitemapUrls: [FR] }),
    );
    expect(r).toContain("sitemap.noindex-listed");
    expect(r).toContain("sitemap.indexable-missing");
  });

  it("exige exactement un h1 et un JSON-LD lisible", () => {
    const [fr] = pair({ h1: "", ld: ["{oups"] });
    const r = rules(checkSite([fr as never]));
    expect(r).toContain("h1.count");
    expect(r).toContain("jsonld.parse");
  });

  it("signale un type JSON-LD inconnu", () => {
    const [fr] = pair({ ld: [{ "@type": "Casserole", name: "x" }] });
    expect(rules(checkSite([fr as never]))).toContain("jsonld.unknown-type");
  });
});

describe("checkJsonLdConformity", () => {
  const faq = (q: string, a: string) => ({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      },
    ],
  });

  it("accepte une FAQPage dont les questions et réponses sont affichées", () => {
    const text =
      "Où sont mes données ? Elles restent au Québec, chiffrées au repos.";
    expect(
      checkJsonLdConformity(
        [
          faq(
            "Où sont mes données ?",
            "Elles restent au Québec, chiffrées au repos.",
          ),
        ],
        text,
      ),
    ).toEqual([]);
  });

  it("refuse une FAQPage qui ment (question non affichée)", () => {
    const f = checkJsonLdConformity(
      [faq("Offrez-vous un essai gratuit à vie ?", "Oui, toujours.")],
      "Où sont mes données ? Au Québec.",
    );
    expect(rules(f)).toEqual(
      expect.arrayContaining([
        "jsonld.faq-question-hidden",
        "jsonld.faq-answer-hidden",
      ]),
    );
  });

  it("tolère casse, espaces, entités et apostrophes typographiques", () => {
    expect(
      checkJsonLdConformity(
        [
          {
            "@type": "Service",
            name: "OPSYS-AI",
            description: "L'IA  de vos  équipes",
          },
        ],
        "opsys-ai — L’IA de vos équipes",
      ),
    ).toEqual([]);
  });

  it("refuse un nom ou une description absents du texte", () => {
    const f = checkJsonLdConformity(
      [{ "@type": "Service", name: "Super offre", description: "Inventée" }],
      "Rien de tout cela",
    );
    expect(rules(f)).toEqual(["jsonld.not-visible", "jsonld.not-visible"]);
  });

  it("vérifie les prix : formats fr et en, prix absent = erreur", () => {
    const product = (price: string) => ({
      "@type": "Product",
      name: "Modèle X",
      offers: { "@type": "Offer", price, priceCurrency: "CAD" },
    });
    expect(
      checkJsonLdConformity([product("0.42")], "Modèle X 0,42 $ par million"),
    ).toEqual([]);
    expect(
      checkJsonLdConformity(
        [product("1234.5")],
        "Modèle X $1,234.50 per million",
      ),
    ).toEqual([]);
    expect(
      rules(checkJsonLdConformity([product("0.99")], "Modèle X 0,42 $")),
    ).toEqual(["jsonld.price-not-visible"]);
    expect(
      rules(
        checkJsonLdConformity(
          [
            {
              "@type": "Product",
              name: "Modèle X",
              offers: { "@type": "Offer" },
            },
          ],
          "Modèle X",
        ),
      ),
    ).toEqual(["jsonld.offer-without-price"]);
  });

  it("vérifie la forme d'un fil d'Ariane sans exiger sa visibilité", () => {
    const ok = {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Accueil",
          item: "https://a.test/",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Solutions",
          item: "https://a.test/s",
        },
      ],
    };
    expect(checkJsonLdConformity([ok], "autre texte")).toEqual([]);
    const bad = {
      ...ok,
      itemListElement: [{ position: 2, name: "x", item: "/s" }],
    };
    expect(rules(checkJsonLdConformity([bad], ""))).toEqual([
      "jsonld.breadcrumb-shape",
    ]);
  });

  it("aplatit @graph et tableaux", () => {
    const f = checkJsonLdConformity(
      [{ "@graph": [{ "@type": "Organization", name: "Fantôme" }] }],
      "Nexora",
    );
    expect(rules(f)).toEqual(["jsonld.not-visible"]);
  });
});

describe("parseSitemapXml", () => {
  it("lit loc, lastmod et alternates", () => {
    const xml = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
<url><loc>${FR}</loc><lastmod>2026-10-27T01:00:00.000Z</lastmod>
<xhtml:link rel="alternate" hreflang="fr-CA" href="${FR}"/><xhtml:link rel="alternate" hreflang="en-CA" href="${EN}"/></url>
<url><loc>https://nexora.test/contact</loc></url></urlset>`;
    const e = parseSitemapXml(xml);
    expect(e).toHaveLength(2);
    expect(e[0]?.lastmod).toBe("2026-10-27T01:00:00.000Z");
    expect(e[0]?.alternates.map((a) => a.hreflang)).toEqual(["fr-CA", "en-CA"]);
    expect(e[1]?.lastmod).toBeUndefined();
    expect(e[1]?.alternates).toEqual([]);
  });
});

describe("utilitaires", () => {
  it("clé IndexNow : 32 hex, valide, aléatoire", () => {
    const a = generateIndexNowKey();
    expect(isValidIndexNowKey(a)).toBe(true);
    expect(a).not.toBe(generateIndexNowKey());
    expect(isValidIndexNowKey("../etc/passwd")).toBe(false);
    expect(isValidIndexNowKey("ABCDEF0123456789ABCDEF0123456789")).toBe(false);
  });
  it("normalise les URL et lit les nombres", () => {
    expect(normalizeUrl("https://A.test/x/#f")).toBe("https://a.test/x");
    expect(normalizeUrl("https://a.test/")).toBe("https://a.test");
    expect(numbersIn("1 234,50 $")).toContain(1234.5);
    expect(numbersIn("$0.42")).toContain(0.42);
  });
});
