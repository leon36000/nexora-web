import { randomBytes } from "node:crypto";
import { eq, modelPrices, modelProviders, models } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadKeyring } from "../vault/crypto";
import { putSecret } from "../vault/store";
import {
  addFxRate,
  approveFxRate,
  createDraftVersion,
  updateModel,
} from "./catalog";
import { AI_MODEL_DRAFTS, PROVIDERS, seedAiModels } from "./catalog-ia-seed";
import { modelRoutingSchema, modelSheetSchema } from "./sheet";

const byId = (id: string) => {
  const m = AI_MODEL_DRAFTS.find((d) => d.model.publicId === id);
  if (!m) throw new Error(`modèle absent : ${id}`);
  return m;
};

describe("les cinq modèles du fondateur", () => {
  it("sont exactement ceux demandés, chez leur fournisseur d'origine, avec leur équivalent OpenRouter", () => {
    expect(
      AI_MODEL_DRAFTS.map((d) => [
        d.model.publicId,
        d.providerCode,
        d.model.upstreamId,
        d.openrouterId,
      ]),
    ).toEqual([
      [
        "nexora/deepseek-v4.1-flash-1017",
        "deepseek",
        "deepseek-flash",
        "deepseek/deepseek-v4.1-flash-1017",
      ],
      ["nexora/glm-5.3", "zai", "glm-5.3", "z-ai/glm-5.3"],
      ["nexora/glm-5.3-flash", "zai", "glm-5.3-flash", "z-ai/glm-5.3-flash"],
      [
        "nexora/minimax-m3.1-flash",
        "minimax",
        "MiniMax-M3.1-Flash",
        "minimax/minimax-m3.1-flash",
      ],
      [
        "nexora/kimi-k3.1-pro",
        "moonshot",
        "kimi-k3.1-pro",
        "moonshotai/kimi-k3.1-pro",
      ],
    ]);
  });

  it("portent les prix officiels du fournisseur d'origine, en micro-USD par million de jetons", () => {
    const p = (id: string) => byId(id).reference;
    expect(p("nexora/glm-5.3")).toMatchObject({
      input: 1_400_000n,
      output: 4_400_000n,
      cache: 260_000n,
    });
    expect(p("nexora/glm-5.3-flash")).toMatchObject({
      input: 150_000n,
      output: 500_000n,
      cache: 30_000n,
    });
    expect(p("nexora/minimax-m3.1-flash")).toMatchObject({
      input: 150_000n,
      output: 600_000n,
      cache: 15_000n,
    });
    expect(p("nexora/kimi-k3.1-pro")).toMatchObject({
      input: 2_000_000n,
      output: 10_000_000n,
      cache: 200_000n,
    });
    // DeepSeek : tarif de pointe par défaut (le plus cher), le tarif creux viendra avec G1
    expect(p("nexora/deepseek-v4.1-flash-1017")).toMatchObject({
      input: 300_000n,
      output: 1_200_000n,
      cache: 6_000n,
    });
  });

  it("ont une fiche et un routage valides", () => {
    for (const d of AI_MODEL_DRAFTS) {
      expect(
        () => modelSheetSchema.parse(d.model.sheet),
        d.model.publicId,
      ).not.toThrow();
      expect(
        () => modelRoutingSchema.parse(d.model.routing),
        d.model.publicId,
      ).not.toThrow();
    }
  });

  it("refusent la collecte des données et plafonnent le prix à la référence", () => {
    for (const d of AI_MODEL_DRAFTS) {
      expect(d.model.routing?.dataCollection).toBe("deny");
      expect(d.model.routing?.maxPriceUsdMicro).toEqual({
        input: d.reference.input.toString(),
        output: d.reference.output.toString(),
      });
    }
  });

  it("ne montrent aucun chiffre sans éditeur ni source", () => {
    for (const d of AI_MODEL_DRAFTS)
      for (const b of d.model.sheet?.benchmarks ?? []) {
        expect(b.publisher.length, d.model.publicId).toBeGreaterThan(0);
        expect(b.sourceUrl.startsWith("https://")).toBe(true);
      }
  });

  it("n'inventent pas de mesure pour Kimi K3.1 Pro (aucune n'est publiée)", () => {
    const k = byId("nexora/kimi-k3.1-pro").model;
    expect(k.sheet?.benchmarks ?? []).toEqual([]);
    expect(k.sheet?.notesFr).toMatch(/aucun benchmark/i);
  });

  it("déclarent les capacités et les poids ouverts comme sur les pages officielles", () => {
    expect(byId("nexora/glm-5.3").model.capabilities?.vision).toBe(false);
    expect(byId("nexora/glm-5.3-flash").model.capabilities?.vision).toBe(true);
    expect(byId("nexora/kimi-k3.1-pro").model.sheet?.license?.openWeights).toBe(
      false,
    );
    expect(
      byId("nexora/deepseek-v4.1-flash-1017").model.sheet?.license,
    ).toMatchObject({ name: "MIT", openWeights: true });
    expect(byId("nexora/glm-5.3-flash").model.sheet?.parameters).toEqual({
      totalB: 320,
      activeB: 18,
    });
  });

  it("ont un fournisseur déclaré par modèle, avec une clé à saisir dans le coffre", () => {
    const codes = PROVIDERS.map((p) => p.code);
    for (const d of AI_MODEL_DRAFTS) expect(codes).toContain(d.providerCode);
    expect(PROVIDERS.find((p) => p.code === "zai")).toMatchObject({
      type: "openai_compatible",
      baseUrl: "https://api.z.ai/api/paas/v4",
      secretRef: "llm.zai",
    });
    // OpenRouter n'est qu'une route de secours : désactivée tant qu'on n'y met pas de clé
    expect(PROVIDERS.find((p) => p.code === "openrouter")).toMatchObject({
      type: "openrouter",
      enabled: false,
      secretRef: "llm.openrouter",
    });
  });
});

describe("chargement dans la base", () => {
  let t: TestDatabase;
  const keyring = loadKeyring({
    NEXORA_VAULT_MASTER_KEY: randomBytes(32).toString("base64"),
  });
  beforeAll(async () => {
    t = await createTestDatabase();
    const fx = await addFxRate(t.db, {
      usdToCadMicro: 1_400_000n,
      effectiveAt: new Date(Date.now() - 1000),
    });
    await approveFxRate(t.db, fx.id, "test");
  });
  afterAll(async () => {
    await t.drop();
  });

  it("crée le fournisseur et les cinq modèles en BROUILLON avec la marge de 10 %", async () => {
    const out = await seedAiModels(t.db);
    expect(out.created).toHaveLength(5);
    const rows = await t.db.select().from(models);
    expect(rows).toHaveLength(5);
    expect(rows.every((m) => m.status === "draft")).toBe(true);
    const prices = await t.db.select().from(modelPrices);
    expect(prices).toHaveLength(5);
    // GLM 5.3 : 1,40 USD × 1,40 (taux) × 1,10 = 2,156 CAD par million de jetons d'entrée
    const glm = rows.find((m) => m.publicId === "nexora/glm-5.3");
    const price = prices.find((p) => p.modelId === glm?.id);
    expect(price?.sellInputCadMicro).toBe(2_156_000n);
    expect(price?.marginBps).toBe(1000);
    expect(price?.marginFloorBps).toBe(1000);
  });

  it("est rejouable sans rien dupliquer ni toucher à l'existant", async () => {
    const again = await seedAiModels(t.db);
    expect(again.created).toEqual([]);
    expect(await t.db.select().from(models)).toHaveLength(5);
    expect(await t.db.select().from(modelPrices)).toHaveLength(5);
  });

  it("remet à jour un brouillon resté sur l'ancienne route, sans toucher à un modèle approuvé", async () => {
    const [openrouter] = await t.db
      .select()
      .from(modelProviders)
      .where(eq(modelProviders.code, "openrouter"));
    const [zai] = await t.db
      .select()
      .from(modelProviders)
      .where(eq(modelProviders.code, "zai"));
    const [glm] = await t.db
      .select()
      .from(models)
      .where(eq(models.publicId, "nexora/glm-5.3"));
    const [flash] = await t.db
      .select()
      .from(models)
      .where(eq(models.publicId, "nexora/glm-5.3-flash"));
    // GLM 5.3 : brouillon resté chez OpenRouter ; GLM 5.3 Flash : approuvé, on n'y touche pas
    await t.db
      .update(models)
      .set({ providerId: openrouter?.id as string, upstreamId: "z-ai/glm-5.3" })
      .where(eq(models.id, glm?.id as string));
    await t.db
      .update(models)
      .set({ status: "approved", upstreamId: "choix-manuel" })
      .where(eq(models.id, flash?.id as string));
    const out = await seedAiModels(t.db);
    expect(out.updated).toContain("nexora/glm-5.3");
    expect(out.updated).not.toContain("nexora/glm-5.3-flash");
    const [after] = await t.db
      .select()
      .from(models)
      .where(eq(models.id, glm?.id as string));
    expect(after?.providerId).toBe(zai?.id);
    expect(after?.upstreamId).toBe("glm-5.3");
    const [kept] = await t.db
      .select()
      .from(models)
      .where(eq(models.id, flash?.id as string));
    expect(kept?.upstreamId).toBe("choix-manuel");
    await t.db
      .update(models)
      .set({ status: "draft" })
      .where(eq(models.id, flash?.id as string));
    await seedAiModels(t.db);
  });

  it("refuse de charger sans taux de change approuvé, sans rien écrire", async () => {
    const empty = await createTestDatabase();
    try {
      await expect(seedAiModels(empty.db)).rejects.toMatchObject({
        code: "fx_missing",
      });
      expect(await empty.db.select().from(models)).toHaveLength(0);
    } finally {
      await empty.drop();
    }
  });

  it("n'est pas publiable tant que les clés des fournisseurs ne sont pas dans le coffre", async () => {
    const rows = await t.db.select().from(models);
    for (const m of rows) {
      await updateModel(t.db, m.id, { status: "approved" });
      await updateModel(t.db, m.id, { status: "published" });
    }
    const sans = await createDraftVersion(t.db);
    expect(sans.issues.some((i) => i.code === "secret_missing")).toBe(true);

    for (const code of ["deepseek", "zai", "minimax", "moonshot"])
      await putSecret(t.db, keyring, {
        ref: `llm.${code}`,
        value: `sk-test-${code}-xxxxxxxxxxxxxxxx`,
        kind: "llm_provider",
      });
    const avec = await createDraftVersion(t.db);
    expect(avec.issues.filter((i) => i.code === "secret_missing")).toEqual([]);
  });
});
