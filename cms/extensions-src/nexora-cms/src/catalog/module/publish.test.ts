import { describe, expect, test } from "bun:test";
import type { CallResult } from "./errors";
import {
  promoteToLive,
  publishCatalog,
  publishModel,
  STEP_LABELS,
} from "./publish";

type Handler = (body: unknown) => CallResult;
function fake(handlers: Record<string, Handler>) {
  const calls: string[] = [];
  const call = (async (method: string, path: string, body?: unknown) => {
    const key = `${method} ${path.replace(/[0-9a-f-]{36}/g, ":id")}`;
    calls.push(key);
    const h = handlers[key];
    if (!h) throw new Error(`appel inattendu : ${key}`);
    return h(body);
  }) as never;
  return { call, calls };
}
const ok = (data: unknown = {}): CallResult => ({ ok: true, data });
const ID = "123e4567-e89b-42d3-a456-426614174000";
const VID = "223e4567-e89b-42d3-a456-426614174000";
const model = (status: string) => ({ id: ID, publicId: "nexora/x", status });
const draftOk = (status = "draft") =>
  ok({
    version: { id: VID, short: "cat_abc", status },
    created: true,
    unchanged: false,
    diff: [{ kind: "model_added", model: "nexora/x" }],
    issues: [],
  });

describe("publier un modèle", () => {
  test("brouillon : approuver le modèle, le publier, puis créer, approuver et publier la version", async () => {
    const { call, calls } = fake({
      "PATCH models/:id": () => ok(),
      "POST versions": () => draftOk(),
      "POST versions/:id/approve": () => ok(),
      "POST versions/:id/publish": () => ok(),
    });
    const steps: string[] = [];
    const r = await publishModel(call, model("draft"), { sync: false }, (s) =>
      steps.push(s),
    );
    expect(calls).toEqual([
      "PATCH models/:id",
      "PATCH models/:id",
      "POST versions",
      "POST versions/:id/approve",
      "POST versions/:id/publish",
    ]);
    expect(steps).toEqual([
      "model_approved",
      "model_published",
      "version_drafted",
      "version_approved",
      "version_published",
    ]);
    expect(r).toMatchObject({ ok: true, version: "cat_abc", synced: null });
    expect(r.ok && r.diff).toHaveLength(1);
  });
  test("déjà publié : on n'écrit pas de statut, on passe directement à la version", async () => {
    const { call, calls } = fake({
      "POST versions": () => draftOk(),
      "POST versions/:id/approve": () => ok(),
      "POST versions/:id/publish": () => ok(),
    });
    await publishModel(call, model("published"), { sync: false });
    expect(calls[0]).toBe("POST versions");
  });
  test("modèle retiré : repasse par brouillon, approuvé, publié", async () => {
    const bodies: unknown[] = [];
    const { call } = fake({
      "PATCH models/:id": (b) => (bodies.push(b), ok()),
      "POST versions": () => draftOk(),
      "POST versions/:id/approve": () => ok(),
      "POST versions/:id/publish": () => ok(),
    });
    await publishModel(call, model("retired"), { sync: false });
    expect(bodies).toEqual([
      { status: "draft" },
      { status: "approved" },
      { status: "published" },
    ]);
  });
  test("version déjà approuvée (relance après un échec) : on ne ré-approuve pas", async () => {
    const { call, calls } = fake({
      "POST versions": () => draftOk("approved"),
      "POST versions/:id/publish": () => ok(),
    });
    await publishModel(call, model("published"), { sync: false });
    expect(calls).toEqual(["POST versions", "POST versions/:id/publish"]);
  });
  test("catalogue inchangé : rien à publier, ce n'est pas une erreur", async () => {
    const { call, calls } = fake({
      "POST versions": () =>
        ok({
          version: { id: VID, short: "cat_abc", status: "published" },
          created: false,
          unchanged: true,
          diff: [],
          issues: [],
        }),
    });
    const r = await publishModel(call, model("published"), { sync: false });
    expect(calls).toEqual(["POST versions"]);
    expect(r).toMatchObject({ ok: true, unchanged: true });
  });
  test("refus de la garde : l'étape fautive et les problèmes sont rendus, rien d'autre n'est appelé", async () => {
    const { call, calls } = fake({
      "PATCH models/:id": () => ({
        ok: false,
        error: {
          code: "publication_refused",
          status: 422,
          text: "Refusé par la garde de publication.",
          issues: [{ code: "price_missing" }],
        },
      }),
    });
    const r = await publishModel(call, model("draft"), { sync: true });
    expect(calls).toEqual(["PATCH models/:id"]);
    expect(r).toMatchObject({ ok: false, failedStep: "model_approved" });
    if (!r.ok) expect(r.error.issues).toHaveLength(1);
  });
  test("problèmes dans le brouillon de version (clé absente) : arrêt avant l'approbation", async () => {
    const { call, calls } = fake({
      "PATCH models/:id": () => ok(),
      "POST versions": () =>
        ok({
          version: { id: VID, short: "cat_abc", status: "draft" },
          created: true,
          unchanged: false,
          diff: [],
          issues: [
            { code: "secret_missing", model: "nexora/x", provider: "p" },
          ],
        }),
    });
    const r = await publishModel(call, model("approved"), { sync: false });
    expect(calls).toEqual(["PATCH models/:id", "POST versions"]);
    expect(r).toMatchObject({ ok: false, failedStep: "version_drafted" });
    if (!r.ok) expect(r.error.issues[0]?.code).toBe("secret_missing");
  });
  test("synchronisation LiteLLM : réussie, ou échouée sans défaire la publication", async () => {
    const base = {
      "POST versions": () => draftOk(),
      "POST versions/:id/approve": () => ok(),
      "POST versions/:id/publish": () => ok(),
    };
    const good = fake({
      ...base,
      "POST sync-litellm": () =>
        ok({
          summary: { models: { created: ["a"], updated: [], deleted: [] } },
        }),
    });
    expect(
      await publishModel(good.call, model("published"), { sync: true }),
    ).toMatchObject({ ok: true, synced: true });
    const bad = fake({
      ...base,
      "POST sync-litellm": () => ({
        ok: false,
        error: {
          code: "litellm_unavailable",
          status: 502,
          text: "LiteLLM a refusé ou n’a pas répondu.",
          issues: [],
        },
      }),
    });
    const r = await publishModel(bad.call, model("published"), { sync: true });
    expect(r).toMatchObject({ ok: true, synced: false });
    expect(r.ok && r.syncError).toContain("LiteLLM");
  });
});

describe("mettre en ligne une version du catalogue", () => {
  test("sans toucher à un modèle (retrait, nouveau prix) : version, approbation, publication", async () => {
    const { call, calls } = fake({
      "POST versions": () => draftOk(),
      "POST versions/:id/approve": () => ok(),
      "POST versions/:id/publish": () => ok(),
    });
    const r = await publishCatalog(call, { sync: false });
    expect(calls).toEqual([
      "POST versions",
      "POST versions/:id/approve",
      "POST versions/:id/publish",
    ]);
    expect(r).toMatchObject({ ok: true, version: "cat_abc" });
  });
});

describe("passer un modèle en service", () => {
  test("modifie la disponibilité, puis met en ligne une nouvelle version du catalogue", async () => {
    const bodies: unknown[] = [];
    const { call, calls } = fake({
      "PATCH models/:id": (b) => (bodies.push(b), ok()),
      "POST versions": () => draftOk(),
      "POST versions/:id/approve": () => ok(),
      "POST versions/:id/publish": () => ok(),
      "POST sync-litellm": () => ok(),
    });
    const steps: string[] = [];
    const r = await promoteToLive(
      call,
      model("published"),
      { sync: true },
      (s) => steps.push(s),
    );
    expect(bodies).toEqual([{ availability: "live" }]);
    expect(calls).toEqual([
      "PATCH models/:id",
      "POST versions",
      "POST versions/:id/approve",
      "POST versions/:id/publish",
      "POST sync-litellm",
    ]);
    expect(steps).toEqual([
      "model_live",
      "version_drafted",
      "version_approved",
      "version_published",
      "synced",
    ]);
    expect(r).toMatchObject({ ok: true, synced: true });
  });

  test("sans clé dans le Coffre, le serveur refuse : rien n'est publié et les problèmes sont rendus", async () => {
    const { call, calls } = fake({
      "PATCH models/:id": () => ({
        ok: false,
        error: {
          code: "publication_refused",
          status: 422,
          text: "Refusé par la garde de publication.",
          issues: [{ code: "secret_missing", provider: "deepinfra" }],
        },
      }),
    });
    const r = await promoteToLive(call, model("published"), { sync: false });
    expect(calls).toEqual(["PATCH models/:id"]);
    expect(r).toMatchObject({ ok: false, failedStep: "model_live" });
    if (!r.ok) expect(r.error.issues[0]?.code).toBe("secret_missing");
  });

  test("a un libellé d'étape lisible", () => {
    expect(STEP_LABELS.model_live).toBe("Modèle passé en service");
  });
});
