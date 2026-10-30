import { apiKeys, eq, ragDocuments } from "@nexora/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { handleAccountRag, type RagAccountDeps } from "./account";
import { createBaseWithKey } from "./bases";
import { addDocument } from "./documents";
import { handleIndexJob } from "./internal";
import { provisionalStorage } from "./provisional-storage";
import { connectionSnippets } from "./snippets";
import { type RagTestEnv, ragTestEnv } from "./test-support";

let env: RagTestEnv;
beforeAll(async () => {
  env = await ragTestEnv({ config: { inlineMaxChunks: 3, embedBatch: 2 } });
});
afterAll(async () => {
  await env.close();
});
beforeEach(() => {
  env.jobs.length = 0;
});

const SITE = "https://nexora.example";
let context: {
  userId: string;
  organizationId: string;
  role: "owner" | "member";
} | null;
const accountDeps = (): RagAccountDeps => ({
  ...env.deps,
  siteUrl: SITE,
  getContext: async () => context,
});
const call = (
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  handleAccountRag(
    new Request(`${SITE}/api/account/rag${path}`, {
      method,
      headers: {
        origin: SITE,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    accountDeps(),
  );
const as = (organizationId: string, role: "owner" | "member" = "owner") => {
  context = { userId: "user_1", organizationId, role };
};

describe("RAG du compte : création en un clic", () => {
  it("crée la base et sa clé, montre la clé UNE fois avec les configurations à copier, et ne la remontre jamais", async () => {
    const org = await env.org();
    as(org);
    const res = await call("POST", "", { name: "Contrats" });
    expect(res.status).toBe(201);
    const made = await res.json();
    expect(made.key.value).toMatch(/^nxk_/);
    expect(made.base).toMatchObject({ object: "base", name: "Contrats" });
    expect(made.endpoints).toEqual({
      api: `${SITE}/v1/rag`,
      mcp: `${SITE}/v1/rag/mcp`,
    });
    expect(JSON.stringify(made.snippets)).toContain(made.key.value);
    expect(made.snippets.mcp.mcpServers["nexora-rag"].url).toBe(
      `${SITE}/v1/rag/mcp`,
    );
    // Relecture : jamais la valeur de la clé, seulement un préfixe.
    const keys = await (await call("GET", `/${made.base.id}/keys`)).json();
    expect(JSON.stringify(keys)).not.toContain(made.key.value);
    expect(keys.data[0]).toMatchObject({
      id: made.key.id,
      mode: "write",
      revoked: false,
    });
    const detail = await (await call("GET", `/${made.base.id}`)).json();
    expect(JSON.stringify(detail)).not.toContain(made.key.value);
    expect(JSON.stringify(detail.snippets)).toContain("nxk_votre_cle");
  });

  it("refuse sans session (401), à un simple membre (403), depuis une autre origine (403) et un nom invalide (422)", async () => {
    const org = await env.org();
    context = null;
    expect((await call("POST", "", { name: "x" })).status).toBe(401);
    as(org, "member");
    expect((await call("POST", "", { name: "x" })).status).toBe(403);
    as(org);
    expect(
      (
        await call(
          "POST",
          "",
          { name: "x" },
          { origin: "https://evil.example" },
        )
      ).status,
    ).toBe(403);
    expect((await call("POST", "", { name: "" })).status).toBe(422);
    expect((await call("POST", "", { name: "ok", imprévu: 1 })).status).toBe(
      422,
    );
  });

  it("un membre peut lire la liste et l'état de ses bases, pas ceux d'une autre organisation", async () => {
    const a = await env.org();
    const b = await env.org();
    as(a);
    const made = await (await call("POST", "", { name: "Visible" })).json();
    as(b);
    await call("POST", "", { name: "Autre" });
    as(a, "member");
    const list = await (await call("GET", "")).json();
    expect(list.data.map((x: { name: string }) => x.name)).toEqual(["Visible"]);
    expect(typeof list.storage.used_bytes).toBe("number");
    as(b, "member");
    expect((await call("GET", `/${made.base.id}`)).status).toBe(404);
    expect((await call("DELETE", `/${made.base.id}`)).status).toBe(403);
  });
});

describe("RAG du compte : documents, clés, suppression", () => {
  it("ajoute un document avec la clé de la base, l'interroge, crée une 2e clé en lecture, révoque, puis supprime la base", async () => {
    const org = await env.org();
    as(org);
    const made = await (await call("POST", "", { name: "Cycle" })).json();
    const id = made.base.id;
    const added = await call("POST", `/${id}/documents`, {
      title: "Procédure",
      text: "# Procédure\n\nPour annuler une commande, ouvrez la fiche de la commande puis cliquez sur Annuler.",
    });
    expect(added.status).toBe(201);
    const q = await (
      await call("POST", `/${id}/query`, { query: "annuler une commande" })
    ).json();
    expect(q.data[0].document_title).toBe("Procédure");
    const second = await (
      await call("POST", `/${id}/keys`, { name: "Robot", mode: "read" })
    ).json();
    expect(second.key.value).toMatch(/^nxk_/);
    expect(second.mode).toBe("read");
    // Révoquer la 2e clé.
    const keysBefore = await (await call("GET", `/${id}/keys`)).json();
    expect(keysBefore.data).toHaveLength(2);
    expect((await call("DELETE", `/${id}/keys/${second.key.id}`)).status).toBe(
      200,
    );
    const row = await env.t.db.query.apiKeys.findFirst({
      where: (k, { eq: e }) => e(k.id, second.key.id),
    });
    expect(row?.revokedAt).not.toBeNull();
    // Supprimer la base : tout l'espace est rendu.
    expect(env.storage.usedBytes(org)).toBeGreaterThan(0);
    expect((await call("DELETE", `/${id}`)).status).toBe(200);
    expect(env.storage.usedBytes(org)).toBe(0);
    expect((await call("GET", `/${id}`)).status).toBe(404);
  });

  it("indexe sans clé active ? refuse avec la marche à suivre", async () => {
    const org = await env.org();
    as(org);
    const made = await (await call("POST", "", { name: "Sans clé" })).json();
    await env.t.db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.id, made.key.id));
    const res = await call("POST", `/${made.base.id}/documents`, {
      text: "Un texte quelconque pour essayer.",
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("no_active_key");
  });
});

describe("tâche d'indexation du worker (POST /api/admin/rag/index)", () => {
  const TOKEN = "jeton-d-administration-assez-long-pour-etre-accepte-1234";
  const index = (body: unknown, token: string | null = TOKEN) =>
    handleIndexJob(
      new Request("http://localhost/api/admin/rag/index", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      }),
      { ...env.deps, adminToken: TOKEN },
    );

  it("exige le jeton d'administration", async () => {
    expect((await index({ documentId: "x" }, null)).status).toBe(401);
    expect(
      (
        await index(
          { documentId: "x" },
          "faux-jeton-faux-jeton-faux-jeton-faux-jeton",
        )
      ).status,
    ).toBe(401);
  });

  it("indexe une tranche d'un gros document avec la clé de la base et dit s'il reste du travail", async () => {
    const org = await env.org();
    const made = await createBaseWithKey(env.deps, {
      organizationId: org,
      userId: null,
      name: "Gros",
    });
    if (!made.ok) throw new Error("base");
    const key = await env.t.db.query.apiKeys.findFirst({
      where: (k, { eq: e }) => e(k.id, made.value.keyId),
    });
    if (!key) throw new Error("clé");
    const big = Array.from(
      { length: 12 },
      (_, i) =>
        `## S${i}\n\n${"Du texte assez long pour faire un extrait. ".repeat(40)}`,
    ).join("\n\n");
    const added = await addDocument(
      env.deps,
      { organizationId: org, key },
      { baseId: made.value.base.id, title: "Gros", text: big },
    );
    if (!added.ok) throw new Error("doc");
    expect(added.value.document.status).toBe("queued");
    const first = await (
      await index({ documentId: added.value.document.id, budgetMs: 0 })
    ).json();
    expect(first.state).toBe("partial");
    const last = await (
      await index({ documentId: added.value.document.id })
    ).json();
    expect(last.state).toBe("ready");
    const [doc] = await env.t.db
      .select()
      .from(ragDocuments)
      .where(eq(ragDocuments.id, added.value.document.id));
    expect(doc?.status).toBe("ready");
    expect(
      (await (await index({ documentId: added.value.document.id })).json())
        .state,
    ).toBe("gone");
  });

  it("marque le document échoué (aucune clé active) au lieu de boucler", async () => {
    const org = await env.org();
    const made = await createBaseWithKey(env.deps, {
      organizationId: org,
      userId: null,
      name: "Orpheline",
    });
    if (!made.ok) throw new Error("base");
    const key = await env.t.db.query.apiKeys.findFirst({
      where: (k, { eq: e }) => e(k.id, made.value.keyId),
    });
    if (!key) throw new Error("clé");
    const big = Array.from(
      { length: 12 },
      (_, i) => `## S${i}\n\n${"Texte de remplissage assez long. ".repeat(40)}`,
    ).join("\n\n");
    const added = await addDocument(
      env.deps,
      { organizationId: org, key },
      { baseId: made.value.base.id, title: "X", text: big },
    );
    if (!added.ok) throw new Error("doc");
    await env.t.db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.id, key.id));
    const res = await (
      await index({ documentId: added.value.document.id })
    ).json();
    expect(res.state).toBe("failed");
    expect(res.error).toBe("no_active_key");
    const [doc] = await env.t.db
      .select()
      .from(ragDocuments)
      .where(eq(ragDocuments.id, added.value.document.id));
    expect(doc).toMatchObject({
      status: "failed",
      errorCode: "no_active_key",
      pendingText: null,
      storedBytes: 0,
    });
    expect(env.storage.usedBytes(org)).toBe(0);
  });
});

describe("compteur d'espace provisoire (en attendant le module des offres)", () => {
  it("refuse quand les documents enregistrés dépassent le quota, rend toujours une libération", async () => {
    const org = await env.org();
    const made = await createBaseWithKey(env.deps, {
      organizationId: org,
      userId: null,
      name: "Quota",
    });
    if (!made.ok) throw new Error("base");
    const [doc] = await env.t.db
      .insert(ragDocuments)
      .values({
        baseId: made.value.base.id,
        organizationId: org,
        title: "t",
        status: "ready",
        contentHash: "h",
        storedBytes: 1500,
      })
      .returning();
    expect(doc).toBeTruthy();
    const storage = provisionalStorage(() => env.t.db, 2000);
    expect(await storage.used(org)).toBe(1500);
    expect(await storage.record(org, 400)).toEqual({ ok: true });
    await env.t.db
      .update(ragDocuments)
      .set({ storedBytes: 2500 })
      .where(eq(ragDocuments.baseId, made.value.base.id));
    expect(await storage.record(org, 1000)).toEqual({
      ok: false,
      reason: "quota_exceeded",
    });
    expect(await storage.record(org, -1000)).toEqual({ ok: true });
  });
});

describe("configurations à copier", () => {
  it("MCP (format .mcp.json), Nexora Code, curl et variables d'environnement, avec la clé ou un exemple", () => {
    const withKey = connectionSnippets({
      siteUrl: SITE,
      baseName: "Contrats",
      baseId: "b1",
      key: "nxk_secret",
    });
    expect(withKey.mcp).toEqual({
      mcpServers: {
        "nexora-rag": {
          type: "http",
          url: `${SITE}/v1/rag/mcp`,
          headers: { Authorization: "Bearer nxk_secret" },
        },
      },
    });
    expect(withKey.nexoraCode.mcp["nexora-rag"]).toMatchObject({
      type: "remote",
      url: `${SITE}/v1/rag/mcp`,
      headers: { Authorization: "Bearer nxk_secret" },
      enabled: true,
    });
    expect(withKey.curl).toContain(`${SITE}/v1/rag/bases/b1/query`);
    expect(withKey.curl).toContain("Bearer nxk_secret");
    expect(withKey.env).toContain("NEXORA_RAG_API_KEY=nxk_secret");
    const without = connectionSnippets({
      siteUrl: SITE,
      baseName: "Contrats",
      baseId: "b1",
    });
    expect(JSON.stringify(without)).toContain("nxk_votre_cle");
    expect(JSON.stringify(without)).not.toContain("nxk_secret");
  });
});
