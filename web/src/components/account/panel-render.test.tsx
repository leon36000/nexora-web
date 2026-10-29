import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getAccountDictionary } from "@/i18n/account";
import type { DashboardData } from "@/server/billing/dashboard";
import type { ActivityRow, BreakdownRow } from "@/server/gateway/activity";
import type { ActivityDetail } from "@/server/gateway/activity-detail";
import type { OverviewData } from "@/server/gateway/activity-overview";
import type { ActivityPageData } from "@/server/gateway/activity-page";
import type { PublicModel } from "@/server/gateway/public";
import type { PublicCatalog } from "@/server/gateway/read";
import { ActivityView } from "./activity-view";
import { ModelsPanel } from "./models-panel";
import { Overview } from "./overview";
import type { WorkstudioView, workstudioView } from "./panel-logic";
import { PanelNav } from "./panel-nav";
import { RequestDetail } from "./request-detail";
import { WorkstudioPanel } from "./workstudio-panel";

const dashboard: DashboardData = {
  organization: { id: "org_1", name: "Acme" },
  account: {
    organizationId: "org_1",
    balanceMicro: 12_345_678n,
    heldMicro: 0n,
    availableMicro: 12_345_678n,
    blocked: false,
  },
  entries: [],
  subscriptions: [],
  hasStripeCustomer: false,
};

const summary = {
  requests: 3,
  errors: 1,
  promptTokens: 300,
  completionTokens: 60,
  cachedTokens: 20,
  costMicro: 650n,
  valueMicro: 4_000n,
  avgLatencyMs: 200,
};

const overview = (over: Partial<OverviewData> = {}): OverviewData => ({
  billingMode: "standard",
  hasApiKey: false,
  hasModelRequest: false,
  hasVps: false,
  activeKeys: 0,
  workstudioKeyActive: false,
  month: summary,
  last30: summary,
  ...over,
});

const renderOverview = (
  lang: "fr" | "en",
  o: OverviewData,
  role: "owner" | "member" = "owner",
  hasWorkstudio = false,
  data: DashboardData = dashboard,
  workstudio: WorkstudioView["state"] = "no_subscription",
) =>
  renderToStaticMarkup(
    <Overview
      lang={lang}
      t={getAccountDictionary(lang)}
      role={role}
      dashboard={data}
      overview={o}
      hasWorkstudio={hasWorkstudio}
      wallet={{ lots: [], included: null }}
      workstudio={workstudio}
      flash={null}
    />,
  );

describe("aperçu : portefeuille", () => {
  it("organisation ordinaire : solde et bouton « Ajouter des fonds » vers le flux d'achat existant, jamais « gratuit »", () => {
    const html = renderOverview("fr", overview());
    expect(html).toContain("Ajouter des fonds");
    expect(html).toContain('href="/compte/facturation#ajouter-des-fonds"');
    expect(html).toContain("12,3457");
    expect(html).not.toContain("gratuit");
  });

  it("organisation « maison » : « Accès administrateur gratuit » à la place du bouton de recharge", () => {
    const html = renderOverview("fr", overview({ billingMode: "house" }));
    expect(html).toContain("Accès administrateur gratuit");
    expect(html).not.toContain("Ajouter des fonds");
    expect(html).not.toContain("compte/facturation#ajouter-des-fonds");
    // La valeur offerte (prix public) remplace la dépense, qui est toujours nulle.
    expect(html).toContain("Valeur offerte");
  });

  it("membre simple : pas de bouton, le propriétaire seul ajoute des fonds", () => {
    const html = renderOverview("fr", overview(), "member");
    expect(html).not.toContain("Ajouter des fonds</a>");
    expect(html).toContain("Seul le propriétaire");
  });

  it("anglais : adresse localisée et libellés anglais", () => {
    const html = renderOverview("en", overview());
    expect(html).toContain("Add funds");
    expect(html).toContain('href="/en/compte/facturation#ajouter-des-fonds"');
    expect(renderOverview("en", overview({ billingMode: "house" }))).toContain(
      "Free administrator access",
    );
  });

  it("solde bloqué : l'alerte l'explique", () => {
    const html = renderOverview("fr", overview(), "owner", false, {
      ...dashboard,
      account: {
        ...dashboard.account,
        availableMicro: -5_000n,
        balanceMicro: -5_000n,
        blocked: true,
      },
    });
    expect(html).toContain("Compte bloqué");
  });
});

describe("aperçu : où j'en suis", () => {
  it("consommation du mois, clés actives et état de WorkStudio, en français", () => {
    const html = renderOverview(
      "fr",
      overview({
        activeKeys: 2,
        workstudioKeyActive: true,
        month: { ...summary, costMicro: 1_234_000n },
      }),
      "owner",
      true,
      dashboard,
      "ready",
    );
    expect(html).toContain("Où j’en suis");
    expect(html).toContain("Consommation du mois");
    expect(html).toContain("1,23");
    expect(html).toContain("Clés actives");
    expect(html).toContain("Branché");
    expect(html).toContain('href="/compte/workstudio"');
    expect(html).toContain('href="/compte/modeles"');
  });

  it("WorkStudio : pas encore ouvert, abonnement requis, suspendu ou en préparation", () => {
    const text = (state: WorkstudioView["state"], keyActive: boolean) =>
      renderOverview(
        "fr",
        overview({ workstudioKeyActive: keyActive }),
        "owner",
        false,
        dashboard,
        state,
      );
    expect(text("ready", false)).toContain("Pas encore ouvert");
    expect(text("no_subscription", false)).toContain("Abonnement requis");
    expect(text("suspended", false)).toContain("Abonnement suspendu");
    expect(text("pending", false)).toContain("En préparation");
  });

  it("anglais, et la maison voit la valeur offerte du mois, pas une dépense", () => {
    const en = renderOverview("en", overview());
    expect(en).toContain("Where I stand");
    expect(en).toContain("Usage this month");
    const house = renderOverview(
      "fr",
      overview({
        billingMode: "house",
        month: { ...summary, costMicro: 0n, valueMicro: 9_000_000n },
      }),
    );
    expect(house).toContain("9,00");
  });
});

describe("aperçu : pour démarrer", () => {
  it("coche seulement les étapes dont les données le prouvent, et le dit en texte", () => {
    const none = renderOverview("fr", overview());
    expect(none).toContain("0 étapes sur 4 faites");
    expect((none.match(/À faire/g) ?? []).length).toBe(4);
    const some = renderOverview(
      "fr",
      overview({ hasApiKey: true, hasModelRequest: true, hasVps: true }),
      "owner",
      false,
    );
    expect(some).toContain("3 étapes sur 4 faites");
    expect((some.match(/>Fait</g) ?? []).length).toBe(3);
    expect((some.match(/À faire/g) ?? []).length).toBe(1);
  });

  it("sans requête depuis 30 jours : message d'accueil, pas de chiffres inventés", () => {
    const html = renderOverview(
      "fr",
      overview({
        last30: {
          requests: 0,
          errors: 0,
          promptTokens: 0,
          completionTokens: 0,
          cachedTokens: 0,
          costMicro: 0n,
          valueMicro: 0n,
          avgLatencyMs: null,
        },
      }),
    );
    expect(html).toContain("Aucune requête depuis 30 jours");
  });
});

const day = (key: string, requests: number, cost: bigint): BreakdownRow => ({
  key,
  label: key,
  keyPrefix: null,
  requests,
  errors: 0,
  promptTokens: 10 * requests,
  completionTokens: 5 * requests,
  cachedTokens: 0,
  costMicro: cost,
  valueMicro: cost,
});

const row = (over: Partial<ActivityRow> = {}): ActivityRow => ({
  id: "11111111-1111-4111-8111-111111111111",
  requestId: "req_1",
  createdAt: new Date("2026-10-28T12:00:00Z"),
  model: "nexora/grand",
  endpoint: "chat.completions",
  apiKeyId: "22222222-2222-4222-8222-222222222222",
  apiKeyName: "Production",
  apiKeyPrefix: "nxk_abcdefg",
  status: "ok",
  httpStatus: 200,
  errorCode: null,
  stream: false,
  promptTokens: 100,
  completionTokens: 50,
  cachedTokens: 0,
  reasoningTokens: 0,
  costMicro: 900n,
  valueMicro: 900n,
  billed: true,
  latencyMs: 812,
  ...over,
});

const noWebpilot: ActivityPageData["webpilot"] = {
  requests: 0,
  errors: 0,
  pagesStatic: 0,
  pagesBrowser: 0,
  browserMinutes: 0,
  costMicro: 0n,
  valueMicro: 0n,
  byOperation: [],
};

const pageData = (over: Partial<ActivityPageData> = {}): ActivityPageData => ({
  period: "30d",
  criteria: {
    from: new Date("2026-09-29T15:00:00Z"),
    to: new Date("2026-10-29T15:00:00Z"),
  },
  invalid: false,
  summary,
  byDay: [day("2026-10-27", 1, 5_000n), day("2026-10-28", 2, 900n)],
  byModel: [day("nexora/grand", 2, 900n)],
  byAgent: [day("agent/facturation", 1, 5_000n)],
  byKey: [
    { ...day("k1", 3, 5_900n), label: "Production", keyPrefix: "nxk_abc" },
  ],
  webpilot: noWebpilot,
  models: ["agent/facturation", "nexora/grand"],
  page: { rows: [row()], nextCursor: null },
  hasCursor: false,
  ...over,
});

const keys = [
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Production",
    prefix: "nxk_abcdefg",
  },
];

const renderActivity = (
  data: ActivityPageData,
  lang: "fr" | "en" = "fr",
  free = false,
) =>
  renderToStaticMarkup(
    <ActivityView
      lang={lang}
      t={getAccountDictionary(lang)}
      data={data}
      free={free}
      keys={keys}
    />,
  );

describe("page Activité : section WebPilot", () => {
  const used: ActivityPageData["webpilot"] = {
    requests: 5,
    errors: 1,
    pagesStatic: 12,
    pagesBrowser: 2,
    browserMinutes: 0,
    costMicro: 70_000n,
    valueMicro: 70_000n,
    byOperation: [
      {
        operation: "crawl",
        requests: 1,
        pages: 10,
        minutes: 0,
        costMicro: 50_000n,
      },
      {
        operation: "scrape",
        requests: 4,
        pages: 4,
        minutes: 0,
        costMicro: 20_000n,
      },
    ],
  };

  it("absente tant que l'organisation n'a pas utilisé WebPilot", () => {
    expect(renderActivity(pageData())).not.toContain("WebPilot");
  });

  it("montre pages lues, minutes, coût et opérations (fr-CA et en-CA)", () => {
    const fr = renderActivity(pageData({ webpilot: used }));
    for (const text of [
      "WebPilot",
      "Pages lues",
      "Minutes de navigateur",
      "Exploration d’un site",
      "Lecture d’une page",
      "dont 1 en échec",
    ])
      expect(fr).toContain(text);
    const en = renderActivity(pageData({ webpilot: used }), "en");
    for (const text of [
      "Pages read",
      "Browser minutes",
      "Site crawl",
      "1 failed",
    ])
      expect(en).toContain(text);
  });

  it("organisation maison : valeur offerte au lieu du coût", () => {
    const html = renderActivity(pageData({ webpilot: used }), "fr", true);
    expect(html).toContain("Valeur offerte (prix public)");
  });
});

describe("page Activité", () => {
  it("montre synthèse, répartitions, journal, filtres accessibles et export", () => {
    const html = renderActivity(pageData());
    for (const text of [
      "Synthèse",
      "Par jour",
      "Par modèle",
      "Par agent",
      "Par clé",
      "Journal des requêtes",
      "Exporter en CSV",
      "agent/facturation",
      "nexora/grand",
      "Production",
    ])
      expect(html).toContain(text);
    // Chaque filtre est un champ nommé et relié à son libellé.
    for (const id of ["period", "model", "key", "status"]) {
      expect(html).toContain(`id="activity-${id}"`);
      expect(html).toContain(`for="activity-${id}"`);
    }
    expect(html).toContain('method="get"');
    expect(html).toContain('action="/compte/activite"');
    expect(html).toContain('href="/api/account/activity/export?period=30d"');
  });

  it("garde les filtres choisis dans le lien d'export et dans la page suivante", () => {
    const html = renderActivity(
      pageData({
        period: "7d",
        criteria: {
          from: new Date("2026-10-22T15:00:00Z"),
          to: new Date("2026-10-29T15:00:00Z"),
          model: "nexora/grand",
          status: "error",
        },
        page: { rows: [row()], nextCursor: "curseur_-1" },
      }),
    );
    expect(html).toContain(
      "export?period=7d&amp;model=nexora%2Fgrand&amp;status=error",
    );
    expect(html).toContain(
      "/compte/activite?period=7d&amp;model=nexora%2Fgrand&amp;status=error&amp;cursor=curseur_-1",
    );
    expect(html).toContain("Requêtes plus anciennes");
    expect(html).not.toContain("Revenir aux plus récentes");
  });

  it("sur une page suivante : lien pour revenir aux plus récentes", () => {
    const html = renderActivity(pageData({ hasCursor: true }));
    expect(html).toContain("Revenir aux plus récentes");
  });

  it("aucune requête : texte clair, pas de tableau de journal", () => {
    const html = renderActivity(
      pageData({
        summary: {
          ...summary,
          requests: 0,
          errors: 0,
          avgLatencyMs: null,
          costMicro: 0n,
        },
        byDay: [],
        byModel: [],
        byAgent: [],
        byKey: [],
        models: [],
        page: { rows: [], nextCursor: null },
      }),
    );
    expect(html).toContain("Aucune requête ne correspond à ces critères.");
    expect(html).not.toContain("<time");
  });

  it("critères invalides : un avis, sans alarme", () => {
    expect(renderActivity(pageData({ invalid: true }))).toContain(
      "ont été ignorés",
    );
  });

  it("organisation « maison » : la valeur offerte remplace la dépense", () => {
    const html = renderActivity(pageData(), "fr", true);
    expect(html).toContain("Valeur offerte (prix public)");
    expect(html).not.toContain(">Dépense<");
  });

  it("une requête non facturée est marquée « offert » dans le journal", () => {
    const html = renderActivity(
      pageData({
        page: {
          rows: [row({ billed: false, costMicro: 0n, valueMicro: 4_000n })],
          nextCursor: null,
        },
      }),
    );
    expect(html).toContain("offert");
    expect(html).toContain("0,004");
  });

  it("n'échappe pas le HTML d'un nom de clé : il est affiché comme du texte", () => {
    const html = renderActivity(
      pageData({
        page: {
          rows: [row({ apiKeyName: "<img src=x onerror=alert(1)>" })],
          nextCursor: null,
        },
      }),
    );
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("anglais", () => {
    const html = renderActivity(pageData(), "en");
    expect(html).toContain("Request log");
    expect(html).toContain("Export as CSV");
    expect(html).toContain('action="/en/compte/activite"');
  });
});

describe("page WorkStudio et agents", () => {
  const t = getAccountDictionary("fr");
  const agents = [
    {
      id: "agent/facturation",
      slug: "facturation",
      nameFr: "Facturation",
      nameEn: "Billing",
      requests: 2,
      lastUsedAt: new Date("2026-10-28T10:00:00Z"),
      costMicro: 5_000n,
    },
  ];
  const render = (view: ReturnType<typeof workstudioView>, list = agents) =>
    renderToStaticMarkup(
      <WorkstudioPanel lang="fr" t={t} view={view} agents={list} />,
    );

  it("prêt : bouton « Ouvrir WorkStudio » vers l'adresse de l'instance", () => {
    const html = render({
      state: "ready",
      url: "https://studio.nexora.example",
    });
    expect(html).toContain("Ouvrir WorkStudio");
    expect(html).toContain('href="https://studio.nexora.example"');
  });

  it("adresse inconnue : « Votre instance est en préparation », aucun bouton d'ouverture", () => {
    const html = render({ state: "pending" });
    expect(html).toContain("Votre instance est en préparation.");
    expect(html).not.toContain("Ouvrir WorkStudio");
  });

  it("sans abonnement ou suspendu : aucun bouton d'ouverture, un chemin pour régler la situation", () => {
    const none = render({ state: "no_subscription" });
    expect(none).not.toContain("Ouvrir WorkStudio");
    expect(none).toContain("Voir les offres");
    const suspended = render({ state: "suspended" });
    expect(suspended).not.toContain("Ouvrir WorkStudio");
    expect(suspended).toContain("suspendu");
  });

  it("liste les agents appelés ; sinon une phrase honnête", () => {
    expect(render({ state: "pending" })).toContain("agent/facturation");
    expect(render({ state: "pending" }, [])).toContain(
      "Aucun agent appelé pour l’instant.",
    );
  });
});

describe("navigation du panneau", () => {
  const t = getAccountDictionary("fr");
  const render = (appsAvailable: boolean, lang: "fr" | "en" = "fr") =>
    renderToStaticMarkup(
      <PanelNav
        lang={lang}
        label={t.panel.nav.label}
        soonLabel={t.panel.nav.soon}
        items={getAccountDictionary(lang).panel.nav.items}
        appsAvailable={appsAvailable}
      />,
    );

  it("huit entrées dans une navigation nommée ; Nexora Apps renvoie à /apps quand la page existe", () => {
    const html = render(true);
    expect(html).toContain('aria-label="Espace client"');
    for (const text of [
      "Aperçu",
      "Modèles et clés",
      "Activité",
      "WorkStudio et agents",
      "Cloud et VPS",
      "Nexora Apps",
      "Portefeuille",
      "Sécurité",
    ])
      expect(html).toContain(text);
    expect(html).toContain('href="/apps"');
    expect(html).toContain('href="/compte/activite"');
    expect(html).toContain('href="/compte/vps"');
    expect(html).not.toContain("Bientôt");
  });

  it("tant que /apps n'existe pas : « Bientôt », sans lien", () => {
    const html = render(false);
    expect(html).toContain("Bientôt");
    expect(html).not.toContain('href="/apps"');
  });

  it("anglais : adresses préfixées", () => {
    const html = render(true, "en");
    expect(html).toContain('href="/en/compte/activite"');
    expect(html).toContain('href="/en/apps"');
  });
});

describe("page Modèles : identifiant à copier et lien vers la fiche", () => {
  const model: PublicModel = {
    id: "nexora/glm-5-3",
    name: "GLM 5.3",
    descriptionFr: "",
    descriptionEn: "",
    kind: "chat",
    availability: "live",
    contextMax: 128_000,
    maxOutputTokens: null,
    capabilities: {},
    residency: "quebec",
    providerName: "Fournisseur",
    dataPolicyFr: "",
    dataPolicyEn: "",
    inputPerMillion: "0.6",
    outputPerMillion: "2.4",
    cachePerMillion: null,
    cacheWritePerMillion: null,
    priceWindows: [],
    sheet: {},
    note: "",
    sunsetAt: null,
  };
  const catalog = (models: PublicModel[], available = true): PublicCatalog => ({
    models,
    publishedAt: null,
    version: null,
    available,
  });
  const render = (c: PublicCatalog, lang: "fr" | "en" = "fr") =>
    renderToStaticMarkup(
      <ModelsPanel lang={lang} t={getAccountDictionary(lang)} catalog={c} />,
    );

  it("chaque modèle : identifiant visible, bouton « Copier l'identifiant » nommé, lien vers sa fiche", () => {
    const html = render(catalog([model])).replace(/[\u00a0\u202f]/g, " ");
    expect(html).toContain("nexora/glm-5-3");
    expect(html).toContain("Copier l’identifiant");
    expect(html).toContain('aria-label="Copier l’identifiant nexora/glm-5-3"');
    expect(html).toContain('href="/modeles/nexora/glm-5-3"');
    expect(html).toContain('href="/modeles"');
    expect(html).toContain("0,60 $");
    expect(html).toContain("2,40 $");
  });

  it("anglais : liens préfixés", () => {
    const html = render(catalog([model]), "en");
    expect(html).toContain('href="/en/modeles/nexora/glm-5-3"');
    expect(html).toContain("Copy identifier");
  });

  it("catalogue vide ou indisponible : une phrase, aucun bouton de copie", () => {
    const html = render(catalog([], false));
    expect(html).toContain("n’est pas disponible");
    expect(html).not.toContain("Copier l’identifiant");
  });
});

describe("WorkStudio : branchement sur un modèle", () => {
  const t = getAccountDictionary("fr");
  const base = {
    model: "nexora/deepseek-v4.1-flash-1017",
    free: false,
    availableMicro: 12_345_678n,
    owner: true,
  };
  const html = (
    connection: Parameters<typeof WorkstudioPanel>[0]["connection"],
  ) =>
    renderToStaticMarkup(
      <WorkstudioPanel
        lang="fr"
        t={t}
        view={{ state: "ready", url: "https://studio.nexora.example" }}
        agents={[]}
        connection={connection}
      />,
    );

  it("clé automatique active : modèle par défaut, préfixe (jamais la clé), solde et lien vers l'activité de cette clé", () => {
    const out = html({
      ...base,
      link: {
        id: "11111111-1111-4111-8111-111111111111",
        prefix: "nxk_abcdefg",
        createdAt: new Date("2026-10-01T12:00:00Z"),
        lastUsedAt: new Date("2026-10-28T12:00:00Z"),
      },
    });
    expect(out).toContain("Branché : WorkStudio utilise votre portefeuille.");
    expect(out).toContain("nexora/deepseek-v4.1-flash-1017");
    expect(out).toContain("nxk_abcdefg…");
    expect(out).toContain("12,3457");
    expect(out).toContain(
      'href="/compte/activite?key=11111111-1111-4111-8111-111111111111"',
    );
    expect(out).toContain("Ajouter des fonds");
  });

  it("pas encore de clé : le dit, rien à régler", () => {
    const out = html({ ...base, link: null });
    expect(out).toContain("Pas encore branché");
    expect(out).toContain("rien à régler");
  });

  it("organisation maison : aucun jeton facturé, pas de bouton d'ajout de fonds", () => {
    const out = html({ ...base, link: null, free: true });
    expect(out).toContain("aucun jeton n’est facturé");
    expect(out).not.toContain("Ajouter des fonds");
  });
});

describe("page Activité : détail d'une requête", () => {
  it("le journal lie chaque requête à son détail (adresse localisée)", () => {
    const fr = renderActivity(pageData());
    expect(fr).toContain(
      'href="/compte/activite/requete?id=11111111-1111-4111-8111-111111111111"',
    );
    const en = renderActivity(pageData(), "en");
    expect(en).toContain(
      'href="/en/compte/activite/requete?id=11111111-1111-4111-8111-111111111111"',
    );
  });

  const detail: ActivityDetail = {
    id: "11111111-1111-4111-8111-111111111111",
    requestId: "req_abc123",
    createdAt: new Date("2026-10-28T12:00:00Z"),
    model: "nexora/deepseek-v4.1-flash-1017",
    endpoint: "chat.completions",
    apiKeyId: "22222222-2222-4222-8222-222222222222",
    apiKeyName: "Production",
    apiKeyPrefix: "nxk_abcdefg",
    status: "ok",
    httpStatus: 200,
    errorCode: null,
    stream: true,
    promptTokens: 1200,
    completionTokens: 300,
    cachedTokens: 200,
    cacheWriteTokens: 0,
    reasoningTokens: 40,
    costMicro: 9100n,
    valueMicro: 9100n,
    billed: true,
    priceInputMicro: 462_825n,
    priceOutputMicro: 1_851_300n,
    priceCacheMicro: 9000n,
    priceCacheWriteMicro: null,
    priceWindow: "creux",
    latencyMs: 850,
    privacyDecision: "mask",
    destinationHost: null,
  };
  const render = (d: ActivityDetail | null, lang: "fr" | "en" = "fr") =>
    renderToStaticMarkup(
      <RequestDetail lang={lang} t={getAccountDictionary(lang)} detail={d} />,
    );

  it("montre jetons, prix appliqués, coût, délai et décision de confidentialité ; jamais de contenu", () => {
    const html = render(detail);
    expect(html).toContain("req_abc123");
    expect(html).toContain("nexora/deepseek-v4.1-flash-1017");
    expect(html).toContain("Flux continu");
    expect(html).toContain("0,0091");
    expect(html).toContain("0,4628");
    expect(html).toContain("Renseignements évidents masqués");
    expect(html).toContain("Plage horaire : creux");
    expect(html).toContain("n’est jamais conservé");
    expect(html).not.toMatch(/prompt|completion\b/i);
  });

  it("organisation maison : la valeur offerte, pas un coût facturé", () => {
    const html = render({ ...detail, billed: false, costMicro: 0n });
    expect(html).toContain("Valeur au prix public (offerte)");
    expect(html).not.toContain("Coût facturé");
  });

  it("introuvable : message clair et retour à l'activité ; anglais", () => {
    const html = render(null);
    expect(html).toContain("introuvable");
    expect(html).toContain('href="/compte/activite"');
    expect(render(detail, "en")).toContain("Streamed");
  });
});

describe("page Activité : période par dates", () => {
  it("le formulaire offre « Du » et « Au », vides pour une période prédéfinie", () => {
    const html = renderActivity(pageData());
    expect(html).toContain('name="fromDay"');
    expect(html).toContain('name="toDay"');
    expect(html).not.toMatch(/name="fromDay"[^>]*value="2/);
  });
  it("période personnalisée : les dates actuelles (jours de Montréal, fin incluse) sont reprises", () => {
    const html = renderActivity(
      pageData({
        period: "custom",
        criteria: {
          from: new Date("2026-10-01T04:00:00Z"),
          to: new Date("2026-10-08T04:00:00Z"),
        },
      }),
    );
    expect(html).toMatch(/name="fromDay"[^>]*value="2026-10-01"/);
    expect(html).toMatch(/name="toDay"[^>]*value="2026-10-07"/);
  });
});
