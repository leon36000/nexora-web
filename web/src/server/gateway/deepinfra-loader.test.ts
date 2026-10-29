import { randomBytes } from "node:crypto";
import {
  count,
  eq,
  modelPrices,
  modelProviders,
  modelRoutes,
  models,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadKeyring } from "../vault/crypto";
import { putSecret } from "../vault/store";
import {
  addFxRate,
  addPrice,
  approveFxRate,
  createModel,
  createProvider,
  currentPrice,
  getPublishedCatalog,
  listVersions,
  updateModel,
} from "./catalog";
import {
  DEEPINFRA_PROVIDER,
  DIRECT_PROVIDER_CODES,
  loadDeepinfraCatalog,
  OPENROUTER_PROVIDER,
} from "./deepinfra-loader";
import { buildSource, type Source } from "./deepinfra-source";

/** Données INVENTÉES pour les essais : rien de ceci n'est dans le dépôt, hors tests. */
const rows = {
  glm: {
    deepinfraId: "zai-org/GLM-5.3",
    kind: "chat",
    contextMax: 1048576,
    quantization: "fp4",
    upstreamInputUsdMicro: 900000,
    upstreamOutputUsdMicro: 4000000,
    cacheReadRate: 0.22222222,
  },
  eclair: {
    deepinfraId: "acme/Eclair-7B-Instruct",
    kind: "chat",
    contextMax: 131072,
    quantization: "fp8",
    upstreamInputUsdMicro: 200000,
    upstreamOutputUsdMicro: 600000,
    cacheReadRate: 0.22222222,
  },
  vecteur: {
    deepinfraId: "acme/Vecteur-Embed-1B",
    kind: "embedding",
    contextMax: 8192,
    quantization: null,
    upstreamInputUsdMicro: 20000,
    upstreamOutputUsdMicro: null,
    cacheReadRate: null,
  },
  sansFiche: {
    deepinfraId: "acme/Sans-Fiche-1B",
    kind: "chat",
    contextMax: 8192,
    quantization: null,
    upstreamInputUsdMicro: 50000,
    upstreamOutputUsdMicro: 100000,
    cacheReadRate: null,
  },
};
const fiche = (
  deepinfraId: string,
  name: string,
  extra: Record<string, unknown> = {},
) => ({
  deepinfraId,
  slug: (deepinfraId.split("/").pop() ?? "").toLowerCase(),
  name,
  descriptionFr: `${name} : modèle d'essai.`,
  descriptionEn: `${name}: test model.`,
  capabilities: { streaming: true, tools: true },
  maxOutputTokens: 8192,
  sheet: {
    author: "Acme",
    license: { openWeights: true },
    sources: [
      {
        label: "Fiche d'essai",
        url: "https://exemple.test/fiche",
        readAt: "2026-10-29",
      },
    ],
  },
  ...extra,
});
const fiches = [
  { file: "glm-5.3.json", raw: fiche("zai-org/GLM-5.3", "GLM 5.3") },
  {
    file: "eclair-7b-instruct.json",
    raw: fiche("acme/Eclair-7B-Instruct", "Éclair 7B"),
  },
  {
    file: "vecteur-embed-1b.json",
    raw: fiche("acme/Vecteur-Embed-1B", "Vecteur Embed", {
      capabilities: { streaming: false },
      maxOutputTokens: undefined,
    }),
  },
];
const sourceOf = (
  selected: Record<string, unknown>[] = [
    rows.glm,
    rows.eclair,
    rows.vecteur,
    rows.sansFiche,
  ],
  list = fiches,
): Source =>
  buildSource({
    selection: {
      readAt: "2026-10-29",
      source: "https://api.deepinfra.com/models/list",
      models: selected,
    },
    fiches: list,
    retraits: {
      retraits: [
        {
          publicId: "nexora/minimax-m3.1-flash",
          noteFr: "Retiré : absent de DeepInfra.",
          noteEn: "Retired: not on DeepInfra.",
        },
        {
          publicId: "nexora/kimi-k3.1-pro",
          noteFr: "Retiré : absent de DeepInfra.",
          noteEn: "Retired: not on DeepInfra.",
        },
      ],
    },
  });

let t: TestDatabase;
const keyring = loadKeyring({
  NEXORA_VAULT_MASTER_KEY: randomBytes(32).toString("base64"),
});
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

async function approvedFx(db = t.db) {
  const fx = await addFxRate(db, {
    usdToCadMicro: 1_400_000n,
    effectiveAt: new Date(Date.now() - 1000),
  });
  await approveFxRate(db, fx.id, "essai");
}
const modelRow = async (db: TestDatabase["db"], publicId: string) => {
  const [row] = await db
    .select()
    .from(models)
    .where(eq(models.publicId, publicId));
  return row;
};
const priceRows = async (db: TestDatabase["db"], modelId: string) =>
  db.select().from(modelPrices).where(eq(modelPrices.modelId, modelId));

describe("fournisseurs du chargement", () => {
  it("DeepInfra : activé, compatible OpenAI, clé du Coffre `llm.deepinfra`, région « autre », politique de données sourcée", () => {
    expect(DEEPINFRA_PROVIDER).toMatchObject({
      code: "deepinfra",
      type: "openai_compatible",
      baseUrl: "https://api.deepinfra.com/v1/openai",
      secretRef: "llm.deepinfra",
      region: "autre",
    });
    expect(DEEPINFRA_PROVIDER.enabled).not.toBe(false);
    // dit ce que la documentation dit (pas de conservation sur disque, pas d'entraînement), y compris l'exception, sans
    // inventer ni pays ni certification
    expect(DEEPINFRA_PROVIDER.dataPolicyFr).toMatch(/disque/);
    expect(DEEPINFRA_PROVIDER.dataPolicyFr).toMatch(/Google/);
    expect(DEEPINFRA_PROVIDER.dataPolicyEn).toMatch(/disk/);
    expect(DEEPINFRA_PROVIDER.dataPolicyEn).toMatch(/Google/);
    const all = `${DEEPINFRA_PROVIDER.dataPolicyFr} ${DEEPINFRA_PROVIDER.dataPolicyEn}`;
    expect(all).not.toMatch(/SOC|ISO|Loi 25|RGPD|GDPR|Québec/i);
  });
  it("OpenRouter : route de secours future, désactivée", () => {
    expect(OPENROUTER_PROVIDER).toMatchObject({
      code: "openrouter",
      type: "openrouter",
      enabled: false,
      secretRef: "llm.openrouter",
    });
  });
  it("les fournisseurs directs du premier chargement sont nommés pour le nettoyage", () => {
    expect([...DIRECT_PROVIDER_CODES].sort()).toEqual([
      "deepseek",
      "minimax",
      "moonshot",
      "zai",
    ]);
  });
});

describe("premier chargement, avec taux de change approuvé", () => {
  it("crée DeepInfra et OpenRouter, les modèles en aperçu public et publie la version sans clé dans le Coffre", async () => {
    await approvedFx();
    const report = await loadDeepinfraCatalog(t.db, sourceOf());
    expect(report.providers.created.sort()).toEqual([
      "deepinfra",
      "openrouter",
    ]);
    expect(report.created.sort()).toEqual([
      "nexora/eclair-7b-instruct",
      "nexora/glm-5.3",
      "nexora/vecteur-embed-1b",
    ]);
    const di = await t.db
      .select()
      .from(modelProviders)
      .where(eq(modelProviders.code, "deepinfra"));
    expect(di[0]).toMatchObject({ enabled: true, region: "autre" });
    const or = await t.db
      .select()
      .from(modelProviders)
      .where(eq(modelProviders.code, "openrouter"));
    expect(or[0]?.enabled).toBe(false);

    const e = await modelRow(t.db, "nexora/eclair-7b-instruct");
    expect(e).toMatchObject({
      upstreamId: "acme/Eclair-7B-Instruct",
      providerId: di[0]?.id,
      availability: "preview",
      visibility: "public",
      status: "published",
      residency: "autre",
      kind: "chat",
      contextMax: 131072,
      maxOutputTokens: 8192,
      name: "Éclair 7B",
    });
    expect(e?.routing).toEqual({});
    expect(e?.sheet.quantization).toBe("fp8");
    expect(e?.sheet.sources?.map((s) => s.url)).toContain(
      "https://api.deepinfra.com/models/list",
    );

    // prix de vente = amont × taux 1,4 × (1 + 10 %), arrondi vers le haut ; plancher 10 %
    const [p] = await priceRows(t.db, e?.id as string);
    expect(p).toMatchObject({
      upstreamInputUsdMicro: 200_000n,
      upstreamOutputUsdMicro: 600_000n,
      upstreamCacheUsdMicro: 44_444n,
      sellInputCadMicro: 308_000n,
      sellOutputCadMicro: 924_000n,
      sellCacheCadMicro: 68_445n,
      marginBps: 1000,
      marginFloorBps: 1000,
    });
    expect(p?.windows).toEqual([]);

    // embeddings : pas de sortie, pas de cache, pas de plafond de sortie
    const v = await modelRow(t.db, "nexora/vecteur-embed-1b");
    expect(v).toMatchObject({ kind: "embedding", maxOutputTokens: null });
    const [vp] = await priceRows(t.db, v?.id as string);
    expect(vp).toMatchObject({
      upstreamOutputUsdMicro: 0n,
      sellOutputCadMicro: 0n,
      sellInputCadMicro: 30_800n,
      sellCacheCadMicro: null,
    });

    // aucune clé n'existe dans le Coffre : la version est quand même publiée, les modèles sont en aperçu
    expect(report.version.status).toBe("published");
    const published = await getPublishedCatalog(t.db);
    const ids = published?.snapshot.models.map((m) => m.publicId).sort();
    expect(ids).toEqual([
      "nexora/eclair-7b-instruct",
      "nexora/glm-5.3",
      "nexora/vecteur-embed-1b",
    ]);
    expect(
      published?.snapshot.models.every((m) => m.availability === "preview"),
    ).toBe(true);
  });

  it("saute le modèle sans fiche en le signalant, sans rien écrire pour lui", async () => {
    expect(await modelRow(t.db, "nexora/sans-fiche-1b")).toBeUndefined();
    const report = await loadDeepinfraCatalog(t.db, sourceOf());
    expect(report.skipped).toEqual([
      expect.objectContaining({
        publicId: "nexora/sans-fiche-1b",
        kind: "fiche_absente",
      }),
    ]);
  });

  it("est rejouable : ni ligne de modèle, ni prix, ni version de plus", async () => {
    const before = {
      models: (await t.db.select({ n: count() }).from(models))[0]?.n,
      prices: (await t.db.select({ n: count() }).from(modelPrices))[0]?.n,
      versions: (await listVersions(t.db)).length,
    };
    const report = await loadDeepinfraCatalog(t.db, sourceOf());
    expect(report.created).toEqual([]);
    expect(report.updated).toEqual([]);
    expect(report.attached).toEqual([]);
    expect(report.priced).toEqual([]);
    expect(report.providers.created).toEqual([]);
    expect(report.version.status).toBe("unchanged");
    expect({
      models: (await t.db.select({ n: count() }).from(models))[0]?.n,
      prices: (await t.db.select({ n: count() }).from(modelPrices))[0]?.n,
      versions: (await listVersions(t.db)).length,
    }).toEqual(before);
  });

  it("un prix amont qui change crée une nouvelle version de prix (l'ancienne reste) et une nouvelle version du catalogue", async () => {
    const e = await modelRow(t.db, "nexora/eclair-7b-instruct");
    const g = await modelRow(t.db, "nexora/glm-5.3");
    const gBefore = (await priceRows(t.db, g?.id as string)).length;
    const changed = {
      ...rows.eclair,
      upstreamInputUsdMicro: 250000,
    };
    const report = await loadDeepinfraCatalog(
      t.db,
      sourceOf([rows.glm, changed, rows.vecteur]),
    );
    expect(report.priced).toEqual(["nexora/eclair-7b-instruct"]);
    const all = await priceRows(t.db, e?.id as string);
    expect(all).toHaveLength(2);
    const now = await currentPrice(t.db, e?.id as string, new Date());
    expect(now?.upstreamInputUsdMicro).toBe(250_000n);
    // le cache suit le taux (0,22222222 × 250 000 = 55 556) et la vente garde 10 %
    expect(now?.upstreamCacheUsdMicro).toBe(55_556n);
    expect(now?.sellInputCadMicro).toBe(385_000n);
    expect((await priceRows(t.db, g?.id as string)).length).toBe(gBefore);
    expect(report.version.status).toBe("published");
    const pub = await getPublishedCatalog(t.db);
    expect(
      pub?.snapshot.models.find(
        (m) => m.publicId === "nexora/eclair-7b-instruct",
      )?.price?.sellInputCadMicro,
    ).toBe("385000");
  });

  it("ne remet pas en aperçu un modèle que l'opérateur a passé en service", async () => {
    const e = await modelRow(t.db, "nexora/eclair-7b-instruct");
    await t.db
      .update(models)
      .set({ availability: "live" })
      .where(eq(models.id, e?.id as string));
    await loadDeepinfraCatalog(
      t.db,
      sourceOf([rows.glm, rows.eclair, rows.vecteur]),
    );
    expect(
      (await modelRow(t.db, "nexora/eclair-7b-instruct"))?.availability,
    ).toBe("live");
    await t.db
      .update(models)
      .set({ availability: "preview" })
      .where(eq(models.id, e?.id as string));
  });

  it("met à jour la fiche d'un modèle déjà chargé quand les données changent, sans toucher à sa visibilité", async () => {
    await t.db
      .update(models)
      .set({ visibility: "unlisted" })
      .where(eq(models.publicId, "nexora/glm-5.3"));
    const report = await loadDeepinfraCatalog(
      t.db,
      sourceOf(
        [rows.glm, rows.eclair, rows.vecteur],
        fiches.map((f) =>
          f.file === "glm-5.3.json"
            ? { ...f, raw: fiche("zai-org/GLM-5.3", "GLM 5.3 (renommé)") }
            : f,
        ),
      ),
    );
    expect(report.updated).toEqual(["nexora/glm-5.3"]);
    const g = await modelRow(t.db, "nexora/glm-5.3");
    expect(g?.name).toBe("GLM 5.3 (renommé)");
    expect(g?.visibility).toBe("unlisted");
    await t.db
      .update(models)
      .set({ visibility: "public" })
      .where(eq(models.publicId, "nexora/glm-5.3"));
  });
});

describe("rattachement des modèles de l'ancien chargement et retraits", () => {
  let db: TestDatabase;
  beforeAll(async () => {
    db = await createTestDatabase();
    await approvedFx(db.db);
    await putSecret(db.db, keyring, {
      ref: "llm.zai",
      value: "sk-zai-essai-xxxxxxxxxxxx",
      kind: "llm_provider",
    });
    const direct = async (code: string) =>
      createProvider(db.db, {
        code,
        name: code,
        type: "openai_compatible",
        baseUrl: `https://api.${code}.test/v1`,
        secretRef: `llm.${code}`,
        region: "autre",
      });
    const zai = await direct("zai");
    const minimax = await direct("minimax");
    const moonshot = await direct("moonshot");
    const deepseek = await direct("deepseek");
    const legacy = async (
      providerId: string,
      publicId: string,
      upstreamId: string,
      status: "draft" | "published" | "retired",
      price: boolean,
    ) => {
      const m = await createModel(db.db, {
        publicId,
        name: publicId,
        providerId,
        upstreamId,
        contextMax: 100_000,
        routing: { dataCollection: "deny", allowFallbacks: true },
      });
      if (price)
        await addPrice(db.db, m.id, {
          upstreamInputUsdMicro: 1_400_000n,
          upstreamOutputUsdMicro: 4_400_000n,
          marginBps: 1000,
          marginFloorBps: 1000,
          effectiveAt: new Date(Date.now() - 5000),
        });
      if (status === "published") {
        await updateModel(db.db, m.id, { status: "approved" });
        await updateModel(db.db, m.id, { status: "published" });
      }
      if (status === "retired")
        await updateModel(db.db, m.id, { status: "retired" });
      return m;
    };
    await legacy(zai.id, "nexora/glm-5.3", "glm-5.3", "published", true);
    await legacy(zai.id, "nexora/glm-5-3", "glm-5-3", "retired", false);
    await legacy(
      minimax.id,
      "nexora/minimax-m3.1-flash",
      "MiniMax-M3.1-Flash",
      "published",
      true,
    );
    await legacy(
      moonshot.id,
      "nexora/kimi-k3.1-pro",
      "kimi-k3.1-pro",
      "draft",
      true,
    );
    await legacy(
      deepseek.id,
      "nexora/eclair-7b-instruct",
      "ancien",
      "draft",
      true,
    );
  });
  afterAll(async () => {
    await db.drop();
  });

  it("rattache à DeepInfra (fournisseur, identifiant amont, nouveau prix, aperçu), retire les absents avec une note et laisse l'ancien retiré", async () => {
    const report = await loadDeepinfraCatalog(
      db.db,
      sourceOf([rows.glm, rows.eclair, rows.vecteur]),
    );
    expect(report.attached.sort()).toEqual([
      "nexora/eclair-7b-instruct",
      "nexora/glm-5.3",
    ]);
    expect(report.created).toEqual(["nexora/vecteur-embed-1b"]);
    const [di] = await db.db
      .select()
      .from(modelProviders)
      .where(eq(modelProviders.code, "deepinfra"));
    const glm = await modelRow(db.db, "nexora/glm-5.3");
    expect(glm).toMatchObject({
      providerId: di?.id,
      upstreamId: "zai-org/GLM-5.3",
      availability: "preview",
      status: "published",
    });
    expect(glm?.routing).toEqual({});
    // l'ancien prix reste dans l'historique, le nouveau (amont DeepInfra) est en vigueur
    const prices = await priceRows(db.db, glm?.id as string);
    expect(prices).toHaveLength(2);
    const cur = await currentPrice(db.db, glm?.id as string, new Date());
    expect(cur).toMatchObject({
      upstreamInputUsdMicro: 900_000n,
      upstreamOutputUsdMicro: 4_000_000n,
      upstreamCacheUsdMicro: 200_000n,
      sellInputCadMicro: 1_386_000n,
    });

    expect(report.retired.sort()).toEqual([
      "nexora/kimi-k3.1-pro",
      "nexora/minimax-m3.1-flash",
    ]);
    const minimax = await modelRow(db.db, "nexora/minimax-m3.1-flash");
    expect(minimax?.status).toBe("retired");
    expect(minimax?.sheet.notesFr).toBe("Retiré : absent de DeepInfra.");
    expect(minimax?.sheet.notesEn).toBe("Retired: not on DeepInfra.");
    expect((await modelRow(db.db, "nexora/kimi-k3.1-pro"))?.status).toBe(
      "retired",
    );
    const old = await modelRow(db.db, "nexora/glm-5-3");
    expect(old?.status).toBe("retired");
    expect(old?.upstreamId).toBe("glm-5-3");

    const pub = await getPublishedCatalog(db.db);
    expect(pub?.snapshot.models.map((m) => m.publicId).sort()).toEqual([
      "nexora/eclair-7b-instruct",
      "nexora/glm-5.3",
      "nexora/vecteur-embed-1b",
    ]);
    // le retrait est rejouable sans rien changer
    const again = await loadDeepinfraCatalog(
      db.db,
      sourceOf([rows.glm, rows.eclair, rows.vecteur]),
    );
    expect(again.retired).toEqual([]);
    expect(again.attached).toEqual([]);
    expect(again.version.status).toBe("unchanged");
  });

  it("--nettoyer supprime les fournisseurs directs devenus sans modèle et garde ceux que des modèles (même retirés) référencent encore", async () => {
    const report = await loadDeepinfraCatalog(
      db.db,
      sourceOf([rows.glm, rows.eclair, rows.vecteur]),
      { nettoyer: true },
    );
    expect(report.cleaned.deleted).toEqual(["deepseek"]);
    expect(report.cleaned.kept.map((k) => k.code).sort()).toEqual([
      "minimax",
      "moonshot",
      "zai",
    ]);
    const codes = (await db.db.select().from(modelProviders)).map(
      (p) => p.code,
    );
    expect(codes).not.toContain("deepseek");
    expect(codes).toContain("zai");
    expect((await db.db.select({ n: count() }).from(modelRoutes))[0]?.n).toBe(
      0,
    );
  });

  it("sans l'option, aucun fournisseur n'est supprimé", async () => {
    const before = (await db.db.select({ n: count() }).from(modelProviders))[0]
      ?.n;
    const report = await loadDeepinfraCatalog(
      db.db,
      sourceOf([rows.glm, rows.eclair, rows.vecteur]),
    );
    expect(report.cleaned).toEqual({ deleted: [], kept: [] });
    expect(
      (await db.db.select({ n: count() }).from(modelProviders))[0]?.n,
    ).toBe(before);
  });
});

describe("sans taux de change approuvé", () => {
  it("charge des brouillons sans prix, ne publie rien, puis complète au rejeu une fois le taux approuvé", async () => {
    const db = await createTestDatabase();
    try {
      const src = sourceOf([rows.eclair, rows.vecteur]);
      const first = await loadDeepinfraCatalog(db.db, src);
      expect(first.fx).toBe(false);
      expect(first.created.sort()).toEqual([
        "nexora/eclair-7b-instruct",
        "nexora/vecteur-embed-1b",
      ]);
      expect(first.drafts.map((d) => d.publicId).sort()).toEqual([
        "nexora/eclair-7b-instruct",
        "nexora/vecteur-embed-1b",
      ]);
      expect(first.version.status).toBe("none");
      const e = await modelRow(db.db, "nexora/eclair-7b-instruct");
      expect(e?.status).toBe("draft");
      expect(await priceRows(db.db, e?.id as string)).toHaveLength(0);
      expect(await getPublishedCatalog(db.db)).toBeNull();
      expect(await listVersions(db.db)).toHaveLength(0);

      await approvedFx(db.db);
      const second = await loadDeepinfraCatalog(db.db, src);
      expect(second.created).toEqual([]);
      expect(second.priced.sort()).toEqual([
        "nexora/eclair-7b-instruct",
        "nexora/vecteur-embed-1b",
      ]);
      expect(second.version.status).toBe("published");
      expect((await modelRow(db.db, "nexora/eclair-7b-instruct"))?.status).toBe(
        "published",
      );
    } finally {
      await db.drop();
    }
  });
});

describe("chargement directement en service", () => {
  it("sans clé dans le Coffre, les modèles restent des brouillons et la garde dit pourquoi ; avec la clé, ils sont publiés", async () => {
    const db = await createTestDatabase();
    try {
      await approvedFx(db.db);
      const src = sourceOf([rows.eclair]);
      const first = await loadDeepinfraCatalog(db.db, src, {
        availability: "live",
      });
      expect(first.version.status).toBe("none");
      expect(first.drafts).toEqual([
        expect.objectContaining({ publicId: "nexora/eclair-7b-instruct" }),
      ]);
      expect(JSON.stringify(first.drafts)).toContain("secret_missing");
      const e = await modelRow(db.db, "nexora/eclair-7b-instruct");
      expect(e).toMatchObject({ status: "draft", availability: "live" });

      await putSecret(db.db, keyring, {
        ref: "llm.deepinfra",
        value: "di-essai-xxxxxxxxxxxxxxxx",
        kind: "llm_provider",
      });
      const second = await loadDeepinfraCatalog(db.db, src, {
        availability: "live",
      });
      expect(second.version.status).toBe("published");
      expect((await modelRow(db.db, "nexora/eclair-7b-instruct"))?.status).toBe(
        "published",
      );
    } finally {
      await db.drop();
    }
  });
});

describe("fiche invalide", () => {
  it("le modèle n'est pas chargé et le motif est dans le rapport", async () => {
    const db = await createTestDatabase();
    try {
      await approvedFx(db.db);
      const bad = fiches.map((f) =>
        f.file === "eclair-7b-instruct.json"
          ? {
              ...f,
              raw: fiche("acme/Eclair-7B-Instruct", "Éclair", {
                sheet: { tags: ["magique"] },
              }),
            }
          : f,
      );
      const report = await loadDeepinfraCatalog(
        db.db,
        sourceOf([rows.eclair, rows.vecteur], bad),
      );
      expect(report.created).toEqual(["nexora/vecteur-embed-1b"]);
      const invalid = report.skipped.find(
        (s) => s.publicId === "nexora/eclair-7b-instruct",
      );
      expect(invalid?.kind).toBe("fiche_invalide");
      expect(invalid?.message).toMatch(/sheet\.tags/);
      expect(
        await modelRow(db.db, "nexora/eclair-7b-instruct"),
      ).toBeUndefined();
    } finally {
      await db.drop();
    }
  });
});
