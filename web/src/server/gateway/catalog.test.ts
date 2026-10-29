import { randomBytes } from "node:crypto";
import { configVersions, eq, modelPrices, models, sql } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadKeyring } from "../vault/crypto";
import { putSecret } from "../vault/store";
import {
  addFxRate,
  addPrice,
  approveFxRate,
  approveVersion,
  CatalogError,
  createDraftVersion,
  createModel,
  createProvider,
  diffVersion,
  getPublishedCatalog,
  publishVersion,
  updateModel,
} from "./catalog";

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
beforeEach(async () => {
  // Les lignes de prix et de versions sont en ajout seulement : on isole les essais en retirant les modèles des précédents.
  await t.db.update(models).set({ status: "retired" });
});

let n = 0;
async function fixture(options: { secret?: boolean; fx?: boolean } = {}) {
  n += 1;
  const ref = `llm.test-${n}`;
  if (options.secret !== false)
    await putSecret(t.db, keyring, {
      ref,
      value: `sk-secret-${n}-xxxxxxxxxxxx`,
      kind: "llm_provider",
    });
  const provider = await createProvider(t.db, {
    code: `prov-${n}`,
    name: `Fournisseur ${n}`,
    type: "openai_compatible",
    baseUrl: "http://127.0.0.1:9999/v1",
    secretRef: ref,
    region: "quebec",
  });
  const model = await createModel(t.db, {
    publicId: `nexora/test-${n}`,
    name: `Test ${n}`,
    providerId: provider.id,
    upstreamId: "up-model",
    contextMax: 32_000,
  });
  if (options.fx !== false) {
    const fx = await addFxRate(t.db, {
      usdToCadMicro: 1_400_000n,
      effectiveAt: new Date(Date.now() - 1000),
    });
    await approveFxRate(t.db, fx.id, "test");
  }
  return { provider, model, ref };
}

const goodPrice = {
  upstreamInputUsdMicro: 500_000n,
  upstreamOutputUsdMicro: 1_000_000n,
  sellInputCadMicro: 910_000n,
  sellOutputCadMicro: 1_820_000n,
  marginFloorBps: 3000,
};

/** Publie le catalogue courant ; renvoie la version publiée. */
async function publishAll() {
  const { version } = await createDraftVersion(t.db);
  await approveVersion(t.db, version.id);
  return publishVersion(t.db, version.id);
}

describe("prix : historique", () => {
  it("un nouveau prix ne change pas celui d'une version déjà publiée", async () => {
    const { model } = await fixture();
    await addPrice(t.db, model.id, goodPrice, new Date(Date.now() - 500));
    await updateModel(t.db, model.id, { status: "approved" });
    await updateModel(t.db, model.id, { status: "published" });
    const v1 = await publishAll();
    const before = v1.snapshot.models.find(
      (m) => m.publicId === model.publicId,
    );
    expect(before?.price?.sellInputCadMicro).toBe("910000");

    await addPrice(t.db, model.id, {
      ...goodPrice,
      sellInputCadMicro: 2_000_000n,
      sellOutputCadMicro: 4_000_000n,
    });
    const still = await getPublishedCatalog(t.db);
    const same = still?.snapshot.models.find(
      (m) => m.publicId === model.publicId,
    );
    expect(same?.price?.sellInputCadMicro).toBe("910000");

    const v2 = await publishAll();
    expect(v2.id).not.toBe(v1.id);
    const after = v2.snapshot.models.find((m) => m.publicId === model.publicId);
    expect(after?.price?.sellInputCadMicro).toBe("2000000");
    // la v1 reste lisible et figée
    const rows = await t.db
      .select()
      .from(configVersions)
      .where(eq(configVersions.id, v1.id));
    expect(rows[0]?.status).toBe("superseded");
    const frozen = rows[0]?.content as unknown as {
      models: { price: { sellInputCadMicro: string } }[];
    };
    expect(frozen.models[0]?.price.sellInputCadMicro).toBe("910000");
  });

  it("la base refuse de modifier ou de supprimer une ligne de prix", async () => {
    const { model } = await fixture();
    const price = await addPrice(t.db, model.id, goodPrice);
    await expect(
      t.db
        .update(modelPrices)
        .set({ sellInputCadMicro: 1n })
        .where(eq(modelPrices.id, price.id)),
    ).rejects.toThrow();
    await expect(
      t.db.delete(modelPrices).where(eq(modelPrices.id, price.id)),
    ).rejects.toThrow();
  });

  it("la base refuse de changer le contenu ou le hash d'une version", async () => {
    const { model } = await fixture();
    await addPrice(t.db, model.id, goodPrice);
    await updateModel(t.db, model.id, { status: "approved" });
    await updateModel(t.db, model.id, { status: "published" });
    const { version } = await createDraftVersion(t.db);
    await expect(
      t.db
        .update(configVersions)
        .set({ hash: "forge" })
        .where(eq(configVersions.id, version.id)),
    ).rejects.toThrow();
    await expect(
      t.db
        .update(configVersions)
        .set({ content: sql`'{}'::jsonb` })
        .where(eq(configVersions.id, version.id)),
    ).rejects.toThrow();
  });

  it("choisit le prix dont la date d'effet est atteinte", async () => {
    const { model } = await fixture();
    await addPrice(t.db, model.id, goodPrice, new Date(Date.now() - 5000));
    await addPrice(t.db, model.id, {
      ...goodPrice,
      sellInputCadMicro: 5_000_000n,
      sellOutputCadMicro: 5_000_000n,
      effectiveAt: new Date(Date.now() + 3_600_000),
    });
    await updateModel(t.db, model.id, { status: "approved" });
    await updateModel(t.db, model.id, { status: "published" });
    const v = await publishAll();
    expect(
      v.snapshot.models.find((m) => m.publicId === model.publicId)?.price
        ?.sellInputCadMicro,
    ).toBe("910000");
  });

  it("calcule le prix de vente depuis une marge au taux approuvé", async () => {
    const { model } = await fixture();
    const price = await addPrice(t.db, model.id, {
      upstreamInputUsdMicro: 500_000n,
      upstreamOutputUsdMicro: 1_000_000n,
      marginBps: 3000,
      marginFloorBps: 3000,
    });
    expect(price.sellInputCadMicro).toBe(910_000n);
    expect(price.sellOutputCadMicro).toBe(1_820_000n);
  });
});

describe("garde de publication", () => {
  it("refuse d'approuver ou de publier un modèle sans prix (jamais 0 $)", async () => {
    const { model } = await fixture();
    const err = await updateModel(t.db, model.id, { status: "approved" }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(CatalogError);
    expect((err as CatalogError).code).toBe("publication_refused");
    expect(JSON.stringify((err as CatalogError).details)).toContain(
      "price_missing",
    );
  });

  it("refuse un prix à 0 $", async () => {
    const { model } = await fixture();
    await addPrice(t.db, model.id, {
      ...goodPrice,
      sellInputCadMicro: 0n,
      sellOutputCadMicro: 0n,
    });
    const err = await updateModel(t.db, model.id, { status: "approved" }).catch(
      (e) => e,
    );
    expect(JSON.stringify((err as CatalogError).details)).toContain(
      "price_zero",
    );
  });

  it("refuse un prix sous le plancher de marge", async () => {
    const { model } = await fixture();
    await addPrice(t.db, model.id, {
      ...goodPrice,
      sellOutputCadMicro: 1_819_999n,
    });
    const err = await updateModel(t.db, model.id, { status: "approved" }).catch(
      (e) => e,
    );
    expect(JSON.stringify((err as CatalogError).details)).toContain(
      "below_margin_floor",
    );
  });

  it("refuse de publier une version qui contiendrait un modèle sans prix, même si le statut a été forcé", async () => {
    const { model } = await fixture();
    // contournement : statut forcé directement en base, sans passer par la garde du modèle
    await t.db
      .update(models)
      .set({ status: "published" })
      .where(eq(models.id, model.id));
    const { version, issues } = await createDraftVersion(t.db);
    expect(issues.map((i) => i.code)).toContain("price_missing");
    const err = await approveVersion(t.db, version.id).catch((e) => e);
    expect((err as CatalogError).code).toBe("publication_refused");
    const err2 = await publishVersion(t.db, version.id).catch((e) => e);
    expect((err2 as CatalogError).code).toBe("invalid_transition");
  });

  it("refuse sans taux de change approuvé", async () => {
    // Base vierge de taux : on teste le garde sur un instantané construit à la main.
    const { guardSnapshot } = await import("./snapshot");
    const issues = guardSnapshot(
      {
        schema: 1,
        fx: null,
        providers: [],
        models: [
          {
            id: "m",
            publicId: "nexora/x",
            name: "x",
            descriptionFr: "",
            descriptionEn: "",
            kind: "chat",
            providerId: "p",
            upstreamId: "u",
            contextMax: 1,
            maxOutputTokens: null,
            capabilities: {},
            residency: "quebec",
            visibility: "public",
            sunsetAt: null,
            price: null,
          },
        ],
      },
      { secretExists: () => true },
    );
    expect(issues.map((i) => i.code)).toContain("fx_missing");
  });

  it("refuse un fournisseur dont la clé n'est pas dans le coffre", async () => {
    const { model } = await fixture({ secret: false });
    await addPrice(t.db, model.id, goodPrice);
    await updateModel(t.db, model.id, { status: "approved" });
    await updateModel(t.db, model.id, { status: "published" });
    const { version, issues } = await createDraftVersion(t.db);
    expect(issues.map((i) => i.code)).toContain("secret_missing");
    await expect(approveVersion(t.db, version.id)).rejects.toMatchObject({
      code: "publication_refused",
    });
  });

  it("n'approuve pas un taux de change deux fois et ne le laisse pas changer", async () => {
    const fx = await addFxRate(t.db, { usdToCadMicro: 1_300_000n });
    const a = await approveFxRate(t.db, fx.id, "alice");
    const b = await approveFxRate(t.db, fx.id, "bob");
    expect(b.approvedBy).toBe("alice");
    expect(b.approvedAt?.getTime()).toBe(a.approvedAt?.getTime());
  });
});

describe("versions de catalogue", () => {
  it("flux brouillon → approuvé → publié, avec aperçu des différences", async () => {
    const { model } = await fixture();
    await addPrice(t.db, model.id, goodPrice);
    await updateModel(t.db, model.id, { status: "approved" });
    await updateModel(t.db, model.id, { status: "published" });
    const draft = await createDraftVersion(t.db);
    expect(draft.version.status).toBe("draft");
    expect(
      draft.diff.some(
        (d) => d.kind === "model_added" && d.model === model.publicId,
      ),
    ).toBe(true);
    expect(draft.issues).toEqual([]);

    const again = await createDraftVersion(t.db);
    expect(again.version.id).toBe(draft.version.id);

    // publication d'un brouillon non approuvé : refus
    await expect(publishVersion(t.db, draft.version.id)).rejects.toMatchObject({
      code: "invalid_transition",
    });
    const approved = await approveVersion(t.db, draft.version.id);
    expect(approved.status).toBe("approved");
    const published = await publishVersion(t.db, draft.version.id);
    expect(published.status).toBe("published");
    expect(published.publishedAt).toBeInstanceOf(Date);
    expect((await getPublishedCatalog(t.db))?.id).toBe(draft.version.id);

    const noChange = await createDraftVersion(t.db);
    expect(noChange.unchanged).toBe(true);
    expect((await diffVersion(t.db, draft.version.id)).diff).toEqual([]);
  });

  it("refuse de publier un brouillon construit sur une version devenue obsolète", async () => {
    const { model } = await fixture();
    await addPrice(t.db, model.id, goodPrice);
    await updateModel(t.db, model.id, { status: "approved" });
    await updateModel(t.db, model.id, { status: "published" });
    await publishAll(); // v_a

    await addPrice(t.db, model.id, {
      ...goodPrice,
      sellInputCadMicro: 911_000n,
    });
    const d1 = await createDraftVersion(t.db);
    await approveVersion(t.db, d1.version.id);
    await addPrice(t.db, model.id, {
      ...goodPrice,
      sellInputCadMicro: 912_000n,
    });
    const d2 = await createDraftVersion(t.db);
    await approveVersion(t.db, d2.version.id);
    await publishVersion(t.db, d2.version.id);
    await expect(publishVersion(t.db, d1.version.id)).rejects.toMatchObject({
      code: "stale_version",
    });
  });

  it("une seule version publiée à la fois, même sous publications concurrentes", async () => {
    const { model } = await fixture();
    await addPrice(t.db, model.id, goodPrice);
    await updateModel(t.db, model.id, { status: "approved" });
    await updateModel(t.db, model.id, { status: "published" });
    const base = await publishAll();
    await addPrice(t.db, model.id, {
      ...goodPrice,
      sellInputCadMicro: 930_000n,
    });
    const d = await createDraftVersion(t.db);
    await approveVersion(t.db, d.version.id);
    await Promise.allSettled([
      publishVersion(t.db, d.version.id),
      publishVersion(t.db, d.version.id),
    ]);
    const published = await t.db
      .select()
      .from(configVersions)
      .where(eq(configVersions.status, "published"));
    const mine = published.filter((r) => r.itemId === "main");
    expect(mine).toHaveLength(1);
    expect(mine[0]?.id).toBe(d.version.id);
    expect(base.id).not.toBe(d.version.id);
  });

  it("le contenu figé ne contient aucune valeur de clé", async () => {
    const { model } = await fixture();
    await addPrice(t.db, model.id, goodPrice);
    await updateModel(t.db, model.id, { status: "approved" });
    await updateModel(t.db, model.id, { status: "published" });
    const v = await publishAll();
    expect(JSON.stringify(v.snapshot)).not.toContain("sk-secret");
  });
});

describe("fiche publique et routage amont", () => {
  const sheet = {
    family: "GLM",
    releasedAt: "2026-08-18",
    license: { name: "MIT", openWeights: true },
    parameters: { totalB: 753 },
    benchmarks: [
      {
        name: "SWE-bench Verified",
        score: 78.4,
        unit: "%",
        publisher: "Z.ai",
        sourceUrl: "https://z.ai/blog/glm-5.3",
      },
    ],
  };
  const routing = {
    dataCollection: "deny" as const,
    allowFallbacks: true,
    maxPriceUsdMicro: { input: "1400000", output: "4400000" },
  };

  it("un modèle sans fiche en a une vide et un routage vide", async () => {
    const { model } = await fixture();
    expect(model.sheet).toEqual({});
    expect(model.routing).toEqual({});
  });

  it("conserve la fiche et le routage donnés à la création", async () => {
    const { provider } = await fixture();
    n += 1;
    const created = await createModel(t.db, {
      publicId: `nexora/fiche-${n}`,
      name: "Avec fiche",
      providerId: provider.id,
      upstreamId: "z-ai/glm-5.3",
      contextMax: 1_048_576,
      sheet,
      routing,
    });
    expect(created.sheet).toEqual(sheet);
    expect(created.routing).toEqual(routing);
  });

  it("modifie la fiche d'un modèle existant sans toucher au reste", async () => {
    const { model } = await fixture();
    const updated = await updateModel(t.db, model.id, { sheet, routing });
    expect(updated.sheet).toEqual(sheet);
    expect(updated.routing).toEqual(routing);
    expect(updated.contextMax).toBe(model.contextMax);
  });

  it("fige la fiche et le routage dans la version publiée", async () => {
    const { model } = await fixture();
    await updateModel(t.db, model.id, { sheet, routing });
    await addPrice(t.db, model.id, goodPrice);
    await updateModel(t.db, model.id, { status: "approved" });
    await updateModel(t.db, model.id, { status: "published" });
    const v = await publishAll();
    const snap = v.snapshot.models.find((m) => m.publicId === model.publicId);
    expect(snap?.sheet).toEqual(sheet);
    expect(snap?.routing).toEqual(routing);
    // la modification suivante n'altère pas la version déjà publiée
    await updateModel(t.db, model.id, { sheet: { family: "autre" } });
    const still = await getPublishedCatalog(t.db);
    expect(
      still?.snapshot.models.find((m) => m.publicId === model.publicId)?.sheet,
    ).toEqual(sheet);
  });
});

describe("prix : plages horaires et écriture du cache", () => {
  // Les essais précédents laissent d'autres taux : on pose le taux de 1,40 voulu ici, le plus récent.
  beforeEach(async () => {
    const fx = await addFxRate(t.db, { usdToCadMicro: 1_400_000n });
    await approveFxRate(t.db, fx.id, "test");
  });

  const offPeak = {
    label: "creux",
    days: [0, 6],
    startMinute: 0,
    endMinute: 1440,
    upstream: { input: 150_000n, output: 600_000n, cache: 3_000n },
  };
  const deepseek = {
    upstreamInputUsdMicro: 300_000n,
    upstreamOutputUsdMicro: 1_200_000n,
    upstreamCacheUsdMicro: 6_000n,
    marginBps: 1000,
    marginFloorBps: 1000,
  };

  it("calcule le prix de vente de chaque plage avec la marge et le garde dans la ligne de prix", async () => {
    const { model } = await fixture();
    const price = await addPrice(t.db, model.id, {
      ...deepseek,
      windows: [offPeak],
    });
    // base : 0,30 USD × 1,4 × 1,1 = 0,462 CAD ; creux : 0,15 USD × 1,4 × 1,1 = 0,231 CAD
    expect(price.sellInputCadMicro).toBe(462_000n);
    expect(price.windows).toHaveLength(1);
    expect(price.windows[0]).toMatchObject({
      label: "creux",
      days: [0, 6],
      startMinute: 0,
      endMinute: 1440,
      upstream: {
        input: "150000",
        output: "600000",
        cache: "3000",
        cacheWrite: null,
      },
      sell: {
        input: "231000",
        output: "924000",
        cache: "4620",
        cacheWrite: null,
      },
    });
  });

  it("calcule le prix de vente de l'écriture du cache avec la même marge", async () => {
    const { model } = await fixture();
    const price = await addPrice(t.db, model.id, {
      upstreamInputUsdMicro: 2_000_000n,
      upstreamOutputUsdMicro: 10_000_000n,
      upstreamCacheUsdMicro: 200_000n,
      upstreamCacheWriteUsdMicro: 2_000_000n,
      marginBps: 1000,
      marginFloorBps: 1000,
    });
    // 2,00 USD × 1,4 × 1,1 = 3,08 CAD
    expect(price.sellCacheWriteCadMicro).toBe(3_080_000n);
    expect(price.upstreamCacheWriteUsdMicro).toBe(2_000_000n);
  });

  it("refuse une plage plus chère que le prix de base (la réservation se fait au prix de base)", async () => {
    const { model } = await fixture();
    await expect(
      addPrice(t.db, model.id, {
        ...deepseek,
        windows: [
          { ...offPeak, upstream: { ...offPeak.upstream, output: 1_300_000n } },
        ],
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("refuse des plages qui se chevauchent ou mal bornées", async () => {
    const { model } = await fixture();
    await expect(
      addPrice(t.db, model.id, {
        ...deepseek,
        windows: [offPeak, { ...offPeak, label: "autre", days: [6] }],
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(
      addPrice(t.db, model.id, {
        ...deepseek,
        windows: [{ ...offPeak, startMinute: 600, endMinute: 600 }],
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("refuse d'approuver un modèle dont une plage passe sous le plancher de marge", async () => {
    const { model } = await fixture();
    await addPrice(t.db, model.id, {
      ...deepseek,
      windows: [
        {
          ...offPeak,
          sell: { input: 100_000n, output: 100_000n, cache: 1_000n },
        },
      ],
    });
    await expect(
      updateModel(t.db, model.id, { status: "approved" }),
    ).rejects.toMatchObject({ code: "publication_refused" });
  });

  it("fige les plages et l'écriture du cache dans la version publiée", async () => {
    const { model } = await fixture();
    await addPrice(t.db, model.id, {
      ...deepseek,
      upstreamCacheWriteUsdMicro: 300_000n,
      windows: [offPeak],
    });
    await updateModel(t.db, model.id, { status: "approved" });
    await updateModel(t.db, model.id, { status: "published" });
    const v = await publishAll();
    const snap = v.snapshot.models.find((m) => m.publicId === model.publicId);
    expect(snap?.price?.windows?.[0]?.sell.input).toBe("231000");
    expect(snap?.price?.sellCacheWriteCadMicro).toBe("462000");
  });
});
