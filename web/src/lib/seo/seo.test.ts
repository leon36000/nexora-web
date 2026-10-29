import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkJsonLdConformity } from "@nexora/seo";
import { describe, expect, it } from "vitest";
import { APPS, appMeta } from "@/i18n/apps";
import type { Block, PageModel } from "@/server/cms/model";
import type { SeoPage } from "@/server/cms/seo-pages";
import {
  type AppRoute,
  appRouteExists,
  availableAppRoutes,
} from "./app-routes";
import { buildCmsJsonLd } from "./cms-jsonld";
import { organizationProfile } from "./entity";
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
import { ogSafeTitle, resolveOgTarget, stripBrand } from "./og-target";
import { pageSchemaType } from "./page-schema";
import {
  AI_BOTS,
  aiTrainingPolicy,
  buildRobots,
  PRIVATE_PATHS,
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
  vpsAppCodes: [] as string[],
  vpsPublishedAt: null as string | null,
  agentSlugs: [] as string[],
  agentsPublishedAt: null as string | null,
};

describe("image Open Graph : aucune requête réseau pour un emoji", () => {
  it("retire les emoji, drapeaux, séquences ZWJ et variantes d'affichage du titre (satori irait les chercher sur un CDN)", () => {
    expect(ogSafeTitle("Lancement 🚀 de l’IA 🇨🇦 souveraine")).toBe(
      "Lancement de l’IA souveraine",
    );
    expect(ogSafeTitle("Équipe 👩‍💻 prête ✅ 1️⃣")).toBe("Équipe prête 1");
    expect(ogSafeTitle("Titre normal – accentué é à ç")).toBe(
      "Titre normal – accentué é à ç",
    );
    expect(ogSafeTitle("🚀🚀")).toBe("");
  });
});

describe("sitemap : slugs hostiles saisis dans Directus", () => {
  it("n'écrit jamais un slug qui n'est pas propre (injection XML, URL relative au protocole, majuscules)", () => {
    for (const slug of [
      "a</loc><loc>https://evil.example",
      "/evil.com",
      "//evil.com",
      "a&b",
      "A-Majuscule",
      "../etc",
      "a b",
    ]) {
      const sm = buildSitemap({
        ...baseInput,
        pages: [
          page({
            translations: [
              {
                code: "fr-CA",
                slug,
                title: "T",
                seoTitle: null,
                seoDescription: null,
                canonical: null,
              },
            ],
          }),
        ],
      });
      expect(sm, slug).toEqual([]);
    }
  });
});

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

  it("/agents et les fiches d'agents publiés, datées par leur dernière publication", () => {
    const agents = availableAppRoutes(() => true).filter(
      (r) => r.path === "/agents",
    );
    const sm = buildSitemap({
      ...baseInput,
      appRoutes: agents,
      agentSlugs: ["assistant-general"],
      agentsPublishedAt: "2026-10-27T10:00:00.000Z",
    });
    expect(sm.map((e) => e.url)).toEqual([
      `${SITE}/agents`,
      `${SITE}/en/agents`,
      `${SITE}/agents/assistant-general`,
      `${SITE}/en/agents/assistant-general`,
    ]);
    for (const e of sm)
      expect(e.lastModified).toEqual(new Date("2026-10-27T10:00:00.000Z"));
  });

  it("/apps et chaque fiche Nexora Apps : deux adresses par page, hreflang réciproques, aucune date inventée", () => {
    const routes = availableAppRoutes(() => true).filter((r) =>
      r.path.startsWith("/apps"),
    );
    const sm = buildSitemap({ ...baseInput, appRoutes: routes });
    const urls = sm.map((e) => e.url);
    expect(routes.map((r) => r.path)).toEqual([
      "/apps",
      ...APPS.map((a) => `/apps/${a.slug}`),
    ]);
    expect(urls).toContain(`${SITE}/apps`);
    expect(urls).toContain(`${SITE}/en/apps`);
    expect(urls).toContain(`${SITE}/apps/webpilot`);
    expect(urls).toContain(`${SITE}/en/apps/privacy-router`);
    expect(urls).toHaveLength((APPS.length + 1) * 2);
    expect(new Set(urls).size).toBe(urls.length);
    expect(
      sm.find((e) => e.url === `${SITE}/en/apps/webpilot`)?.alternates
        ?.languages,
    ).toEqual({
      "fr-CA": `${SITE}/apps/webpilot`,
      "en-CA": `${SITE}/en/apps/webpilot`,
      "x-default": `${SITE}/apps/webpilot`,
    });
    // la page n'est pas datée par un catalogue : pas de lastmod plutôt qu'une date inventée
    for (const e of sm) expect(e.lastModified).toBeUndefined();
  });

  it("les fiches Nexora Apps ne sont listées que si leur page existe, la liste seule reste", () => {
    const paths = availableAppRoutes((dir) => dir !== "apps/[slug]").map(
      (r) => r.path,
    );
    expect(paths).toContain("/apps");
    expect(paths.some((p) => p.startsWith("/apps/"))).toBe(false);
    const none = availableAppRoutes((dir) => dir !== "apps").map((r) => r.path);
    expect(none).not.toContain("/apps");
  });

  it("l’image Open Graph retrouve le titre de chaque fiche Nexora Apps depuis les dictionnaires", () => {
    for (const app of APPS) {
      const target = resolveOgTarget(
        ["apps", app.slug],
        availableAppRoutes(() => true),
      );
      expect(target?.kind, app.slug).toBe("app");
      if (target?.kind !== "app") continue;
      for (const lang of ["fr", "en"] as const)
        expect(target.route.meta(lang)).toEqual(appMeta(lang, app.slug));
    }
    // un identifiant inconnu n'est pas une route : il retombe sur le chemin des pages Directus
    expect(
      resolveOgTarget(
        ["apps", "inconnu"],
        availableAppRoutes(() => true),
      )?.kind,
    ).toBe("page");
  });

  it("/vps et ses fiches d'application publiées, datées par la publication du catalogue VPS", () => {
    const vps = availableAppRoutes(() => true).filter((r) => r.path === "/vps");
    const sm = buildSitemap({
      ...baseInput,
      appRoutes: vps,
      vpsAppCodes: ["openclaw"],
      vpsPublishedAt: "2026-10-27T09:00:00.000Z",
    });
    expect(sm.map((e) => e.url)).toEqual([
      `${SITE}/vps`,
      `${SITE}/en/vps`,
      `${SITE}/vps/openclaw`,
      `${SITE}/en/vps/openclaw`,
    ]);
    for (const e of sm)
      expect(e.lastModified).toEqual(new Date("2026-10-27T09:00:00.000Z"));
    expect(
      sm.find((e) => e.url === `${SITE}/en/vps/openclaw`)?.alternates
        ?.languages,
    ).toMatchObject({ "fr-CA": `${SITE}/vps/openclaw` });
  });

  it("/tarifs (fr) et /en/pricing (en) : deux adresses, hreflang réciproques, x-default vers le français", () => {
    const routes = availableAppRoutes(() => true).filter(
      (r) => r.path === "/tarifs",
    );
    const sm = buildSitemap({ ...baseInput, appRoutes: routes });
    expect(sm.map((e) => e.url)).toEqual([
      `${SITE}/tarifs`,
      `${SITE}/en/pricing`,
    ]);
    for (const e of sm)
      expect(e.alternates?.languages).toEqual({
        "fr-CA": `${SITE}/tarifs`,
        "en-CA": `${SITE}/en/pricing`,
        "x-default": `${SITE}/tarifs`,
      });
    // aucune date inventée : la page n'est pas datée par un catalogue
    for (const e of sm) expect(e.lastModified).toBeUndefined();
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

  const PRIVATE = ["/api/", "/v1/", "/compte", "/en/compte"];
  const byAgentOf = (r: ReturnType<typeof buildRobots>) =>
    new Map(rules(r).map((x) => [x.userAgent as string, x]));

  it("production, politique par défaut : tout le public est autorisé pour chaque robot d'IA (recherche, réponse, entraînement), jamais les chemins privés", () => {
    const r = buildRobots({
      siteUrl: SITE,
      env: env({ SITE_ENV: "production" }),
    });
    const byAgent = byAgentOf(r);
    for (const bot of [
      ...SEARCH_BOTS,
      ...USER_ACTION_BOTS,
      ...TRAINING_BOTS,
      "*",
    ]) {
      const rule = byAgent.get(bot);
      expect(rule?.allow, bot).toBe("/");
      // un groupe nommé remplace le groupe « * » : chaque groupe répète donc les chemins privés
      expect(rule?.disallow, bot).toEqual(expect.arrayContaining(PRIVATE));
    }
    expect(r.sitemap).toBe(`${SITE}/sitemap.xml`);
  });

  it("les robots demandés par le fondateur ont chacun un groupe explicite", () => {
    const byAgent = byAgentOf(
      buildRobots({ siteUrl: SITE, env: env({ SITE_ENV: "production" }) }),
    );
    for (const bot of [
      "GPTBot",
      "OAI-SearchBot",
      "ChatGPT-User",
      "ClaudeBot",
      "Claude-SearchBot",
      "Claude-User",
      "PerplexityBot",
      "Perplexity-User",
      "Google-Extended",
      "Googlebot",
      "Bingbot",
      "CCBot",
    ])
      expect(byAgent.has(bot), bot).toBe(true);
  });

  it("ROBOTS_AI_TRAINING=disallow refuse seulement les robots d'entraînement ; recherche et réponse restent autorisées", () => {
    const r = buildRobots({
      siteUrl: SITE,
      env: env({ SITE_ENV: "production", ROBOTS_AI_TRAINING: "disallow" }),
    });
    const byAgent = byAgentOf(r);
    for (const bot of TRAINING_BOTS)
      expect(byAgent.get(bot), bot).toEqual({ userAgent: bot, disallow: "/" });
    for (const bot of [...SEARCH_BOTS, ...USER_ACTION_BOTS])
      expect(byAgent.get(bot)?.allow, bot).toBe("/");
    expect(byAgent.get("*")?.allow).toBe("/");
  });

  it("toute autre valeur de ROBOTS_AI_TRAINING (allow, vide, inconnue) garde la politique par défaut : autorisé", () => {
    for (const value of ["allow", "", "oui", "DISALLOW"]) {
      expect(
        aiTrainingPolicy(
          env({ SITE_ENV: "production", ROBOTS_AI_TRAINING: value }),
        ),
        value,
      ).toBe("allow");
    }
    expect(aiTrainingPolicy(env({}))).toBe("allow");
    expect(aiTrainingPolicy(env({ ROBOTS_AI_TRAINING: "disallow" }))).toBe(
      "disallow",
    );
  });

  it("le registre des robots : noms uniques, jetons valides, une seule catégorie, opérateur et source documentés", () => {
    const names = AI_BOTS.map((b) => b.name);
    expect(new Set(names).size).toBe(names.length);
    for (const b of AI_BOTS) {
      expect(b.name, b.name).toMatch(/^[A-Za-z0-9._-]+$/);
      expect(["search", "training", "user-action"]).toContain(b.kind);
      expect(b.operator.length, b.name).toBeGreaterThan(1);
      expect(b.purpose.length, b.name).toBeGreaterThan(10);
      expect(b.docUrl, b.name).toMatch(/^https:\/\//);
    }
    // les listes exportées sont dérivées du registre : aucune dérive possible
    expect([...SEARCH_BOTS]).toEqual(
      AI_BOTS.filter((b) => b.kind === "search").map((b) => b.name),
    );
    expect([...TRAINING_BOTS]).toEqual(
      AI_BOTS.filter((b) => b.kind === "training").map((b) => b.name),
    );
    expect([...USER_ACTION_BOTS]).toEqual(
      AI_BOTS.filter((b) => b.kind === "user-action").map((b) => b.name),
    );
  });

  it("les chemins privés sont exportés et couvrent le compte, l'API et la passerelle dans les deux langues", () => {
    expect([...PRIVATE_PATHS]).toEqual(PRIVATE);
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
      profile: organizationProfile(SITE, {}),
    });
    expect(out).toContainEqual(
      organizationJsonLd({
        name: "Nexora",
        url: SITE,
        profile: organizationProfile(SITE, {}),
      }),
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
    expect(types).toEqual(["BreadcrumbList", "WebPage", "Service", "FAQPage"]);
    expect(out[2]).toMatchObject({
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
    expect(
      out.find((x) => (x as { "@type": string })["@type"] === "Service"),
    ).toMatchObject({ name: "Un système d'IA pour vos équipes." });
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
    for (const type of ["Service", "WebPage"])
      expect(
        out.find((x) => (x as { "@type": string })["@type"] === type),
      ).not.toHaveProperty("description");
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
  it("liste les pages publiées par langue et par thème, sans noindex, sans page absente d'une langue (le détail est dans geo.test.ts)", () => {
    const txt = buildLlmsTxt(input);
    expect(txt.startsWith("# Nexora\n\n> Résumé fr.\n")).toBe(true);
    expect(txt).toContain("Summary en.");
    expect(txt).toContain("## Produits et API (fr-CA)");
    expect(txt).toContain("## Products and API (en-CA)");
    expect(txt).toContain(`- [OPSYS-AI](${SITE}/opsys-ai): Description fr.`);
    expect(txt).toContain(`- [OPSYS-AI](${SITE}/en/opsys-ai): Description en.`);
    expect(txt).toContain(`(${SITE}/souverainete)`);
    expect(txt).not.toContain("/en/souverainete");
    expect(txt).toContain(`- [/contact fr](${SITE}/contact): desc /contact`);
    expect(txt.match(/opsys-ai\):/g)).toHaveLength(2); // la page noindex n'y est pas
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
    expect(resolveOgTarget(["vps", "hermes-agent"], routes)).toEqual({
      kind: "vps",
      code: "hermes-agent",
    });
    expect(resolveOgTarget(["agents", "mon-agent"], routes)).toEqual({
      kind: "agent",
      slug: "mon-agent",
    });
    // forme invalide : jamais de texte tiré de l'adresse
    expect(resolveOgTarget(["vps", "<script>"], routes)).toBeNull();
    expect(resolveOgTarget(["vps", "a", "b"], routes)).toBeNull();
    expect(resolveOgTarget(["agents", "-x-"], routes)).toBeNull();
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

describe("appRouteExists : route de l'application présente dans ce déploiement", () => {
  const tmp = () => mkdtempSync(join(tmpdir(), "nexora-routes-"));

  it("lit le manifeste de Next quand il existe", () => {
    const dir = tmp();
    mkdirSync(join(dir, ".next", "server"), { recursive: true });
    writeFileSync(
      join(dir, ".next", "server", "app-paths-manifest.json"),
      JSON.stringify({ "/[lang]/vps/page": "app/[lang]/vps/page.js" }),
    );
    expect(appRouteExists("vps", dir)).toBe(true);
    expect(appRouteExists("agents", dir)).toBe(false);
  });

  it("lit les sources en développement", () => {
    const dir = tmp();
    mkdirSync(join(dir, "src", "app", "[lang]", "contact"), {
      recursive: true,
    });
    writeFileSync(join(dir, "src", "app", "[lang]", "contact", "page.tsx"), "");
    expect(appRouteExists("contact", dir)).toBe(true);
    expect(appRouteExists("vps", dir)).toBe(false);
  });

  it("répertoire courant étranger (ni manifeste ni sources) : ne retire aucune route", () => {
    expect(appRouteExists("vps", tmp())).toBe(true);
  });
});
