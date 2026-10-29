import { randomBytes } from "node:crypto";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type CallResult,
  parseApiError,
} from "../../../../cms/extensions-src/nexora-cms/src/catalog/module/errors";
import {
  emptyModelForm,
  formToBody,
  modelToForm,
  sheetExtras,
  validateStep,
} from "../../../../cms/extensions-src/nexora-cms/src/catalog/module/model-form";
import {
  buildPriceBody,
  comparePrices,
  emptyPriceForm,
  isSamePrice,
  previewForm,
  priceToForm,
  shapeOfRecord,
} from "../../../../cms/extensions-src/nexora-cms/src/catalog/module/price-form";
import {
  applyPreset,
  emptyProviderForm,
  providerBody,
  providerNextStep,
  validateProviderForm,
} from "../../../../cms/extensions-src/nexora-cms/src/catalog/module/provider-form";
import { publishModel } from "../../../../cms/extensions-src/nexora-cms/src/catalog/module/publish";
import { buildChecklist } from "../../../../cms/extensions-src/nexora-cms/src/catalog/module/readiness";
import {
  emptyRouteForm,
  routeBody,
  validateRouteForm,
} from "../../../../cms/extensions-src/nexora-cms/src/catalog/module/route-form";
import { loadKeyring } from "../vault/crypto";
import { putSecret, readSecret } from "../vault/store";
import { type CatalogAdminDeps, handleCatalogAdmin } from "./admin-handlers";
import { addFxRate, approveFxRate } from "./catalog";
import { DEEPINFRA_PROVIDER, loadDeepinfraCatalog } from "./deepinfra-loader";
import { buildSource } from "./deepinfra-source";

/**
 * Essai de bout en bout des assistants : le CODE DU MODULE (formulaires, validation, corps, orchestration de la
 * publication) parle à la VRAIE API d'administration sur une vraie base, comme le fait le panneau Directus.
 * Aucun script : tout passe par les mêmes appels que l'interface.
 */

const TOKEN = "t".repeat(48);
let t: TestDatabase;
const keyring = loadKeyring({
  NEXORA_VAULT_MASTER_KEY: randomBytes(32).toString("base64"),
});
const seen: { url: string; auth: string | null }[] = [];

const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  seen.push({
    url: url.toString(),
    auth: new Headers(init?.headers).get("authorization"),
  });
  if (url.host === "api.deepinfra.com")
    return Response.json({
      data: [{ id: "meta-llama/Llama-3.3-70B-Instruct" }, { id: "autre" }],
    });
  return Response.json({});
}) as typeof fetch;

const deps = (): CatalogAdminDeps => ({
  db: () => t.db,
  adminToken: TOKEN,
  litellm: () => null,
  getSecret: (ref) => readSecret(t.db, keyring, ref),
  outbound: async (raw) => ({ ok: true, url: new URL(raw), addresses: [] }),
  // Les hôtes de clés par défaut du serveur (dont api.deepinfra.com) restent en vigueur : c'est ce que l'on vérifie.
  fetch: fetchFn,
  log: createLogger({ name: "test", sink: () => {} }),
  now: () => new Date(),
});

/** Le « relais Directus » : mêmes appels, mêmes erreurs lisibles que dans le panneau. */
async function call<T = any>(
  method: string,
  path: string,
  body?: unknown,
): Promise<CallResult<T>> {
  const res = await handleCatalogAdmin(
    new Request(`http://x/api/admin/catalog/${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${TOKEN}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    (path.split("?")[0] ?? "").split("/").filter(Boolean),
    deps(),
  );
  const data = (await res.json()) as T;
  return res.ok
    ? { ok: true, data }
    : {
        ok: false,
        error: parseApiError({ response: { status: res.status, data } }),
      };
}
const must = async <T = any>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> => {
  const r = await call<T>(method, path, body);
  if (!r.ok) throw new Error(`${method} ${path} : ${r.error.text}`);
  return r.data;
};

/** Modèles INVENTÉS pour l'essai (fiche avec mesure sourcée et sources) : le chargement DeepInfra les met en aperçu. */
const fixtureRow = (
  deepinfraId: string,
  extra: Record<string, unknown> = {},
) => ({
  deepinfraId,
  kind: "chat",
  contextMax: 131072,
  quantization: "fp8",
  upstreamInputUsdMicro: 200000,
  upstreamOutputUsdMicro: 600000,
  cacheReadRate: 0.2,
  ...extra,
});
const fixtureFiche = (deepinfraId: string, name: string) => ({
  deepinfraId,
  slug: (deepinfraId.split("/").pop() ?? "").toLowerCase(),
  name,
  descriptionFr: `${name} : modèle d'essai.`,
  descriptionEn: `${name}: test model.`,
  capabilities: { streaming: true, tools: true, reasoning: true },
  maxOutputTokens: 16384,
  sheet: {
    author: "Acme",
    family: "Acme 1",
    tags: ["code", "agents"],
    license: { name: "MIT", openWeights: true },
    parameters: { totalB: 30, activeB: 3 },
    modalities: { input: ["text"], output: ["text"] },
    benchmarks: [
      {
        name: "Épreuve d'essai",
        score: 50,
        unit: "%",
        publisher: "Acme",
        sourceUrl: "https://exemple.test/epreuve",
        category: "Code",
      },
    ],
    sources: [
      {
        label: "Fiche d'essai",
        url: "https://exemple.test/fiche",
        readAt: "2026-10-29",
      },
    ],
  },
});
const loaded = buildSource({
  selection: {
    readAt: "2026-10-29",
    source: "https://api.deepinfra.com/models/list",
    models: [
      fixtureRow("acme/Alpha-30B-A3B"),
      fixtureRow("acme/Beta-8B", {
        upstreamInputUsdMicro: 60000,
        upstreamOutputUsdMicro: 160000,
        cacheReadRate: null,
      }),
    ],
  },
  fiches: [
    {
      file: "alpha-30b-a3b.json",
      raw: fixtureFiche("acme/Alpha-30B-A3B", "Alpha 30B"),
    },
    { file: "beta-8b.json", raw: fixtureFiche("acme/Beta-8B", "Beta 8B") },
  ],
});

beforeAll(async () => {
  t = await createTestDatabase();
  const fx = await addFxRate(t.db, { usdToCadMicro: 1_400_000n });
  await approveFxRate(t.db, fx.id, "essai");
  await loadDeepinfraCatalog(t.db, loaded);
});
afterAll(async () => {
  await t.drop();
});

describe("les modèles chargés (DeepInfra, aperçu) dans les assistants", () => {
  it("chaque modèle s'ouvre complètement et se réenregistre sans rien perdre (fiche, mesures, sources, routage, capacités)", async () => {
    const overview = await must("GET", "");
    expect(overview.models).toHaveLength(loaded.entries.length);
    expect(loaded.problems).toEqual([]);
    for (const draft of loaded.entries) {
      const record = overview.models.find(
        (m: { publicId: string }) => m.publicId === draft.publicId,
      );
      expect(record, draft.publicId).toBeDefined();
      const form = modelToForm(record);
      // Les étapes de l'assistant acceptent le modèle tel quel.
      const others = overview.models.map(
        (m: { publicId: string }) => m.publicId,
      );
      for (const step of ["sheet", "provider"] as const)
        expect(
          validateStep(step, form, others),
          `${draft.publicId} / ${step}`,
        ).toEqual({});
      const body = formToBody(form, record);
      expect(body.sheet).toEqual(record.sheet);
      expect(body.routing).toEqual(record.routing);
      expect(body.capabilities).toEqual(record.capabilities);
      expect(body).toMatchObject({
        name: record.name,
        descriptionFr: record.descriptionFr,
        descriptionEn: record.descriptionEn,
        contextMax: record.contextMax,
        maxOutputTokens: record.maxOutputTokens,
        upstreamId: record.upstreamId,
        providerId: record.providerId,
        residency: record.residency,
        visibility: record.visibility,
      });
      // Les mesures et sources sont affichées (lecture seule), une ligne chacune.
      const extras = sheetExtras(record.sheet);
      expect(extras.benchmarks).toHaveLength(
        draft.sheet.benchmarks?.length ?? 0,
      );
      expect(extras.sources).toHaveLength(draft.sheet.sources?.length ?? 0);
      // Et la fiche enregistrée est acceptée telle quelle par l'API (aucune perte, aucune valeur refusée).
      await must("PATCH", `models/${record.id}`, body);
    }
  });

  it("l'écran des prix rouvre chaque prix de départ à l'identique : ventes, plages horaires, cache écrit ; aucune version parasite", async () => {
    const fx = (await must("GET", "")).currentFx.usdToCadMicro;
    for (const draft of loaded.entries) {
      const overview = await must("GET", "");
      const model = overview.models.find(
        (m: { publicId: string }) => m.publicId === draft.publicId,
      );
      const { prices } = await must("GET", `models/${model.id}/prices`);
      const current = prices[0];
      const form = priceToForm(current, BigInt(fx));
      const preview = previewForm(form, {
        fxMicro: BigInt(fx),
        kind: model.kind,
      });
      expect(preview.problems, draft.publicId).toEqual([]);
      expect(preview.ok, draft.publicId).toBe(true);
      expect(preview.shape).not.toBeNull();
      expect(
        isSamePrice(shapeOfRecord(current), preview.shape),
        `${draft.publicId} : prix identique`,
      ).toBe(true);
      const body = buildPriceBody(form, preview) as Record<string, unknown>;
      // Les montants envoyés sont exactement ceux enregistrés.
      expect(body.sellInputCadMicro).toBe(current.sellInputCadMicro);
      expect(body.sellOutputCadMicro).toBe(current.sellOutputCadMicro);
      expect(body.sellCacheWriteCadMicro ?? null).toBe(
        current.sellCacheWriteCadMicro,
      );
      expect(((body.windows as unknown[]) ?? []).length).toBe(
        current.windows.length,
      );
      // Rien à comparer : toutes les lignes sont inchangées.
      for (const row of comparePrices(
        shapeOfRecord(current),
        preview.shape,
        BigInt(fx),
      ))
        expect(row.sellDeltaBps ?? 0).toBe(0);
    }
  });
});

describe("DeepInfra chargé : clé, ajout d'un modèle, route de secours et publication, entièrement par l'interface", () => {
  let providerId = "";
  let modelId = "";

  it("fournisseur : DeepInfra chargé par le script (actif, clé absente), clé déposée, test de connexion ; le départ rapide de l'assistant décrit le même fournisseur", async () => {
    const form = applyPreset(emptyProviderForm(), "deepinfra");
    // Le départ rapide et le chargement parlent du même fournisseur (adresse, type, référence du Coffre).
    expect(providerBody(form)).toMatchObject({
      name: DEEPINFRA_PROVIDER.name,
      type: DEEPINFRA_PROVIDER.type,
      baseUrl: DEEPINFRA_PROVIDER.baseUrl,
      secretRef: DEEPINFRA_PROVIDER.secretRef,
      code: DEEPINFRA_PROVIDER.code,
    });
    // Le code est déjà pris : l'assistant le dit avant tout envoi.
    expect(
      validateProviderForm(
        form,
        (await must("GET", "providers")).providers.map(
          (p: { code: string }) => p.code,
        ),
      ).code,
    ).toContain("déjà pris");
    const existing = (await must("GET", "providers")).providers.find(
      (p: { code: string }) => p.code === "deepinfra",
    );
    providerId = existing.id;
    expect(existing.enabled).toBe(true);

    let provider = existing;
    expect(provider.secretPresent).toBe(false);
    expect(providerNextStep(provider).id).toBe("secret");

    // Le test sans clé en place échoue avec une phrase claire (clé introuvable dans le coffre).
    const early = await must("POST", `providers/${providerId}/test`);
    expect(early.ok).toBe(false);
    expect(early.detail).toContain("coffre");

    // Dépôt de la clé par le module « Coffre » (ici directement dans le coffre de l'app).
    await putSecret(t.db, keyring, {
      ref: "llm.deepinfra",
      value: "sk-di-secret-0001",
      kind: "llm_provider",
    });
    provider = (await must("GET", "providers")).providers.find(
      (p: { id: string }) => p.id === providerId,
    );
    expect(provider.secretPresent).toBe(true);
    expect(providerNextStep(provider).id).toBe("test");

    const test = await must("POST", `providers/${providerId}/test`);
    expect(test.ok).toBe(true);
    expect(test.detail).toContain("2 modèle(s)");
    // La liste est interrogée à la bonne adresse, avec la clé du coffre, vers l'hôte déclaré.
    const probe = seen.find((s) => s.url.includes("deepinfra"));
    expect(probe?.url).toBe("https://api.deepinfra.com/v1/openai/models");
    expect(probe?.auth).toBe("Bearer sk-di-secret-0001");
    expect(JSON.stringify(test)).not.toContain("sk-di-secret");

    provider = (await must("GET", "providers")).providers.find(
      (p: { id: string }) => p.id === providerId,
    );
    expect(providerNextStep(provider).id).toBe("ready");
  });

  it("modèle : fiche, fournisseur, prix en dollars américains avec aperçu en dollars canadiens, route de secours, contrôles préalables, publication", async () => {
    const providers = (await must("GET", "providers")).providers;
    const openrouter = providers.find(
      (p: { code: string }) => p.code === "openrouter",
    );
    const model = {
      ...emptyModelForm(),
      publicId: "nexora/llama-3.3-70b-deepinfra",
      name: "Llama 3.3 70B (DeepInfra)",
      family: "Llama 3",
      releasedAt: "2024-12-06",
      licenseName: "Llama 3.3 Community",
      openWeights: "open" as const,
      totalB: "70",
      contextMax: "131072",
      inputModalities: ["text" as const],
      outputModalities: ["text" as const],
      capabilities: { streaming: true, tools: true },
      providerId,
      upstreamId: "meta-llama/Llama-3.3-70B-Instruct",
      dataCollection: "deny" as const,
    };
    const existingIds = (await must("GET", "")).models.map(
      (m: { publicId: string }) => m.publicId,
    );
    for (const step of ["identity", "sheet", "provider"] as const)
      expect(validateStep(step, model, existingIds)).toEqual({});
    const created = await must("POST", "models", formToBody(model, null));
    modelId = created.id;
    expect(created.status).toBe("draft");

    // Prix : 0,23 $ US en entrée, 0,40 $ US en sortie -> vente calculée avec la marge de 10 %.
    const fx = BigInt((await must("GET", "")).currentFx.usdToCadMicro);
    const form = {
      ...emptyPriceForm((await must("GET", "")).defaults),
      upIn: "0,23",
      upOut: "0,40",
    };
    const preview = previewForm(form, { fxMicro: fx, kind: "chat" });
    expect(preview.ok).toBe(true);
    expect(preview.base.sell).toMatchObject({
      input: 354_200n,
      output: 616_000n,
    });
    const price = await must(
      "POST",
      `models/${modelId}/prices`,
      buildPriceBody(form, preview),
    );
    expect(price.sellInputCadMicro).toBe("354200");
    expect(price.marginFloorBps).toBe(1000);

    // Route de secours chez OpenRouter (désactivé, sans clé) avec son propre coût.
    const routeForm = {
      ...emptyRouteForm(),
      providerId: openrouter.id,
      upstreamId: "meta-llama/llama-3.3-70b-instruct",
      upIn: "0,10",
      upOut: "0,30",
    };
    expect(validateRouteForm(routeForm)).toEqual({});
    const route = await must(
      "POST",
      `models/${modelId}/routes`,
      routeBody(routeForm),
    );
    expect(route.position).toBe(1);

    // Contrôles préalables : la route n'est pas prête (fournisseur désactivé, clé absente) : la publication est refusée.
    let readiness = await must("GET", `models/${modelId}/readiness`);
    expect(readiness.ready).toBe(false);
    const checklist = buildChecklist(readiness, {
      secretRef: "llm.deepinfra",
      hasRoutes: true,
    });
    expect(checklist.filter((c) => !c.ok).map((c) => c.id)).toEqual(["routes"]);
    expect(checklist.find((c) => c.id === "secret")?.ok).toBe(true);
    const refused = await publishModel(
      call,
      { id: modelId, publicId: model.publicId, status: "draft" },
      { sync: false },
    );
    expect(refused).toMatchObject({ ok: false });
    const status = (await must("GET", `models/${modelId}`)).status;
    // la garde refuse dès l'approbation du modèle : rien n'a bougé
    expect(status).toBe("draft");
    if (!refused.ok) {
      expect(refused).toMatchObject({ failedStep: "model_approved" });
      expect(refused.error.issues.map((i) => i.code)).toContain(
        "route_provider_disabled",
      );
    }

    // On désactive la route : tout est prêt, la publication réussit.
    await must("PATCH", `routes/${route.id}`, { enabled: false });
    readiness = await must("GET", `models/${modelId}/readiness`);
    expect(readiness.issues).toEqual([]);
    const current = await must("GET", `models/${modelId}`);
    const steps: string[] = [];
    const out = await publishModel(
      call,
      { id: modelId, publicId: model.publicId, status: current.status },
      { sync: false },
      (s) => steps.push(s),
    );
    expect(out).toMatchObject({ ok: true, unchanged: false });
    expect(steps.at(-1)).toBe("version_published");

    // Le catalogue publié contient le sixième modèle.
    const overview = await must("GET", "");
    const live = await must("GET", `versions/${overview.published.id}`);
    expect(
      live.version.snapshot.models.map((m: { publicId: string }) => m.publicId),
    ).toContain(model.publicId);
    // Rejouer la publication ne crée rien de nouveau.
    const again = await publishModel(
      call,
      { id: modelId, publicId: model.publicId, status: "published" },
      { sync: false },
    );
    expect(again).toMatchObject({ ok: true, unchanged: true });
  });

  it("nouvelle version de prix : le plancher refuse une vente trop basse, le nouveau prix passe, l'ancien reste dans l'historique", async () => {
    const fx = BigInt((await must("GET", "")).currentFx.usdToCadMicro);
    const { prices } = await must("GET", `models/${modelId}/prices`);
    const current = prices[0];
    const form = priceToForm(current, fx);
    // Hausse du coût d'entrée à 0,30 $ US en gardant la vente à 0,3542 $ CA : sous le plancher, refusé et expliqué.
    const stuck = previewForm(
      { ...form, upIn: "0,30", sellIn: "0,3542" },
      { fxMicro: fx, kind: "chat" },
    );
    expect(stuck.ok).toBe(false);
    expect(buildPriceBody(form, stuck)).toBeNull();
    expect(stuck.problems.join(" ")).toContain("sous le plancher");
    const rows = comparePrices(shapeOfRecord(current), stuck.shape, fx);
    expect(rows.find((r) => r.dim === "input")?.newMarginBps).toBeLessThan(
      1000,
    );
    // La garde du serveur est du même avis : la vente forcée à cette valeur serait refusée à la publication.
    // Ventes automatiques : acceptées.
    const fine = previewForm(
      { ...form, upIn: "0,30" },
      { fxMicro: fx, kind: "chat" },
    );
    expect(fine.ok).toBe(true);
    await must("POST", `models/${modelId}/prices`, buildPriceBody(form, fine));
    const after = await must("GET", `models/${modelId}/prices`);
    expect(after.prices).toHaveLength(2);
    expect(after.prices[1].id).toBe(current.id);
    expect(after.prices[0].sellInputCadMicro).toBe("462000");
  });
});
