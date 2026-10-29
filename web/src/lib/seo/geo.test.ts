import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkJsonLdConformity } from "@nexora/seo";
import { describe, expect, it } from "vitest";
import type { Lang } from "@/i18n/config";
import { parseRichText } from "@/lib/rich-text";
import type { Block, PageModel } from "@/server/cms/model";
import type { SeoPage } from "@/server/cms/seo-pages";
import type { AppRoute } from "./app-routes";
import { buildCmsJsonLd } from "./cms-jsonld";
import {
  CANONICAL_FACTS,
  organizationProfile,
  parseSameAs,
  resolveFacts,
} from "./entity";
import {
  articleJsonLd,
  organizationJsonLd,
  organizationRef,
  productJsonLd,
  serviceJsonLd,
  softwareApplicationJsonLd,
  webPageJsonLd,
  websiteJsonLd,
} from "./jsonld";
import { buildLlmsTxt, sectionOf } from "./llms";
import { buildLlmsFullTxt } from "./llms-full";
import { pageToMarkdown, richToMarkdown } from "./page-markdown";
import { pageSchemaType, SECTION_CRUMBS } from "./page-schema";
import { validateSchemaOrg } from "./testing/schemaorg";

const SITE = "https://nexora.test";
const REPO = join(__dirname, "..", "..", "..", "..");
const CONTENT = join(REPO, "cms", "content");

// ---------------------------------------------------------------------------------------------------------------
// Données structurées : vocabulaire schema.org, cohérence d'entité
// ---------------------------------------------------------------------------------------------------------------
describe("validateSchemaOrg : le validateur lui-même", () => {
  it("accepte un nœud conforme et refuse propriété inventée, type inconnu, valeur d'un mauvais type", () => {
    expect(
      validateSchemaOrg({
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "N",
        url: SITE,
        logo: { "@type": "ImageObject", url: `${SITE}/l.png`, width: 512 },
      }),
    ).toEqual([]);
    expect(
      validateSchemaOrg({
        "@context": "https://schema.org",
        "@type": "Organization",
        inlanguage: "fr-CA",
      }).join("|"),
    ).toMatch(/inlanguage/);
    expect(
      validateSchemaOrg({
        "@context": "https://schema.org",
        "@type": "Nope",
      }).join("|"),
    ).toMatch(/Nope/);
    expect(
      validateSchemaOrg({
        "@context": "https://schema.org",
        "@type": "Organization",
        logo: { "@type": "BreadcrumbList" },
      }).join("|"),
    ).toMatch(/logo/);
    expect(
      validateSchemaOrg({ "@type": "Organization", name: "N" }).join("|"),
    ).toMatch(/@context/);
  });

  it("une référence réduite à @id est permise", () => {
    expect(
      validateSchemaOrg({
        "@context": "https://schema.org",
        "@type": "Service",
        name: "S",
        provider: { "@id": `${SITE}/#organization` },
      }),
    ).toEqual([]);
  });
});

describe("parseSameAs : profils publics de l'entreprise (jamais inventés)", () => {
  it("garde les adresses https valides, sans doublon, sans le site lui-même, séparées par virgule, espace ou saut de ligne", () => {
    const raw =
      "https://www.linkedin.com/company/x/, https://github.com/x\nhttps://github.com/x  https://nexora.test/a";
    expect(parseSameAs(raw, SITE)).toEqual([
      "https://www.linkedin.com/company/x",
      "https://github.com/x",
    ]);
  });

  it("refuse http, javascript:, adresses relatives, textes libres ; absent = liste vide", () => {
    expect(
      parseSameAs(
        "http://a.test, javascript:alert(1), /relatif, n'importe quoi, ftp://x.test",
        SITE,
      ),
    ).toEqual([]);
    expect(parseSameAs(undefined, SITE)).toEqual([]);
    expect(parseSameAs("", SITE)).toEqual([]);
  });

  it("plafonne le nombre de profils", () => {
    const many = Array.from({ length: 40 }, (_, i) => `https://r${i}.test/x`);
    expect(parseSameAs(many.join(","), SITE)).toHaveLength(12);
  });
});

describe("organizationProfile", () => {
  it("logo = icône 512 du site ; sameAs depuis SITE_SAME_AS ; région du Québec (CL-130)", () => {
    const p = organizationProfile(SITE, {
      SITE_SAME_AS: "https://github.com/x",
    });
    expect(p.logo).toEqual({
      url: `${SITE}/icon-512.png`,
      width: 512,
      height: 512,
    });
    expect(p.sameAs).toEqual(["https://github.com/x"]);
    expect(p.address).toEqual({ addressRegion: "QC", addressCountry: "CA" });
    expect(organizationProfile(SITE, {}).sameAs).toEqual([]);
  });

  it("le logo annoncé existe vraiment dans web/public", () => {
    const p = organizationProfile(SITE, {});
    const file = (p.logo?.url ?? "").replace(SITE, "");
    expect(existsSync(join(REPO, "web", "public", file))).toBe(true);
  });
});

describe("Organization enrichie", () => {
  const base = { name: "Nexora AI", url: SITE };

  it("sans profil : nom, url et @id seulement (compatibilité)", () => {
    expect(organizationJsonLd(base)).toEqual({
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${SITE}/#organization`,
      name: "Nexora AI",
      url: SITE,
    });
  });

  it("avec profil : logo ImageObject, sameAs, adresse du Québec ; description seulement si fournie", () => {
    const org = organizationJsonLd({
      ...base,
      description: "Entreprise du Québec.",
      profile: organizationProfile(SITE, {
        SITE_SAME_AS: "https://github.com/x",
      }),
    });
    expect(org).toMatchObject({
      logo: { "@type": "ImageObject", url: `${SITE}/icon-512.png` },
      sameAs: ["https://github.com/x"],
      address: {
        "@type": "PostalAddress",
        addressRegion: "QC",
        addressCountry: "CA",
      },
      description: "Entreprise du Québec.",
    });
    expect(validateSchemaOrg(org)).toEqual([]);
    expect(organizationJsonLd(base)).not.toHaveProperty("description");
  });

  it("organizationRef : même @id, même nom, même adresse partout", () => {
    expect(organizationRef(base)).toEqual({
      "@type": "Organization",
      "@id": `${SITE}/#organization`,
      name: "Nexora AI",
      url: SITE,
    });
  });
});

describe("cohérence d'entité : un seul nom, un seul @id, d'une donnée structurée à l'autre", () => {
  const ORG_ID = `${SITE}/#organization`;
  const svc = serviceJsonLd({
    name: "S",
    description: null,
    url: `${SITE}/s`,
    providerName: "Nexora AI",
    organizationUrl: SITE,
  });
  const art = articleJsonLd({
    headline: "A",
    description: null,
    url: `${SITE}/guides/a`,
    lang: "fr",
    publisherName: "Nexora AI",
    publisherUrl: SITE,
    datePublished: "2026-10-01T00:00:00.000Z",
    dateModified: "2026-10-02T00:00:00.000Z",
    image: `${SITE}/og/fr/guides/a`,
  });
  const app = softwareApplicationJsonLd({
    name: "W",
    description: null,
    url: `${SITE}/w`,
    category: "BusinessApplication",
    offers: [],
    publisher: { name: "Nexora AI", url: SITE },
  });

  it("Service, Article et SoftwareApplication pointent vers la même Organization", () => {
    expect(svc).toMatchObject({
      provider: { "@id": ORG_ID, name: "Nexora AI", url: SITE },
    });
    expect(art).toMatchObject({
      author: { "@id": ORG_ID, name: "Nexora AI" },
      publisher: { "@id": ORG_ID, name: "Nexora AI" },
      image: `${SITE}/og/fr/guides/a`,
    });
    expect(app).toMatchObject({ publisher: { "@id": ORG_ID } });
  });

  it("tous ces nœuds sont valides au regard du vocabulaire schema.org", () => {
    for (const node of [
      svc,
      art,
      app,
      organizationJsonLd({
        name: "Nexora AI",
        url: SITE,
        profile: organizationProfile(SITE, {
          SITE_SAME_AS: "https://github.com/x",
        }),
      }),
      websiteJsonLd({ name: "Nexora AI", url: SITE, lang: "fr" }),
      productJsonLd({
        name: "M",
        description: "d",
        url: `${SITE}/modeles/a/b`,
        sku: "a/b",
        brand: null,
        offers: [
          {
            name: "Entrée",
            price: "0.42",
            currency: "CAD",
            unitText: "par million de jetons",
          },
        ],
      }),
      webPageJsonLd({
        name: "P",
        description: "d",
        url: `${SITE}/p`,
        lang: "fr",
        siteUrl: SITE,
        dateModified: "2026-10-28T00:00:00.000Z",
        kind: "WebPage",
      }),
    ])
      expect(
        validateSchemaOrg(node),
        JSON.stringify(node).slice(0, 60),
      ).toEqual([]);
  });
});

const hero = (over: Record<string, unknown> = {}): Block =>
  ({
    type: "hero",
    key: "h",
    anchorId: null,
    variant: "sombre",
    perimeterGrid: false,
    media: null,
    eyebrow: null,
    headline: "Un titre de page.",
    subheadline: "Une description visible.",
    primary: null,
    secondary: null,
    ...over,
  }) as Block;

const faqBlock: Block = {
  type: "faq",
  key: "f",
  anchorId: null,
  tone: "clair",
  emitJsonLd: true,
  title: "Questions",
  items: [{ question: "Où sont mes données ?", answer: "Chez vous." }],
};

const pageModel = (over: Partial<PageModel> = {}): PageModel => ({
  id: "p1",
  lang: "fr-CA",
  slug: "workstudio",
  title: "WorkStudio",
  seoTitle: null,
  seoDescription: null,
  canonical: null,
  noindex: false,
  seoImageId: null,
  blocks: [hero({ headline: "WorkStudio" }), faqBlock],
  translations: [
    { code: "fr-CA", slug: "workstudio" },
    { code: "en-CA", slug: "workstudio" },
  ],
  ...over,
});

const visibleOf = (p: PageModel) =>
  `Nexora AI ${JSON.stringify(p.blocks.map((b) => (b.type === "hero" ? [b.eyebrow, b.headline, b.subheadline] : b.type === "faq" ? b.items.flatMap((i) => [i.question, i.answer]) : [])))}`;

const types = (out: unknown[]) =>
  out.map((x) => (x as { "@type": string })["@type"]);
const build = (p: PageModel, lang: Lang = "fr", extra = {}) =>
  buildCmsJsonLd({
    page: p,
    lang,
    siteName: "Nexora AI",
    siteUrl: SITE,
    dates: {
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-28T12:00:00.000Z",
    },
    ...extra,
  });

describe("JSON-LD d'une page CMS : WebPage, fil d'Ariane, entité", () => {
  it("l'accueil porte Organization (logo, sameAs, adresse) + WebSite + WebPage dont la description est celle du héros affiché", () => {
    const home = pageModel({
      slug: "",
      title: "Accueil",
      blocks: [
        hero({
          headline: "La pointe de l'IA.",
          subheadline: "Sous votre contrôle.",
        }),
      ],
    });
    const out = build(home, "fr", {
      profile: organizationProfile(SITE, {
        SITE_SAME_AS: "https://github.com/x",
      }),
    });
    expect(types(out)).toEqual(["Organization", "WebSite", "WebPage"]);
    expect(out[0]).toMatchObject({
      logo: { url: `${SITE}/icon-512.png` },
      sameAs: ["https://github.com/x"],
    });
    // l'Organization n'emprunte pas de description à la page : rien d'affiché ne la porte
    expect(out[0]).not.toHaveProperty("description");
    expect(out[2]).toMatchObject({
      "@type": "WebPage",
      description: "Sous votre contrôle.",
      isPartOf: { "@id": `${SITE}/#website` },
      dateModified: "2026-10-28T12:00:00.000Z",
      inLanguage: "fr-CA",
    });
    for (const n of out) expect(validateSchemaOrg(n)).toEqual([]);
    expect(checkJsonLdConformity(out, visibleOf(home))).toEqual([]);
  });

  it("sans profil explicite, le profil par défaut du site s'applique (logo présent, sameAs absent)", () => {
    const out = build(pageModel({ slug: "", blocks: [hero()] }));
    expect(out[0]).toMatchObject({ logo: { url: `${SITE}/icon-512.png` } });
    expect(out[0]).not.toHaveProperty("sameAs");
  });

  it("page produit : fil d'Ariane, WebPage, SoftwareApplication (éditeur = l'entreprise), FAQPage ; tout est conforme au visible et au vocabulaire", () => {
    const p = pageModel();
    const out = build(p);
    expect(types(out)).toEqual([
      "BreadcrumbList",
      "WebPage",
      "SoftwareApplication",
      "FAQPage",
    ]);
    expect(out[2]).toMatchObject({
      publisher: { "@id": `${SITE}/#organization` },
    });
    for (const n of out)
      expect(validateSchemaOrg(n), JSON.stringify(n).slice(0, 80)).toEqual([]);
    expect(checkJsonLdConformity(out, visibleOf(p))).toEqual([]);
  });

  it("le nom de la WebPage retombe sur le titre du héros quand le titre de page n'est pas affiché", () => {
    const out = build(
      pageModel({
        title: "Titre interne",
        slug: "faq",
        translations: [{ code: "fr-CA", slug: "faq" }],
      }),
    );
    expect(
      out.find((x) => (x as { "@type": string })["@type"] === "WebPage"),
    ).toMatchObject({
      name: "WorkStudio",
    });
  });

  it("pas de WebPage sans date ni nom exploitable : jamais de date inventée", () => {
    const out = buildCmsJsonLd({
      page: pageModel({
        slug: "faq",
        blocks: [hero({ headline: "", subheadline: null })],
        title: "",
      }),
      lang: "fr",
      siteName: "Nexora AI",
      siteUrl: SITE,
      dates: null,
    });
    expect(types(out)).not.toContain("WebPage");
    const withName = buildCmsJsonLd({
      page: pageModel({ slug: "faq" }),
      lang: "fr",
      siteName: "Nexora AI",
      siteUrl: SITE,
      dates: null,
    });
    const wp = withName.find(
      (x) => (x as { "@type": string })["@type"] === "WebPage",
    );
    expect(wp).toBeDefined();
    expect(wp).not.toHaveProperty("dateModified");
  });

  it("Article : image Open Graph et dates réelles ; pas de WebPage en double ; éditeur = l'entreprise", () => {
    const art = pageModel({
      slug: "guides/ia-pme-quebec",
      title: "L'IA pour une PME",
      blocks: [hero({ headline: "L'IA pour une PME", subheadline: null })],
      translations: [{ code: "fr-CA", slug: "guides/ia-pme-quebec" }],
    });
    const out = build(art);
    expect(types(out)).toEqual(["BreadcrumbList", "Article"]);
    expect(out[1]).toMatchObject({
      image: `${SITE}/og/fr/guides/ia-pme-quebec`,
      datePublished: "2026-10-01T00:00:00.000Z",
      dateModified: "2026-10-28T12:00:00.000Z",
      author: { "@id": `${SITE}/#organization` },
    });
    for (const n of out) expect(validateSchemaOrg(n)).toEqual([]);
  });

  it("fil d'Ariane des pages imbriquées : Accueil > section > page, avec le chemin de la langue", () => {
    const en = pageModel({
      lang: "en-CA",
      slug: "solutions/invoices",
      title: "Invoices",
      blocks: [hero({ headline: "Invoices", subheadline: null })],
      translations: [
        { code: "fr-CA", slug: "solutions/factures" },
        { code: "en-CA", slug: "solutions/invoices" },
      ],
    });
    const crumbs = build(en, "en")[0] as {
      itemListElement: { name: string; item: string; position: number }[];
    };
    expect(
      crumbs.itemListElement.map((c) => [c.position, c.name, c.item]),
    ).toEqual([
      [1, "Home", `${SITE}/en`],
      [2, "Solutions", `${SITE}/en/solutions`],
      [3, "Invoices", `${SITE}/en/solutions/invoices`],
    ]);
    const fr = pageModel({
      slug: "deploiement/sur-place",
      title: "Sur place",
      blocks: [hero({ headline: "Sur place", subheadline: null })],
      translations: [
        { code: "fr-CA", slug: "deploiement/sur-place" },
        { code: "en-CA", slug: "deployment/on-premises" },
      ],
    });
    const frCrumbs = build(fr, "fr")[0] as {
      itemListElement: { name: string }[];
    };
    expect(frCrumbs.itemListElement.map((c) => c.name)).toEqual([
      "Accueil",
      "Déploiement",
      "Sur place",
    ]);
  });

  it("une page imbriquée sous une section inconnue garde le fil d'Ariane à deux niveaux (aucune étape inventée)", () => {
    const out = build(
      pageModel({
        slug: "inconnue/page",
        translations: [{ code: "fr-CA", slug: "inconnue/page" }],
      }),
    );
    expect(
      (out[0] as { itemListElement: unknown[] }).itemListElement,
    ).toHaveLength(2);
  });
});

describe("registre des types de page", () => {
  it("services, solutions, déploiement, OPSYS-AI et la passerelle : Service ; WorkStudio : logiciel ; guides : article ; entreprise : à propos", () => {
    for (const slug of [
      "opsys-ai",
      "services",
      "services/installation-serveurs-ia",
      "solutions",
      "solutions/factures",
      "deploiement",
      "deploiement/sur-place",
      "deploiement/heberge-quebec",
      "passerelle-api-modeles",
    ])
      expect(pageSchemaType(slug), slug).toBe("service");
    expect(pageSchemaType("workstudio")).toBe("software");
    expect(pageSchemaType("guides/ia-pme-quebec")).toBe("article");
    expect(pageSchemaType("blog/x")).toBe("article");
    // gabarits de flux de travaux : la page de synthèse et chaque fiche sont des articles
    expect(pageSchemaType("gabarits-flux-de-travaux")).toBe("article");
    expect(pageSchemaType("gabarits-flux-de-travaux/devis")).toBe("article");
    expect(pageSchemaType("entreprise")).toBe("about");
    expect(pageSchemaType("contact")).toBeNull();
    expect(pageSchemaType("faq")).toBeNull();
  });
});

describe("fiches de gabarits : fil d'Ariane et llms.txt", () => {
  it("la fiche d'un gabarit a l'étape de section « Gabarits de flux de travaux » (page de synthèse qui existe)", () => {
    expect(SECTION_CRUMBS["gabarits-flux-de-travaux"]).toEqual({
      fr: "Gabarits de flux de travaux",
      en: "Workflow templates",
    });
  });

  it("llms.txt : la synthèse est un guide, les fiches vont dans la section facultative (29 pages qui n'étouffent pas le plan)", () => {
    expect(sectionOf("/gabarits-flux-de-travaux")).toBe("guides");
    expect(sectionOf("/gabarits-flux-de-travaux/devis")).toBe("optional");
    expect(sectionOf("/guides/ia-pme-quebec")).toBe("guides");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Faits canoniques : tracés au registre d'affirmations
// ---------------------------------------------------------------------------------------------------------------
type Claim = {
  id: string;
  statement: string;
  approval_status: string;
  kind: string;
};
const claims = JSON.parse(
  readFileSync(join(CONTENT, "claims.json"), "utf8"),
) as { claims: Claim[] };
const claimById = new Map(claims.claims.map((c) => [c.id, c]));
const frSlugs = new Set(
  readdirSync(join(CONTENT, "pages"))
    .filter((n) => n.endsWith(".fr-CA.json"))
    .map(
      (n) =>
        (
          JSON.parse(readFileSync(join(CONTENT, "pages", n), "utf8")) as {
            seo: { slug: string };
          }
        ).seo.slug,
    ),
);
const APP_PATHS = new Set([
  "/modeles",
  "/docs/api",
  "/vps",
  "/tarifs",
  "/contact",
  "/agents",
]);

describe("faits canoniques (llms.txt)", () => {
  it("chaque fait cite au moins une affirmation existante et non retirée du registre", () => {
    expect(CANONICAL_FACTS.length).toBeGreaterThanOrEqual(10);
    for (const f of CANONICAL_FACTS) {
      expect(f.claims.length, f.id).toBeGreaterThan(0);
      for (const code of f.claims) {
        const c = claimById.get(code);
        expect(c, `${f.id} : ${code}`).toBeDefined();
        expect(c?.approval_status, `${f.id} : ${code}`).not.toBe("retirée");
        expect(c?.kind, `${f.id} : ${code}`).not.toBe("a_completer");
      }
    }
  });

  it("chaque fait pointe vers une page qui existe (page du CMS ou route de l'application) et existe dans les deux langues", () => {
    const ids = new Set<string>();
    for (const f of CANONICAL_FACTS) {
      expect(ids.has(f.id), f.id).toBe(false);
      ids.add(f.id);
      expect(f.path.startsWith("/"), f.id).toBe(true);
      const slug = f.path.replace(/^\//, "");
      expect(
        frSlugs.has(slug) || APP_PATHS.has(f.path),
        `${f.id} : ${f.path}`,
      ).toBe(true);
      expect(f.text.fr.trim().length, f.id).toBeGreaterThan(20);
      expect(f.text.en.trim().length, f.id).toBeGreaterThan(20);
    }
  });

  it("phrases courtes, citables, terminées par un point ; aucune formulation interdite par la gouvernance du contenu", () => {
    const FORBIDDEN: [RegExp, string][] = [
      [/loi\s*25|law\s*25|bill\s*64/i, "Loi 25"],
      [/conforme|compliant/i, "conformité"],
      [/\b\d+\s*%|\b100\s*%/, "pourcentage"],
      [/gratuit|\bfree\b|\bessai\b|\btrial\b/i, "gratuité"],
      [/garanti|guarantee/i, "garantie"],
      [
        /numéro un|#1|\bleader\b|meilleur|\bbest\b|\bnumber one\b/i,
        "superlatif",
      ],
      [
        /révolutionn|magique|disruptif|revolutionary|magic|disruptive/i,
        "mot vide",
      ],
      [/certifi|ISO\s*\d|SOC\s*2/i, "certification"],
      [/inviolable|sans fuite|unhackable|breach-?proof/i, "garantie absolue"],
      [/\d\s*(\$|€|CAD|USD)/, "prix"],
      [/open[\s-]?source/i, "licence"],
    ];
    for (const f of CANONICAL_FACTS)
      for (const lang of ["fr", "en"] as const) {
        const t = f.text[lang];
        expect(t.endsWith("."), `${f.id} ${lang}`).toBe(true);
        expect([...t].length, `${f.id} ${lang}`).toBeLessThanOrEqual(260);
        expect(t, `${f.id} ${lang}`).not.toMatch(/\n/);
        for (const [re, why] of FORBIDDEN)
          expect(re.test(t), `${f.id} ${lang} : ${why}`).toBe(false);
      }
  });

  it("les faits qui reprennent mot pour mot une affirmation sont identiques au registre", () => {
    for (const f of CANONICAL_FACTS) {
      if (!f.exact) continue;
      expect(f.claims, f.id).toHaveLength(1);
      expect(f.text.fr, f.id).toBe(
        claimById.get(f.claims[0] as string)?.statement,
      );
    }
  });

  it("le statut du libre-service (CL-12) et celui d'OPSYS-AI (CL-O01) figurent parmi les faits : on n'annonce pas sans dire l'état réel", () => {
    const all = CANONICAL_FACTS.flatMap((f) => f.claims);
    expect(all).toContain("CL-12");
    expect(all).toContain("CL-O01");
    expect(all).toContain("CL-130");
    expect(all).toContain("CL-27");
    expect(all).toContain("CL-20");
  });

  it("resolveFacts : un fait dont la page n'est pas publiée dans la langue n'est jamais émis (aucune adresse orpheline)", () => {
    const only = new Set(["/entreprise"]);
    const out = resolveFacts("fr", (path) =>
      only.has(path) ? `${SITE}${path}` : null,
    );
    expect(out.length).toBeGreaterThan(0);
    for (const f of out) expect(f.url).toBe(`${SITE}/entreprise`);
    expect(resolveFacts("en", () => null)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Markdown propre d'une page
// ---------------------------------------------------------------------------------------------------------------
describe("richToMarkdown", () => {
  it("convertit le texte riche autorisé en Markdown, sans HTML", () => {
    const nodes = parseRichText(
      '<p>Un <strong>mot</strong> et une <em>nuance</em>, voir <a href="/contact/">le contact</a>.</p><ul><li>un</li><li>deux</li></ul><ol><li>a</li></ol><h3>Sous-titre</h3><blockquote>Citation</blockquote>',
    );
    const md = richToMarkdown(nodes, { siteUrl: SITE });
    expect(md).toContain(
      "Un **mot** et une *nuance*, voir [le contact](https://nexora.test/contact).",
    );
    expect(md).toContain("- un\n- deux");
    expect(md).toContain("1. a");
    expect(md).toContain("##### Sous-titre");
    expect(md).toContain("> Citation");
    expect(md).not.toMatch(/<\/?[a-z]/i);
  });

  it("n'émet jamais de lien dangereux", () => {
    const md = richToMarkdown(
      parseRichText('<p><a href="javascript:alert(1)">piège</a></p>'),
    );
    expect(md).not.toContain("javascript");
    expect(md).toContain("piège");
  });
});

describe("pageToMarkdown", () => {
  const blocks: Block[] = [
    hero({
      eyebrow: "Produit",
      headline: "L'IA de pointe.",
      subheadline: "Sans code.",
      primary: {
        label: "Demander une démonstration",
        href: "/contact/?sujet=demonstration",
      },
      secondary: null,
    }),
    {
      type: "section",
      key: "s",
      anchorId: null,
      tone: "clair",
      visual: "aucun",
      title: "Décrivez-le.",
      body: parseRichText("<p>Le Copilote prépare un flux.</p>"),
      media: null,
      captions: null,
      mediaPosition: "none",
      items: [{ title: "Un courriel arrive.", text: "Le flux démarre." }],
    },
    {
      type: "cards",
      key: "c",
      anchorId: null,
      tone: "clair",
      layout: "grille",
      columns: 3,
      title: "Six gestes.",
      intro: "Une liste.",
      cards: [
        {
          title: "Agents",
          text: "Des assistants.",
          href: "/solutions/",
          linkLabel: "Voir",
          label: null,
          status: "disponible",
        },
        {
          title: "Sans lien",
          text: null,
          href: null,
          linkLabel: null,
          label: null,
          status: null,
        },
      ],
    },
    {
      type: "pricing",
      key: "p",
      anchorId: null,
      tone: "clair",
      title: "Offres.",
      intro: null,
      plans: [
        {
          name: "Plan A",
          priceLabel: "Sur devis",
          billingNote: null,
          description: "Pour commencer.",
          features: ["Un", "Deux"],
          cta: { label: "Parler", href: "/contact/" },
        },
      ],
      note: "Avant taxes.",
    },
    faqBlock,
    {
      type: "cta",
      key: "x",
      anchorId: null,
      tone: "sombre",
      title: "Commencez.",
      text: "Parlons-en.",
      primary: { label: "Contact", href: "/contact/" },
      secondary: null,
    },
  ];
  const md = pageToMarkdown(pageModel({ blocks }), {
    siteUrl: SITE,
    resolveHref: (h) => h,
  });

  it("couvre les six types de blocs avec des titres de niveau 4 et plus (le niveau 3 est celui de la page)", () => {
    expect(md).toContain("**L'IA de pointe.**");
    expect(md).toContain("Sans code.");
    expect(md).toContain("#### Décrivez-le.");
    expect(md).toContain("Le Copilote prépare un flux.");
    expect(md).toContain("- **Un courriel arrive.** Le flux démarre.");
    expect(md).toContain("#### Six gestes.");
    expect(md).toContain("- **Agents** : Des assistants.");
    expect(md).toContain("#### Offres.");
    expect(md).toContain("**Plan A** : Sur devis");
    expect(md).toContain("#### Questions");
    expect(md).toContain("##### Où sont mes données ?");
    expect(md).toContain("Chez vous.");
    expect(md).toContain("#### Commencez.");
    expect(md).not.toMatch(/^#{1,3} /m);
  });

  it("les liens sont absolus, sans barre finale, et la requête est conservée", () => {
    expect(md).toContain(
      "[Demander une démonstration](https://nexora.test/contact?sujet=demonstration)",
    );
    expect(md).toContain("(https://nexora.test/solutions)");
  });

  it("aucune balise HTML, aucune ligne vide en trop", () => {
    expect(md).not.toMatch(/<\/?[a-z]/i);
    expect(md).not.toMatch(/\n{3,}/);
    expect(md.endsWith("\n")).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// llms.txt et llms-full.txt
// ---------------------------------------------------------------------------------------------------------------
const seoPage = (
  frSlug: string,
  enSlug: string,
  over: Partial<SeoPage> = {},
): SeoPage => ({
  id: frSlug || "home",
  noindex: false,
  createdAt: "2026-10-20T10:00:00.000Z",
  updatedAt: "2026-10-27T01:00:00.000Z",
  translations: [
    {
      code: "fr-CA",
      slug: frSlug,
      title: `Titre ${frSlug || "accueil"}`,
      seoTitle: null,
      seoDescription: `Description fr de ${frSlug || "accueil"}.`,
      canonical: null,
    },
    {
      code: "en-CA",
      slug: enSlug,
      title: `Title ${enSlug || "home"}`,
      seoTitle: null,
      seoDescription: `English description of ${enSlug || "home"}.`,
      canonical: null,
    },
  ],
  ...over,
});

const appRoute = (path: string, dir: string): AppRoute => ({
  path,
  dir,
  dated: null,
  meta: (lang) => ({
    title: `${path} ${lang} | Nexora AI`,
    description: `desc ${path} ${lang}`,
  }),
});

const llmsInput = {
  siteName: "Nexora AI",
  siteUrl: SITE,
  summary: { fr: "Résumé fr.", en: "Summary en." },
  pages: [
    seoPage("", ""),
    seoPage("workstudio", "workstudio"),
    seoPage("opsys-ai", "opsys-ai"),
    seoPage("solutions", "solutions"),
    seoPage("solutions/factures", "solutions/invoices"),
    seoPage("souverainete", "sovereignty"),
    seoPage("vos-donnees", "your-data"),
    seoPage("entreprise", "company"),
    seoPage("faq", "faq"),
    seoPage("guides/ia-pme-quebec", "guides/ai-small-business-quebec"),
    seoPage("page-cachee", "hidden-page", { noindex: true }),
    seoPage("inconnue", "unknown"),
  ],
  appRoutes: [
    appRoute("/modeles", "modeles"),
    appRoute("/docs/api", "docs/api"),
    appRoute("/vps", "vps"),
    appRoute("/contact", "contact"),
  ],
  routeMeta: (r: AppRoute, lang: Lang) => r.meta(lang),
};

describe("llms.txt : plan du site et faits canoniques", () => {
  const txt = buildLlmsTxt(llmsInput);

  it("respecte la forme llmstxt.org : un H1, une citation de résumé, puis des sections H2 de listes de liens", () => {
    expect(txt.startsWith("# Nexora AI\n\n> Résumé fr.\n")).toBe(true);
    expect(txt.match(/^# /gm)).toHaveLength(1);
    const lines = txt.split("\n");
    const h2 = lines.filter((l) => l.startsWith("## "));
    expect(h2.length).toBeGreaterThanOrEqual(8);
    for (const l of lines.filter((x) => x.startsWith("- [")))
      expect(l).toMatch(
        /^- \[[^\]]+\]\(https:\/\/nexora\.test[^)\s]*\)(: .+)?$/,
      );
    expect(txt.endsWith("\n")).toBe(true);
    expect(txt).not.toMatch(/\n{3,}/);
  });

  it("annonce les deux langues et donne le résumé anglais", () => {
    expect(txt).toContain("Summary en.");
    expect(txt).toContain("fr-CA");
    expect(txt).toContain("en-CA");
  });

  it("groupe les pages par thème, produits d'abord, dans chaque langue", () => {
    const order = (needle: string) => txt.indexOf(needle);
    expect(order("## Produits et API (fr-CA)")).toBeGreaterThan(0);
    expect(order("## Produits et API (fr-CA)")).toBeLessThan(
      order("## Solutions (fr-CA)"),
    );
    expect(order("## Solutions (fr-CA)")).toBeLessThan(
      order("## Souveraineté et données (fr-CA)"),
    );
    expect(order("## Souveraineté et données (fr-CA)")).toBeLessThan(
      order("## Guides (fr-CA)"),
    );
    expect(order("## Products and API (en-CA)")).toBeGreaterThan(
      order("## Optional (fr-CA)"),
    );
    expect(txt).toContain(
      `- [Titre workstudio](${SITE}/workstudio): Description fr de workstudio.`,
    );
    expect(txt).toContain(
      `- [Title solutions/invoices](${SITE}/en/solutions/invoices): English description of solutions/invoices.`,
    );
    expect(txt).toContain(`- [/modeles fr](${SITE}/modeles): desc /modeles fr`);
    expect(txt).toContain(
      `- [/modeles en](${SITE}/en/modeles): desc /modeles en`,
    );
  });

  it("n'y met ni page noindex ni page absente d'une langue ; les pages inconnues vont à « Optional »", () => {
    expect(txt).not.toContain("page-cachee");
    expect(txt).not.toContain("hidden-page");
    const optional = txt.slice(txt.indexOf("## Optional (fr-CA)"));
    expect(optional).toContain(`${SITE}/inconnue`);
  });

  it("les faits canoniques sont des phrases courtes suivies de leur adresse, dans chaque langue", () => {
    expect(txt).toContain("## Faits à retenir (fr-CA)");
    expect(txt).toContain("## Key facts (en-CA)");
    const facts = txt.slice(
      txt.indexOf("## Faits à retenir (fr-CA)"),
      txt.indexOf("## Produits et API (fr-CA)"),
    );
    const bullets = facts.split("\n").filter((l) => l.startsWith("- "));
    expect(bullets.length).toBeGreaterThanOrEqual(5);
    for (const b of bullets)
      expect(b).toMatch(/ \(https:\/\/nexora\.test\/[^)\s]*\)$/);
    expect(facts).toContain(
      `Nexora AI est une entreprise du Québec qui conçoit, installe et accompagne des systèmes d'IA. (${SITE}/entreprise)`,
    );
    expect(txt).toContain(
      `Nexora AI is a Quebec company that designs, installs and supports AI systems. (${SITE}/en/company)`,
    );
  });

  it("un fait dont la page n'est pas publiée disparaît : pas d'adresse orpheline", () => {
    const sans = buildLlmsTxt({
      ...llmsInput,
      pages: llmsInput.pages.filter((p) => p.id !== "entreprise"),
    });
    expect(sans).not.toContain("/entreprise");
    expect(sans).not.toContain("/en/company");
  });

  it("déterministe : deux appels identiques donnent le même texte (aucune date de génération)", () => {
    expect(buildLlmsTxt(llmsInput)).toBe(txt);
    expect(txt).not.toMatch(/20\d\d-\d\d-\d\d/);
  });

  it("une route de l'application déclarée par un autre jalon (inconnue ici) est listée sans texte inventé", () => {
    const withApps = buildLlmsTxt({
      ...llmsInput,
      appRoutes: [...llmsInput.appRoutes, appRoute("/apps", "apps")],
    });
    expect(withApps).toContain(`(${SITE}/apps): desc /apps fr`);
    const noMeta = buildLlmsTxt({
      ...llmsInput,
      appRoutes: [{ ...appRoute("/apps", "apps"), meta: () => null }],
    });
    expect(noMeta).not.toContain("/apps");
  });
});

describe("llms-full.txt : le contenu essentiel en Markdown propre", () => {
  const docs = [
    {
      lang: "fr" as const,
      frPath: "/workstudio",
      url: `${SITE}/workstudio`,
      title: "WorkStudio : plateforme d'agents IA",
      description: "Plateforme d'agents.",
      markdown: "**L'IA de pointe.**\n\nSans code.\n",
    },
    {
      lang: "en" as const,
      frPath: "/workstudio",
      url: `${SITE}/en/workstudio`,
      title: "WorkStudio: AI agents platform",
      description: "Agents platform.",
      markdown: "**Cutting-edge AI.**\n",
    },
    {
      lang: "fr" as const,
      frPath: "/opsys-ai",
      url: `${SITE}/opsys-ai`,
      title: "OPSYS-AI",
      description: null,
      markdown: "Produit en développement.\n",
    },
  ];
  const full = buildLlmsFullTxt({
    ...llmsInput,
    docs,
    catalog: {
      models: [
        {
          id: "nexora/a",
          name: "Modèle A",
          provider: "Fournisseur",
          residency: { fr: "Hébergé au Québec", en: "Hosted in Quebec" },
          kind: "chat",
          contextMax: 128000,
          devPrice: false,
          inputPerMillion: "0.42",
          outputPerMillion: "1.20",
        },
        {
          id: "nexora/b",
          name: "Modèle B",
          provider: "Autre",
          residency: {
            fr: "Hébergé aux États-Unis",
            en: "Hosted in the United States",
          },
          kind: "chat",
          contextMax: 8000,
          devPrice: true,
          inputPerMillion: "9.99",
          outputPerMillion: "9.99",
        },
      ],
      publishedAt: "2026-10-27T04:02:37.786Z",
    },
    vps: null,
  });

  it("commence par le même titre et le même résumé que llms.txt, puis les faits", () => {
    expect(full.startsWith("# Nexora AI\n\n> Résumé fr.\n")).toBe(true);
    expect(full).toContain("## Faits à retenir (fr-CA)");
  });

  it("une section par langue ; chaque page : titre de niveau 3, adresse, description, contenu", () => {
    expect(full).toContain("## Contenu des pages (fr-CA)");
    expect(full).toContain("## Page contents (en-CA)");
    expect(full).toContain(
      `### WorkStudio : plateforme d'agents IA\n\nAdresse : ${SITE}/workstudio\n\nPlateforme d'agents.\n\n**L'IA de pointe.**`,
    );
    expect(full).toContain(
      `### WorkStudio: AI agents platform\n\nAddress: ${SITE}/en/workstudio`,
    );
    expect(full).toContain(
      "### OPSYS-AI\n\nAdresse : https://nexora.test/opsys-ai\n\nProduit en développement.",
    );
  });

  it("le catalogue de modèles : lieu d'hébergement toujours ; prix seulement quand ce n'est pas un prix de développement", () => {
    expect(full).toContain("nexora/a");
    expect(full).toContain("Hébergé au Québec");
    expect(full).toContain("0.42");
    expect(full).toContain("nexora/b");
    expect(full).not.toContain("9.99");
    expect(full).toMatch(/prix de développement|développement/i);
  });

  it("une seule langue à la demande : ni sections ni faits de l'autre langue", () => {
    const only = buildLlmsFullTxt({
      ...llmsInput,
      lang: "en",
      docs,
      catalog: null,
      vps: null,
    });
    expect(only).toContain("## Page contents (en-CA)");
    expect(only).toContain("## Key facts (en-CA)");
    expect(only).not.toContain("(fr-CA)");
    expect(only).not.toContain("**L'IA de pointe.**");
    expect(only).toContain("**Cutting-edge AI.**");
  });

  it("n'invente rien : sans catalogue ni VPS, aucune section vide", () => {
    const bare = buildLlmsFullTxt({
      ...llmsInput,
      docs,
      catalog: null,
      vps: null,
    });
    expect(bare).not.toContain("nexora/a");
    expect(bare).not.toMatch(/## Catalogue/);
  });

  it("déterministe, sans HTML, sans lignes vides en trop", () => {
    expect(full).not.toMatch(/<\/?[a-z]/i);
    expect(full).not.toMatch(/\n{3,}/);
    expect(full.endsWith("\n")).toBe(true);
  });
});
