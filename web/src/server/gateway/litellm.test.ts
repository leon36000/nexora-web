import { randomBytes } from "node:crypto";
import { configVersions, eq, models } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadKeyring } from "../vault/crypto";
import { putSecret, readSecret } from "../vault/store";
import {
  addFxRate,
  addPrice,
  approveFxRate,
  approveVersion,
  createDraftVersion,
  createModel,
  createProvider,
  publishVersion,
  updateModel,
} from "./catalog";
import { createLitellmClient, SyncError, syncLitellm } from "./litellm";

/** Simulateur minimal de l'API d'administration de LiteLLM (état en mémoire). */
function fakeLitellm() {
  const state = {
    models: new Map<string, Record<string, unknown>>([
      ["config-file-model", { model_name: "dev/cloud-glm-5-3" }],
    ]),
    credentials: new Map<string, Record<string, unknown>>(),
    calls: [] as string[],
    failOn: null as string | null,
  };
  const fetchFn: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer master-test-key",
    );
    const path = url.pathname;
    state.calls.push(`${method} ${path}`);
    const json = (o: unknown, status = 200) => Response.json(o, { status });
    if (state.failOn === path) return json({ error: "boom" }, 500);
    if (path === "/model/info")
      return json({
        data: [...state.models].map(([id, m]) => ({
          ...m,
          model_info: { id },
        })),
      });
    if (path === "/credentials" && method === "GET")
      return json({
        credentials: [...state.credentials.keys()].map((n) => ({
          credential_name: n,
        })),
      });
    if (path === "/credentials" && method === "POST") {
      state.credentials.set(body.credential_name, body.credential_values);
      return json({ success: true });
    }
    if (path.startsWith("/credentials/") && method === "PATCH") {
      const name = decodeURIComponent(path.split("/")[2] ?? "");
      state.credentials.set(name, {
        ...state.credentials.get(name),
        ...body.credential_values,
      });
      return json({ success: true });
    }
    if (path.startsWith("/credentials/") && method === "DELETE") {
      state.credentials.delete(decodeURIComponent(path.split("/")[2] ?? ""));
      return json({ success: true });
    }
    if (path === "/model/new" || path === "/model/update") {
      state.models.set(body.model_info.id, body);
      return json({ ok: true });
    }
    if (path === "/model/delete") {
      state.models.delete(body.id);
      return json({ ok: true });
    }
    return json({}, 404);
  };
  return {
    state,
    client: createLitellmClient({
      baseUrl: "http://litellm.test",
      masterKey: "master-test-key",
      fetch: fetchFn,
    }),
  };
}

let t: TestDatabase;
const keyring = loadKeyring({
  NEXORA_VAULT_MASTER_KEY: randomBytes(32).toString("base64"),
});
const getSecret = (ref: string) => readSecret(t.db, keyring, ref);

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

async function publishOne(opts: {
  code: string;
  publicId: string;
  secret: string;
}) {
  await putSecret(t.db, keyring, {
    ref: `llm.${opts.code}`,
    value: opts.secret,
    kind: "llm_provider",
  });
  const provider = await createProvider(t.db, {
    code: opts.code,
    name: opts.code,
    type: "litellm_upstream",
    baseUrl: "http://127.0.0.1:4400",
    litellmBaseUrl: "http://127.0.0.1:4000",
    secretRef: `llm.${opts.code}`,
    region: "autre",
  });
  const model = await createModel(t.db, {
    publicId: opts.publicId,
    name: opts.publicId,
    providerId: provider.id,
    upstreamId: "dev/cloud-glm-5-3",
    contextMax: 100_000,
  });
  const fx = await addFxRate(t.db, {
    usdToCadMicro: 1_400_000n,
    effectiveAt: new Date(Date.now() - 1000),
  });
  await approveFxRate(t.db, fx.id, "test");
  await addPrice(t.db, model.id, {
    upstreamInputUsdMicro: 100_000n,
    upstreamOutputUsdMicro: 200_000n,
    sellInputCadMicro: 500_000n,
    sellOutputCadMicro: 1_000_000n,
    note: "DÉVELOPPEMENT",
  });
  await updateModel(t.db, model.id, { status: "approved" });
  await updateModel(t.db, model.id, { status: "published" });
  const { version } = await createDraftVersion(t.db);
  await approveVersion(t.db, version.id);
  return publishVersion(t.db, version.id);
}

describe("synchronisation LiteLLM", () => {
  it("refuse de synchroniser sans catalogue publié", async () => {
    const { client } = fakeLitellm();
    await expect(
      syncLitellm(t.db, { client, getSecret }),
    ).rejects.toBeInstanceOf(SyncError);
  });

  it("pousse crédentials puis modèles publiés, avec la clé tirée du coffre, et écrit l'état appliqué", async () => {
    const v = await publishOne({
      code: "dev-up",
      publicId: "nexora/glm-5-3",
      secret: "vk-super-secret-value-1",
    });
    const { state, client } = fakeLitellm();
    const at = new Date("2026-10-27T12:00:00Z");
    const { summary } = await syncLitellm(t.db, {
      client,
      getSecret,
      now: () => at,
    });
    expect(summary.models.created).toEqual(["nexora/glm-5-3"]);
    expect(state.credentials.get("nexora-prov-dev-up")).toEqual({
      api_key: "vk-super-secret-value-1",
      api_base: "http://127.0.0.1:4000/v1",
    });
    const pushed = state.models.get("nxm-nexora-glm-5-3") as {
      model_name: string;
      litellm_params: { model: string; litellm_credential_name: string };
    };
    expect(pushed.model_name).toBe("nexora/glm-5-3");
    expect(pushed.litellm_params.model).toBe("openai/dev/cloud-glm-5-3");
    expect(pushed.litellm_params.litellm_credential_name).toBe(
      "nexora-prov-dev-up",
    );
    // la clé n'est jamais dans le modèle, ni dans le résumé écrit en base
    expect(JSON.stringify(pushed)).not.toContain("vk-super-secret");
    // les crédentials sont créés avant les modèles
    expect(state.calls.indexOf("POST /credentials")).toBeLessThan(
      state.calls.indexOf("POST /model/new"),
    );
    // le modèle déclaré dans le fichier de configuration n'est pas touché
    expect(state.models.has("config-file-model")).toBe(true);

    const [row] = await t.db
      .select()
      .from(configVersions)
      .where(eq(configVersions.id, v.id));
    expect(row?.appliedStatus).toBe("applied");
    expect(row?.appliedAt?.toISOString()).toBe(at.toISOString());
    expect(JSON.stringify(row?.appliedDetail)).not.toContain("vk-super-secret");
  });

  it("est rejouable : met à jour, et retire ce qui n'est plus publié", async () => {
    const { state, client } = fakeLitellm();
    await syncLitellm(t.db, { client, getSecret });
    const second = await syncLitellm(t.db, { client, getSecret });
    expect(second.summary.models.created).toEqual([]);
    expect(second.summary.models.updated).toEqual(["nexora/glm-5-3"]);
    // un modèle géré par Nexora et dépublié disparaît de LiteLLM au prochain passage
    state.models.set("nxm-orphelin", { model_name: "nexora/orphelin" });
    state.credentials.set("nexora-prov-orphelin", {});
    const third = await syncLitellm(t.db, { client, getSecret });
    expect(third.summary.models.deleted).toEqual(["nxm-orphelin"]);
    expect(third.summary.credentials.deleted).toEqual(["nexora-prov-orphelin"]);
    expect(state.models.has("config-file-model")).toBe(true);
  });

  it("n'écrit que le publié : un modèle approuvé mais non publié n'est pas poussé", async () => {
    await t.db.update(models).set({ status: "retired" });
    const { state, client } = fakeLitellm();
    // le catalogue publié contient encore nexora/glm-5-3 (le retrait n'est pas publié)
    const { summary } = await syncLitellm(t.db, { client, getSecret });
    expect(summary.models.created).toEqual(["nexora/glm-5-3"]);
    expect(state.models.has("nxm-nexora-glm-5-3")).toBe(true);
  });

  it("inscrit l'échec (sans détail sensible) quand LiteLLM refuse", async () => {
    const { state, client } = fakeLitellm();
    state.failOn = "/model/new";
    await expect(
      syncLitellm(t.db, { client, getSecret }),
    ).rejects.toMatchObject({
      code: "litellm_unavailable",
    });
    const rows = await t.db
      .select()
      .from(configVersions)
      .where(eq(configVersions.status, "published"));
    expect(rows[0]?.appliedStatus).toBe("failed");
    expect(JSON.stringify(rows[0]?.appliedDetail)).not.toContain(
      "vk-super-secret",
    );
  });
});
