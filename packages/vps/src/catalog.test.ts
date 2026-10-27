import { configVersions, eq } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sha256Hex } from "./canonical.ts";
import {
  approveCatalogVersion,
  createApp,
  createDraftVersion,
  createPlan,
  getPublishedCatalog,
  guardSnapshot,
  markCatalogApplied,
  publishCatalogVersion,
  stripePriceFor,
  updateApp,
  updatePlan,
  VpsCatalogError,
} from "./catalog.ts";
import { INSTALL_SCRIPT } from "./testing.ts";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

const guard = { allowDevSamples: true };
const base = (code: string, over = {}) => ({
  code,
  name: code,
  vcpu: 1,
  ramMb: 2048,
  diskGb: 20,
  bandwidthGb: 1000,
  templateCode: "debian-12-ci",
  ...over,
});
const appBase = (code: string, over = {}) => ({
  code,
  name: code,
  version: "1.0.0",
  upstreamUrl: "https://github.com/x/y",
  license: "MIT",
  licenseUrl: "https://raw.githubusercontent.com/x/y/main/LICENSE",
  installScript: INSTALL_SCRIPT,
  ...over,
});

describe("garde de publication du catalogue VPS", () => {
  it("refuse un plan sans prix, jamais publié « à 0 $ »", async () => {
    const p = await createPlan(t.db, base("sans-prix"));
    await expect(
      updatePlan(t.db, p.id, { status: "approved" }),
    ).rejects.toMatchObject({
      code: "publication_refused",
      details: [expect.objectContaining({ issue: "price_missing" })],
    });
    // La base refuse aussi un prix nul, même contourné.
    await expect(
      createPlan(t.db, base("zero", { priceMonthlyCents: 0 })),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("exige un prix annuel inférieur à douze mois au tarif mensuel", () => {
    const issues = guardSnapshot(
      {
        schema: 1,
        apps: [],
        plans: [
          {
            id: "1",
            code: "p",
            name: "p",
            descriptionFr: "",
            descriptionEn: "",
            vcpu: 1,
            ramMb: 1,
            diskGb: 1,
            bandwidthGb: 0,
            region: "quebec",
            priceMonthlyCents: 1000,
            priceYearlyCents: 12000,
            highlighted: false,
            templateCode: "t",
            sort: 1,
            isDevSample: false,
          },
        ],
      },
      guard,
    );
    expect(issues.map((i) => i.issue)).toContain("yearly_not_cheaper");
  });

  it("refuse un plan de développement hors de la base de développement", () => {
    const snap = {
      schema: 1 as const,
      apps: [],
      plans: [
        {
          id: "1",
          code: "p",
          name: "p",
          descriptionFr: "",
          descriptionEn: "",
          vcpu: 1,
          ramMb: 1,
          diskGb: 1,
          bandwidthGb: 0,
          region: "quebec" as const,
          priceMonthlyCents: 1000,
          priceYearlyCents: null,
          highlighted: false,
          templateCode: "t",
          sort: 1,
          isDevSample: true,
        },
      ],
    };
    expect(
      guardSnapshot(snap, { allowDevSamples: false }).map((i) => i.issue),
    ).toContain("dev_sample");
    expect(guardSnapshot(snap, { allowDevSamples: true })).toEqual([]);
  });

  it("n'installe que des licences permissives et jamais n8n, Open WebUI ni Dify", async () => {
    const gpl = await createApp(
      t.db,
      appBase("app-gpl", { license: "GPL-3.0" }),
    );
    await expect(
      updateApp(t.db, gpl.id, { status: "approved" }),
    ).rejects.toMatchObject({
      details: [expect.objectContaining({ issue: "license_not_permissive" })],
    });
    for (const code of ["n8n", "open-webui", "dify"]) {
      const a = await createApp(t.db, appBase(code));
      await expect(
        updateApp(t.db, a.id, { status: "approved" }),
      ).rejects.toMatchObject({
        details: expect.arrayContaining([
          expect.objectContaining({ issue: "excluded" }),
        ]),
      });
    }
  });

  it("une fiche guide (n8n) n'a pas de script et exige l'avertissement de licence", async () => {
    const g = await createApp(t.db, {
      ...appBase("n8n-guide"),
      kind: "guide",
      installScript: null,
      license: "SUL-1.0",
    });
    await expect(
      updateApp(t.db, g.id, { status: "approved" }),
    ).rejects.toMatchObject({
      details: [expect.objectContaining({ issue: "guide_incomplete" })],
    });
    await updateApp(t.db, g.id, {
      licenseWarningFr: "Licence Sustainable Use.",
      licenseWarningEn: "Sustainable Use License.",
      guideFr: "Installez n8n sur votre VPS…",
    });
    const ok = await updateApp(t.db, g.id, { status: "approved" });
    expect(ok.installScript).toBeNull();
    expect(ok.installScriptSha256).toBeNull();
  });

  it("calcule la somme du script, la change avec lui et la contraint en base", async () => {
    const a = await createApp(t.db, appBase("app-sha"));
    expect(a.installScriptSha256).toBe(sha256Hex(INSTALL_SCRIPT));
    expect(a.installScriptVersion).toBe(1);
    const b = await updateApp(t.db, a.id, {
      installScript: `${INSTALL_SCRIPT}# v2\n`,
    });
    expect(b.installScriptSha256).toBe(sha256Hex(`${INSTALL_SCRIPT}# v2\n`));
    expect(b.installScriptVersion).toBe(2);
    const { vpsApps } = await import("@nexora/db");
    await expect(
      t.db
        .update(vpsApps)
        .set({ installScript: "echo piégé" })
        .where(eq(vpsApps.id, a.id)),
    ).rejects.toThrow();
  });

  it("refuse une version non épinglée", async () => {
    const a = await createApp(
      t.db,
      appBase("app-latest", { version: "latest" }),
    );
    await expect(
      updateApp(t.db, a.id, { status: "approved" }),
    ).rejects.toMatchObject({
      details: [expect.objectContaining({ issue: "version_unpinned" })],
    });
  });
});

describe("versions du catalogue (D3)", () => {
  it("brouillon → approuvé → publié ; seule la version publiée sert ; le contenu est figé", async () => {
    const plan = await createPlan(
      t.db,
      base("versionne", { priceMonthlyCents: 1000 }),
    );
    const app = await createApp(t.db, appBase("app-versionnee"));
    await updatePlan(t.db, plan.id, { status: "approved" });
    await updatePlan(t.db, plan.id, { status: "published" });
    await updateApp(t.db, app.id, { status: "approved" });
    await updateApp(t.db, app.id, { status: "published" });

    expect(await getPublishedCatalog(t.db)).toBeNull();
    const draft = await createDraftVersion(t.db, guard);
    expect(draft.created).toBe(true);
    expect(draft.diff.map((d) => `${d.entity}:${d.code}:${d.change}`)).toEqual(
      expect.arrayContaining([
        "plan:versionne:added",
        "app:app-versionnee:added",
      ]),
    );
    await expect(
      publishCatalogVersion(t.db, draft.version.id, guard),
    ).rejects.toMatchObject({ code: "invalid_transition" });
    await approveCatalogVersion(t.db, draft.version.id, guard);
    const published = await publishCatalogVersion(
      t.db,
      draft.version.id,
      guard,
    );
    expect(published.status).toBe("published");
    expect((await getPublishedCatalog(t.db))?.id).toBe(published.id);

    await expect(
      t.db
        .update(configVersions)
        .set({ content: {} })
        .where(eq(configVersions.id, published.id)),
    ).rejects.toThrow();
    // Sans changement, le brouillon est la version publiée (idempotent).
    expect((await createDraftVersion(t.db, guard)).unchanged).toBe(true);
  });

  it("un brouillon périmé (une autre version a été publiée entre-temps) ne se publie pas", async () => {
    const p = await createPlan(
      t.db,
      base("perime", { priceMonthlyCents: 900 }),
    );
    await updatePlan(t.db, p.id, { status: "approved" });
    await updatePlan(t.db, p.id, { status: "published" });
    const a = await createDraftVersion(t.db, guard);
    await approveCatalogVersion(t.db, a.version.id, guard);
    // Même base de départ : un second brouillon change autre chose.
    const q = await createPlan(t.db, base("autre", { priceMonthlyCents: 800 }));
    await updatePlan(t.db, q.id, { status: "approved" });
    await updatePlan(t.db, q.id, { status: "published" });
    const b = await createDraftVersion(t.db, guard);
    await approveCatalogVersion(t.db, b.version.id, guard);
    await publishCatalogVersion(t.db, b.version.id, guard);
    await expect(
      publishCatalogVersion(t.db, a.version.id, guard),
    ).rejects.toBeInstanceOf(VpsCatalogError);
  });

  it("les prix Stripe suivent la version publiée « appliquée » ; ajouter une application les conserve, changer un prix non", async () => {
    const p = await createPlan(
      t.db,
      base("stripe-suivi", {
        priceMonthlyCents: 1100,
        priceYearlyCents: 11000,
      }),
    );
    await updatePlan(t.db, p.id, { status: "approved" });
    await updatePlan(t.db, p.id, { status: "published" });
    const d1 = await createDraftVersion(t.db, guard);
    await approveCatalogVersion(t.db, d1.version.id, guard);
    const v1 = await publishCatalogVersion(t.db, d1.version.id, guard);
    expect(stripePriceFor(v1, "stripe-suivi", "month")).toBeNull();
    await markCatalogApplied(t.db, v1.id, {
      status: "applied",
      detail: {
        stripe: {
          plans: Object.fromEntries(
            v1.snapshot.plans.map((pl) => [
              pl.code,
              {
                productId: "prod_x",
                monthly: `price_m_${pl.code}`,
                yearly: `price_y_${pl.code}`,
              },
            ]),
          ),
        },
      },
    });
    const v1b = (await getPublishedCatalog(t.db))!;
    expect(stripePriceFor(v1b, "stripe-suivi", "month")).toBe(
      "price_m_stripe-suivi",
    );

    const app = await createApp(t.db, appBase("app-suivie"));
    await updateApp(t.db, app.id, { status: "approved" });
    await updateApp(t.db, app.id, { status: "published" });
    const d2 = await createDraftVersion(t.db, guard);
    await approveCatalogVersion(t.db, d2.version.id, guard);
    const v2 = await publishCatalogVersion(t.db, d2.version.id, guard);
    expect(stripePriceFor(v2, "stripe-suivi", "year")).toBe(
      "price_y_stripe-suivi",
    );

    await updatePlan(t.db, p.id, { priceMonthlyCents: 1200 });
    const d3 = await createDraftVersion(t.db, guard);
    await approveCatalogVersion(t.db, d3.version.id, guard);
    const v3 = await publishCatalogVersion(t.db, d3.version.id, guard);
    expect(stripePriceFor(v3, "stripe-suivi", "month")).toBeNull();
  });
});
