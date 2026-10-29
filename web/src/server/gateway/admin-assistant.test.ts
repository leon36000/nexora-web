import { randomBytes } from "node:crypto";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadKeyring } from "../vault/crypto";
import { putSecret, readSecret, revokeSecret } from "../vault/store";
import { type CatalogAdminDeps, handleCatalogAdmin } from "./admin-handlers";

/**
 * Appuis serveur des assistants d'administration (module Directus « Modèles ») : présence de la clé du coffre,
 * contrôles préalables à la publication d'un modèle, ordre des routes de secours.
 */

const TOKEN = "t".repeat(48);
let t: TestDatabase;
const keyring = loadKeyring({
  NEXORA_VAULT_MASTER_KEY: randomBytes(32).toString("base64"),
});

const deps = (): CatalogAdminDeps => ({
  db: () => t.db,
  adminToken: TOKEN,
  litellm: () => null,
  getSecret: (ref) => readSecret(t.db, keyring, ref),
  outbound: async (raw) => ({ ok: true, url: new URL(raw), addresses: [] }),
  secretHosts: () => null,
  fetch: (async () => Response.json({ data: [] })) as typeof fetch,
  log: createLogger({ name: "test", sink: () => {} }),
  now: () => new Date(),
});

async function call(method: string, path: string, body?: unknown) {
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
  return {
    status: res.status,
    json: (await res.json()) as Record<string, any>,
  };
}

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

const issueCodes = (r: { json: Record<string, any> }) =>
  (r.json.issues as { code: string }[]).map((i) => i.code).sort();

describe("vue d'ensemble : clé du fournisseur et marge par défaut", () => {
  it("indique si la clé de chaque fournisseur est dans le coffre, sans jamais la montrer", async () => {
    await putSecret(t.db, keyring, {
      ref: "llm.present",
      value: "sk-tres-secret-0001",
      kind: "llm_provider",
    });
    const base = {
      type: "openai_compatible",
      baseUrl: "https://api.deepinfra.com/v1/openai",
      region: "autre",
    };
    await call("POST", "providers", {
      ...base,
      code: "avec-cle",
      name: "A",
      secretRef: "llm.present",
    });
    await call("POST", "providers", {
      ...base,
      code: "cle-absente",
      name: "B",
      secretRef: "llm.absente",
    });
    await call("POST", "providers", {
      ...base,
      code: "sans-cle",
      name: "C",
      type: "vllm",
    });

    const overview = await call("GET", "");
    expect(overview.status).toBe(200);
    const byCode = Object.fromEntries(
      (
        overview.json.providers as {
          code: string;
          secretPresent: boolean | null;
        }[]
      ).map((p) => [p.code, p.secretPresent]),
    );
    expect(byCode).toEqual({
      "avec-cle": true,
      "cle-absente": false,
      "sans-cle": null,
    });
    expect(overview.json.defaults).toEqual({
      marginBps: 1000,
      marginFloorBps: 1000,
    });
    expect(JSON.stringify(overview.json)).not.toContain("sk-tres-secret");

    const list = await call("GET", "providers");
    expect(
      (
        list.json.providers as { code: string; secretPresent: boolean | null }[]
      ).find((p) => p.code === "avec-cle")?.secretPresent,
    ).toBe(true);
  });

  it("une clé révoquée n'est plus présente", async () => {
    await putSecret(t.db, keyring, {
      ref: "llm.revoquee",
      value: "sk-x-0002",
      kind: "llm_provider",
    });
    await revokeSecret(t.db, "llm.revoquee");
    await call("POST", "providers", {
      code: "revoquee",
      name: "R",
      type: "openai_compatible",
      baseUrl: "https://api.deepseek.com/v1",
      region: "autre",
      secretRef: "llm.revoquee",
    });
    const list = await call("GET", "providers");
    expect(
      (
        list.json.providers as { code: string; secretPresent: boolean | null }[]
      ).find((p) => p.code === "revoquee")?.secretPresent,
    ).toBe(false);
  });
});

describe("contrôles préalables à la publication d'un modèle", () => {
  let providerId = "";
  let modelId = "";

  it("liste tout ce qui manque : taux, prix, clé du fournisseur", async () => {
    const p = await call("POST", "providers", {
      code: "pre-controles",
      name: "Pré-contrôles",
      type: "openai_compatible",
      baseUrl: "https://api.deepinfra.com/v1/openai",
      region: "autre",
      secretRef: "llm.pre-controles",
    });
    providerId = p.json.id;
    const m = await call("POST", "models", {
      publicId: "nexora/pre-controles",
      name: "Pré-contrôles",
      providerId,
      upstreamId: "x/y",
      contextMax: 8000,
    });
    modelId = m.json.id;
    const r = await call("GET", `models/${modelId}/readiness`);
    expect(r.status).toBe(200);
    expect(r.json.ready).toBe(false);
    expect(issueCodes(r)).toEqual([
      "fx_missing",
      "price_missing",
      "secret_missing",
    ]);
  });

  it("devient prêt une fois la clé déposée, le taux approuvé et le prix saisi", async () => {
    await putSecret(t.db, keyring, {
      ref: "llm.pre-controles",
      value: "sk-pre-0003",
      kind: "llm_provider",
    });
    const fx = await call("POST", "fx-rates", { usdToCadMicro: "1400000" });
    await call("POST", `fx-rates/${fx.json.id}/approve`);
    await call("POST", `models/${modelId}/prices`, {
      upstreamInputUsdMicro: "500000",
      upstreamOutputUsdMicro: "1000000",
      marginBps: 1000,
      marginFloorBps: 1000,
    });
    const r = await call("GET", `models/${modelId}/readiness`);
    expect(r.json.issues).toEqual([]);
    expect(r.json.ready).toBe(true);
    expect(r.json.fx.usdToCadMicro).toBe("1400000");
  });

  it("signale un prix de vente sous le plancher de marge et une route sans clé", async () => {
    // vente 0,70 $ CA pour un coût de 0,50 $ US x 1,40 = 0,70 $ CA : marge nulle, sous le plancher de 10 %
    await call("POST", `models/${modelId}/prices`, {
      upstreamInputUsdMicro: "500000",
      upstreamOutputUsdMicro: "1000000",
      sellInputCadMicro: "700000",
      sellOutputCadMicro: "1400000",
      marginFloorBps: 1000,
    });
    const other = await call("POST", "providers", {
      code: "secours-sans-cle",
      name: "Secours",
      type: "openai_compatible",
      baseUrl: "https://openrouter.ai/api/v1",
      region: "autre",
      secretRef: "llm.secours-absente",
    });
    await call("POST", `models/${modelId}/routes`, {
      providerId: other.json.id,
      upstreamId: "x/y",
    });
    const r = await call("GET", `models/${modelId}/readiness`);
    expect(r.json.ready).toBe(false);
    expect(issueCodes(r)).toEqual([
      "below_margin_floor",
      "below_margin_floor",
      "route_secret_missing",
    ]);
    expect(
      (r.json.issues as { model?: string }[]).every(
        (i) => i.model === "nexora/pre-controles",
      ),
    ).toBe(true);
  });

  it("répond 404 pour un modèle inconnu", async () => {
    expect(
      (
        await call(
          "GET",
          "models/00000000-0000-4000-8000-000000000000/readiness",
        )
      ).status,
    ).toBe(404);
    expect((await call("POST", `models/${modelId}/readiness`)).status).toBe(
      405,
    );
  });
});

describe("ordre des routes de secours", () => {
  it("réordonne les routes, refuse une liste qui ne correspond pas aux routes du modèle", async () => {
    const p = await call("POST", "providers", {
      code: "ordre",
      name: "Ordre",
      type: "openai_compatible",
      baseUrl: "https://api.deepinfra.com/v1/openai",
      region: "autre",
    });
    const m = await call("POST", "models", {
      publicId: "nexora/ordre",
      name: "Ordre",
      providerId: p.json.id,
      upstreamId: "x",
      contextMax: 8000,
    });
    const ids: string[] = [];
    for (const up of ["a", "b", "c"]) {
      const r = await call("POST", `models/${m.json.id}/routes`, {
        providerId: p.json.id,
        upstreamId: up,
      });
      ids.push(r.json.id);
    }
    const [a, b, c] = ids as [string, string, string];
    const moved = await call("POST", `models/${m.json.id}/routes/reorder`, {
      order: [c, a, b],
    });
    expect(moved.status).toBe(200);
    expect(
      moved.json.routes.map((r: { upstreamId: string; position: number }) => [
        r.upstreamId,
        r.position,
      ]),
    ).toEqual([
      ["c", 1],
      ["a", 2],
      ["b", 3],
    ]);
    const list = await call("GET", `models/${m.json.id}/routes`);
    expect(
      list.json.routes.map((r: { upstreamId: string }) => r.upstreamId),
    ).toEqual(["c", "a", "b"]);

    // une route ajoutée ensuite passe en dernier
    const d = await call("POST", `models/${m.json.id}/routes`, {
      providerId: p.json.id,
      upstreamId: "d",
    });
    expect(d.json.position).toBe(4);

    expect(
      (
        await call("POST", `models/${m.json.id}/routes/reorder`, {
          order: [a, b],
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await call("POST", `models/${m.json.id}/routes/reorder`, {
          order: [a, a, b, c, d.json.id],
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await call("POST", `models/${m.json.id}/routes/reorder`, {
          order: [a, b, c, "00000000-0000-4000-8000-000000000000"],
        })
      ).status,
    ).toBe(422);
    expect(
      (await call("GET", `models/${m.json.id}/routes/reorder`)).status,
    ).toBe(405);
  });
});
