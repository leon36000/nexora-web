import { checkJsonLdConformity } from "@nexora/seo";
import { describe, expect, it } from "vitest";
import type { Block, PageModel } from "@/server/cms/model";
import type { SeoPage } from "@/server/cms/seo-pages";
import { type AppRoute, availableAppRoutes } from "./app-routes";
import { buildCmsJsonLd } from "./cms-jsonld";
import {
  articleJsonLd,
  breadcrumbJsonLd,
  organizationJsonLd,
  productJsonLd,
  serviceJsonLd,
  softwareApplicationJsonLd,
  websiteJsonLd,
} from "./jsonld";
import { buildLlmsTxt } from "./llms";
import { ogPath } from "./og";
import { resolveOgTarget, stripBrand } from "./og-target";
import { pageSchemaType } from "./page-schema";
import {
  buildRobots,
  SEARCH_BOTS,
  TRAINING_BOTS,
  USER_ACTION_BOTS,
} from "./robots-policy";
import { isIndexableEnvironment } from "./site-env";
import { buildSitemap } from "./sitemap";

const SITE = "https://nexora.test";

const page = (over: Partial<SeoPage> = {}): SeoPage => ({
  id: "p1",
  noindex: false,
  createdAt: "2026-10-20T10:00:00.000Z",
  updatedAt: "2026-10-27T01:00:00.000Z",
  translations: [
    {
      code: "fr-CA",
      slug: "opsys-ai",
      title: "OPSYS-AI",
      seoTitle: null,
      seoDescription: "Description fr.",
      canonical: null,
    },
    {
      code: "en-CA",
      slug: "opsys-ai",
      title: "OPSYS-AI",
      seoTitle: null,
      seoDescription: "Description en.",
      canonical: null,
    },
  ],
  ...over,
});

const route = (path: string, dir: string, dated: "catalog" | null = null) =>
  ({
    path,
    dir,
    dated,
    meta: (lang) => ({
      title: `${path} ${lang} | Nexora`,
      description: `desc ${path}`,
    }),
  }) satisfies AppRoute;

const baseInput = {
  siteUrl: SITE,
  pages: [] as SeoPage[],
  appRoutes: [] as AppRoute[],
  modelIds: [] as string[],
  catalogPublishedAt: null as string | null,
};

describe("sitemap", () => {
  it("une page traduite : deux entrées avec hreflang réciproques, x-default vers le français, lastmod réel", () => {
    const sm = buildSitemap({ ...baseInput, pages: [page()] });
    expect(sm.map((e) => e.url)).toEqual([
      `${SITE}/opsys-ai`,
      `${SITE}/en/opsys-ai`,
    ]);
    for (const e of sm) {
      expect(e.alternates?.languages).toEqual({
        "fr-CA": `${SITE}/opsys-ai`,
        "en-CA": `${SITE}/en/opsys-ai`,
        "x-default": `${SITE}/opsys-ai`,
      });
      expect(e.lastModified).toEqual(new Date("2026-10-27T01:00:00.000Z"));
    }
  });

  it("alternates seulement quand la traduction existe ; l'accueil est la racine", () => {
    const home = page({
      translations: [
        {
          code: "fr-CA",
          slug: "",
          title: "Accueil",
          seoTitle: null,
          seoDescription: null,
          canonical: null,
        },
      ],
    });
    const sm = buildSitemap({ ...baseInput, pages: [home] });
    expect(sm).toHaveLength(1);
    expect(sm[0]?.url).toBe(`${SITE}/`);
    expect(sm[0]?.alternates?.languages).toEqual({
      "fr-CA": `${SITE}/`,
      "x-default": `${SITE}/`,
    });
    const onlyEn = page({
      translations: [
        {
          code: "en-CA",
          slug: "only",
          title: "Only",
          seoTitle: null,
          seoDescription: null,
          canonical: null,
        },
      ],
    });
    const en = buildSitemap({ ...baseInput, pages: [onlyEn] });
    expect(en[0]?.url).toBe(`${SITE}/en/only`);
    expect(en[0]?.alternates?.languages).toEqual({
      "en-CA": `${SITE}/en/only`,
    });
  });

  it("exclut les pages noindex et les traductions dont le canonical pointe ailleurs", () => {
    const sm = buildSitemap({
      ...baseInput,
      pages: [
        page({ id: "a", noindex: true }),
        page({
          id: "b",
          translations: [
            {
              code: "fr-CA",
              slug: "dup",
              title: "Dup",
              seoTitle: null,
              seoDescription: null,
              canonical: "https://autre.test/x",
            },
          ],
        }),
      ],
    });
    expect(sm).toEqual([]);
  });

  it("omet lastmod quand la date est inconnue ou illisible : jamais « maintenant »", () => {
    for (const updatedAt of [null, "pas une date"]) {
      const sm = buildSitemap({
        ...baseInput,
        pages: [page({ updatedAt })],
      });
      expect(sm[0]).not.toHaveProperty("lastModified");
    }
  });

  it("routes de l'application et fiches de modèles : daté par la publication du catalogue", () => {
    const sm = buildSitemap({
      ...baseInput,
      appRoutes: [
        route("/contact", "contact"),
        route("/modeles", "modeles", "catalog"),
      ],
      modelIds: ["nexora/glm-5-3"],
      catalogPublishedAt: "2026-10-26T12:00:00.000Z",
    });
    const urls = sm.map((e) => e.url);
    expect(urls).toContain(`${SITE}/contact`);
    expect(urls).toContain(`${SITE}/en/modeles`);
    expect(urls).toContain(`${SITE}/modeles/nexora/glm-5-3`);
    expect(sm.find((e) => e.url === `${SITE}/contact`)).not.toHaveProperty(
      "lastModified",
    );
    expect(sm.find((e) => e.url === `${SITE}/modeles`)?.lastModified).toEqual(
      new Date("2026-10-26T12:00:00.000Z"),
    );
    expect(
      sm.find((e) => e.url === `${SITE}/en/modeles/nexora/glm-5-3`)?.alternates
        ?.languages,
    ).toMatchObject({ "fr-CA": `${SITE}/modeles/nexora/glm-5-3` });
  });

  it("/vps n'est listée que si la page existe", () => {
    const without = availableAppRoutes((dir) => dir !== "vps").map(
      (r) => r.path,
    );
    expect(without).not.toContain("/vps");
    expect(without).toContain("/contact");
    const withVps = availableAppRoutes(() => true).map((r) => r.path);
    expect(withVps).toContain("/vps");
  });
});

describe("robots", () => {
  const env = (v: Record<string, string>) => v;
  type Rule = {
    userAgent?: string | string[];
    allow?: string;
    disallow?: string | string[];
  };
  const rules = (r: ReturnType<typeof buildRobots>) =>
    (Array.isArray(r.rules) ? r.rules : [r.rules]) as Rule[];

  it("préproduction ou variable absente : Disallow: / pour tous, aucun sitemap", () => {
    for (const e of [
      env({}),
      env({ SITE_ENV: "staging" }),
      env({ SITE_ENV: "Production" }),
    ]) {
      expect(isIndexableEnvironment(e)).toBe(false);
      const r = buildRobots({ siteUrl: SITE, env: e });
      expect(rules(r)).toEqual([{ userAgent: "*", disallow: "/" }]);
      expect(r.sitemap).toBeUndefined();
    }
  });

  it("production : recherche autorisée, entraînement refusé par défaut, sitemap annoncé", () => {
    const r = buildRobots({
      siteUrl: SITE,
      env: env({ SITE_ENV: "production" }),
    });
    const byAgent = new Map(rules(r).map((x) => [x.userAgent as string, x]));
    for (const bot of SEARCH_BOTS) expect(byAgent.get(bot)?.allow).toBe("/");
    for (const bot of TRAINING_BOTS)
      expect(byAgent.get(bot)).toEqual({ userAgent: bot, disallow: "/" });
    // les robots déclenchés par une personne ne sont pas listés : robots.txt n'a pas d'effet sur eux
    for (const bot of USER_ACTION_BOTS) expect(byAgent.has(bot)).toBe(false);
    expect(byAgent.get("*")?.disallow).toEqual(
      expect.arrayContaining(["/api/", "/v1/", "/compte", "/en/compte"]),
    );
    expect(r.sitemap).toBe(`${SITE}/sitemap.xml`);
  });

  it("ROBOTS_AI_TRAINING=allow autorise les robots d'entraînement (sauf chemins privés)", () => {
    const r = buildRobots({
      siteUrl: SITE,
      env: env({ SITE_ENV: "production", ROBOTS_AI_TRAINING: "allow" }),
    });
    const gpt = rules(r).find((x) => x.userAgent === "GPTBot");
    expect(gpt?.allow).toBe("/");
    expect(gpt?.disallow).toContain("/api/");
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
    eyebrow: "OPSYS-AI",
    headline: "Un système d'IA pour vos équipes.",
    subheadline: "Installé chez vous ou hébergé au Québec.",
    primary: null,
    secondary: null,
    ...over,
  }) as Block;

const faq: Block = {
  type: "faq",
  key: "f",
  anchorId: null,
  tone: "clair",
  emitJsonLd: true,
  title: "Questions",
  items: [{ question: "Où sont mes données ?", answer: "Chez vous." }],
};

const model = (over: Partial<PageModel> = {}): PageModel => ({
  id: "p1",
  lang: "fr-CA",
  slug: "opsys-ai",
  title: "OPSYS-AI",
  seoTitle: null,
  seoDescription: null,
  canonical: null,
  noindex: false,
  seoImageId: null,
  blocks: [hero(), faq],
  translations: [
    { code: "fr-CA", slug: "opsys-ai" },
    { code: "en-CA", slug: "opsys-ai" },
  ],
  ...over,
});

/** Texte visible d'une page de test : les chaînes de ses blocs + l'en-tête. */
const visibleOf = (p: PageModel) =>
  `Nexora ${JSON.stringify(p.blocks.map((b) => (b.type === "hero" ? [b.eyebrow, b.headline, b.subheadline] : b.type === "faq" ? b.items.flatMap((i) => [i.question, i.answer]) : [])))}`;

describe("JSON-LD", () => {
  it("accueil : Organization + WebSite, sans SearchAction", () => {
    const out = buildCmsJsonLd({
      page: model({ slug: "", blocks: [hero()] }),
      lang: "fr",
      siteName: "Nexora",
      siteUrl: SITE,
      dates: null,
    });
    expect(out).toContainEqual(
      organizationJsonLd({ name: "Nexora", url: SITE }),
    );
    const site = out.find(
      (x) => (x as { "@type": string })["@type"] === "WebSite",
    );
    expect(site).toMatchObject({ inLanguage: "fr-CA", name: "Nexora" });
    expect(JSON.stringify(site)).not.toContain("SearchAction");
    expect(
      out.find((x) => (x as { "@type": string })["@type"] === "BreadcrumbList"),
    ).toBeUndefined();
  });

  it("OPSYS-AI : fil d'Ariane, Service dérivé du visible, FAQPage — et le tout est conforme au visible", () => {
    const p = model();
    const out = buildCmsJsonLd({
      page: p,
      lang: "fr",
      siteName: "Nexora",
      siteUrl: SITE,
      dates: null,
    });
    const types = out.map((x) => (x as { "@type": string })["@type"]);
    expect(types).toEqual(["BreadcrumbList", "Service", "FAQPage"]);
    expect(out[1]).toMatchObject({
      name: "OPSYS-AI",
      description: "Installé chez vous ou hébergé au Québec.",
      url: `${SITE}/opsys-ai`,
    });
    expect(checkJsonLdConformity(out, visibleOf(p))).toEqual([]);
  });

  it("le nom du Service retombe sur le titre du héros quand le titre de page n'est pas affiché", () => {
    const p = model({ title: "Titre interne" });
    const out = buildCmsJsonLd({
      page: p,
      lang: "fr",
      siteName: "Nexora",
      siteUrl: SITE,
      dates: null,
    });
    expect(out[1]).toMatchObject({ name: "Un système d'IA pour vos équipes." });
    expect(checkJsonLdConformity(out, visibleOf(p))).toEqual([]);
  });

  it("n'émet pas de description qui n'est pas affichée", () => {
    const out = buildCmsJsonLd({
      page: model({ blocks: [hero({ subheadline: null })] }),
      lang: "fr",
      siteName: "Nexora",
      siteUrl: SITE,
      dates: null,
    });
    expect(out[1]).not.toHaveProperty("description");
  });

  it("Article pour blog/ et articles/ avec les dates réelles de Directus", () => {
    expect(pageSchemaType("blog/mon-billet")).toBe("article");
    expect(pageSchemaType("articles/x")).toBe("article");
    expect(pageSchemaType("opsys-ai")).toBe("service");
    expect(pageSchemaType("workstudio")).toBe("software");
    expect(pageSchemaType("contact")).toBeNull();
    const out = buildCmsJsonLd({
      page: model({
        slug: "blog/billet",
        title: "Un billet",
        blocks: [hero({ headline: "Un billet", subheadline: null })],
        translations: [{ code: "fr-CA", slug: "blog/billet" }],
      }),
      lang: "fr",
      siteName: "Nexora",
      siteUrl: SITE,
      dates: {
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-05T00:00:00.000Z",
      },
    });
    expect(out[1]).toMatchObject({
      "@type": "Article",
      headline: "Un billet",
      datePublished: "2026-10-01T00:00:00.000Z",
      dateModified: "2026-10-05T00:00:00.000Z",
    });
  });

  it("SoftwareApplication : jamais d'offre sans prix affiché", () => {
    const app = softwareApplicationJsonLd({
      name: "WorkStudio",
      description: null,
      url: `${SITE}/workstudio`,
      category: "BusinessApplication",
      offers: [],
    });
    expect(app).not.toHaveProperty("offers");
    const priced = softwareApplicationJsonLd({
      name: "WorkStudio",
      description: null,
      url: `${SITE}/workstudio`,
      category: "BusinessApplication",
      offers: [{ name: null, price: "49", currency: "CAD", unitText: null }],
    });
    expect(priced).toHaveProperty("offers");
    expect(checkJsonLdConformity([priced], "WorkStudio 49 $ par mois")).toEqual(
      [],
    );
    expect(
      checkJsonLdConformity([priced], "WorkStudio sur demande").map(
        (f) => f.rule,
      ),
    ).toEqual(["jsonld.price-not-visible"]);
  });

  it("Product : offres = prix affichés en CAD ; prix nul ou invalide écarté ; conforme au visible", () => {
    const product = productJsonLd({
      name: "GLM 5.3",
      description: "Modèle de conversation.",
      url: `${SITE}/modeles/nexora/glm-5-3`,
      sku: "nexora/glm-5-3",
      brand: null,
      offers: [
        {
          name: "Entrée",
          price: "0.42",
          currency: "CAD",
          unitText: "par million de jetons",
        },
        {
          name: "Sortie",
          price: "1.68",
          currency: "CAD",
          unitText: "par million de jetons",
        },
        { name: "Cache", price: "0", currency: "CAD", unitText: null },
        { name: "Bizarre", price: "abc", currency: "CAD", unitText: null },
      ],
    });
    expect(product).toBeTruthy();
    const offers = (
      product as unknown as {
        offers: { price: string; priceCurrency: string }[];
      }
    ).offers;
    expect(offers.map((o) => o.price)).toEqual(["0.42", "1.68"]);
    expect(offers.every((o) => o.priceCurrency === "CAD")).toBe(true);
    const visible =
      "GLM 5.3 Modèle de conversation. Entrée 0,42 $ par million de jetons Sortie 1,68 $ par million de jetons nexora/glm-5-3";
    expect(checkJsonLdConformity([product], visible)).toEqual([]);
    // un prix qui ment est détecté
    expect(
      checkJsonLdConformity([product], visible.replace("1,68", "9,99")).map(
        (f) => f.rule,
      ),
    ).toEqual(["jsonld.price-not-visible"]);
    // sans prix : pas d'offers
    expect(
      productJsonLd({
        name: "VPS",
        description: null,
        url: SITE,
        sku: null,
        brand: null,
        offers: [],
      }),
    ).not.toHaveProperty("offers");
  });

  it("refuse plutôt que d'émettre une donnée vide", () => {
    expect(
      serviceJsonLd({
        name: "  ",
        description: null,
        url: SITE,
        providerName: "Nexora",
        organizationUrl: SITE,
      }),
    ).toBeNull();
    expect(breadcrumbJsonLd([{ name: "Accueil", url: SITE }])).toBeNull();
    expect(
      articleJsonLd({
        headline: "",
        description: null,
        url: SITE,
        lang: "fr",
        publisherName: "Nexora",
        datePublished: null,
        dateModified: null,
        image: null,
      }),
    ).toBeNull();
    expect(
      websiteJsonLd({ name: "Nexora", url: SITE, lang: "en" }),
    ).toMatchObject({ inLanguage: "en-CA" });
  });
});

describe("llms.txt", () => {
  const input = {
    siteName: "Nexora",
    siteUrl: SITE,
    summary: { fr: "Résumé fr.", en: "Summary en." },
    pages: [
      page(),
      page({ id: "hidden", noindex: true }),
      page({
        id: "fr-only",
        translations: [
          {
            code: "fr-CA" as const,
            slug: "souverainete",
            title: "Souveraineté",
            seoTitle: null,
            seoDescription: null,
            canonical: null,
          },
        ],
      }),
    ],
    appRoutes: [route("/contact", "contact")],
    routeMeta: (r: AppRoute, lang: "fr" | "en") => r.meta(lang),
  };
  it("liste les pages publiées par langue, sans noindex, sans page absente d'une langue", () => {
    const txt = buildLlmsTxt(input);
    expect(txt.startsWith("# Nexora\n\n> Résumé fr.\n")).toBe(true);
    expect(txt).toContain("## Français (fr-CA)");
    expect(txt).toContain("## English (en-CA)");
    expect(txt).toContain(`- [OPSYS-AI](${SITE}/opsys-ai): Description fr.`);
    expect(txt).toContain(`- [OPSYS-AI](${SITE}/en/opsys-ai): Description en.`);
    expect(txt).toContain(`(${SITE}/souverainete)`);
    expect(txt).not.toContain("/en/souverainete");
    expect(txt).toContain(`- [/contact fr](${SITE}/contact): desc /contact`);
    expect(txt.match(/opsys-ai\)/g)).toHaveLength(2); // la page noindex n'y est pas
    expect(txt.endsWith("\n")).toBe(true);
  });
});

describe("images Open Graph", () => {
  it("chemin dérivé de la page, jamais d'un texte libre", () => {
    expect(ogPath("fr", "/")).toBe("/og/fr");
    expect(ogPath("en", "/opsys-ai")).toBe("/og/en/opsys-ai");
    expect(ogPath("fr", "/modeles/nexora/glm-5-3")).toBe(
      "/og/fr/modeles/nexora/glm-5-3",
    );
  });
  it("résout une route connue, un modèle, une page ; refuse le reste", () => {
    const routes = [route("/contact", "contact")];
    expect(resolveOgTarget([], routes)).toEqual({ kind: "home" });
    expect(resolveOgTarget(["contact"], routes)).toMatchObject({ kind: "app" });
    expect(resolveOgTarget(["modeles", "nexora", "glm-5-3"], routes)).toEqual({
      kind: "model",
      id: "nexora/glm-5-3",
    });
    expect(resolveOgTarget(["opsys-ai"], routes)).toEqual({
      kind: "page",
      slug: "opsys-ai",
    });
    expect(resolveOgTarget(["modeles", "<script>"], routes)).toBeNull();
    expect(resolveOgTarget(["..", "etc"], routes)).toBeNull();
  });
  it("retire la marque des titres", () => {
    expect(stripBrand("Modèles | Nexora", "Nexora")).toBe("Modèles");
    expect(stripBrand("Planifier un diagnostic | Nexora", "Nexora")).toBe(
      "Planifier un diagnostic",
    );
    expect(stripBrand("Sans marque", "Nexora")).toBe("Sans marque");
  });
});
