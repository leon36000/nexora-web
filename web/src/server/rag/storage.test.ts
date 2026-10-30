import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setExtraStorage } from "../billing/entitlements";
import { createBaseWithKey } from "./bases";
import { addDocument, deleteDocument } from "./documents";
import { entitlementsStorage } from "./storage";
import { type RagTestEnv, ragTestEnv } from "./test-support";

let env: RagTestEnv;
beforeAll(async () => {
  env = await ragTestEnv();
});
afterAll(async () => {
  await env.close();
});

const TEXT =
  "# Procédure\n\nPour annuler une commande, ouvrez la fiche de la commande puis cliquez sur Annuler et confirmez.";

async function setup() {
  const org = await env.org();
  const made = await createBaseWithKey(env.deps, {
    organizationId: org,
    userId: null,
    name: "Espace",
  });
  if (!made.ok) throw new Error(made.failure.code);
  const key = await env.t.db.query.apiKeys.findFirst({
    where: (k, { eq }) => eq(k.id, made.value.keyId),
  });
  if (!key) throw new Error("clé");
  // Le compteur réel des offres à la place du compteur d'essai.
  const deps = { ...env.deps, storage: entitlementsStorage(() => env.t.db) };
  return {
    org,
    base: made.value.base,
    ctx: { organizationId: org, key },
    deps,
  };
}

describe("compteur d'espace du module des offres (recordStorageUsage, produit « rag »)", () => {
  it("sans espace dans l'offre : quota_exceeded avec la marche à suivre, rien n'est gardé ni payé", async () => {
    const { base, ctx, deps } = await setup();
    const calls = env.upstream.embedCalls;
    const r = await addDocument(deps, ctx, {
      baseId: base.id,
      title: "A",
      text: TEXT,
    });
    expect(r).toMatchObject({
      ok: false,
      failure: { status: 507, code: "quota_exceeded" },
    });
    expect(env.upstream.embedCalls).toBe(calls);
  });

  it("avec de l'espace : l'usage du produit « rag » suit les ajouts et les suppressions, sans toucher aux autres produits", async () => {
    const { org, base, ctx, deps } = await setup();
    await setExtraStorage(env.t.db, org, 1_000_000);
    const added = await addDocument(deps, ctx, {
      baseId: base.id,
      title: "A",
      text: TEXT,
    });
    if (!added.ok) throw new Error(added.failure.code);
    expect(await deps.storage.used(org)).toBe(added.value.document.bytes);
    expect(added.value.document.bytes).toBeGreaterThan(2000);
    const gone = await deleteDocument(
      deps,
      org,
      base.id,
      added.value.document.id,
    );
    expect(gone.ok).toBe(true);
    expect(await deps.storage.used(org)).toBe(0);
  });

  it("refuse l'ajout qui dépasse l'espace restant, mais laisse libérer", async () => {
    const { org, base, ctx, deps } = await setup();
    await setExtraStorage(env.t.db, org, 3000);
    const first = await addDocument(deps, ctx, {
      baseId: base.id,
      title: "A",
      text: TEXT,
    });
    expect(first.ok).toBe(true);
    const second = await addDocument(deps, ctx, {
      baseId: base.id,
      title: "B",
      text: `${TEXT} Deuxième version un peu différente.`,
    });
    expect(second).toMatchObject({
      ok: false,
      failure: { code: "quota_exceeded" },
    });
    if (first.ok)
      expect(
        (await deleteDocument(deps, org, base.id, first.value.document.id)).ok,
      ).toBe(true);
    expect(await deps.storage.used(org)).toBe(0);
  });
});
