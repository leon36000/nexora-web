import { apiKeys, eq } from "@nexora/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createBase, createBaseWithKey, createRagKey } from "./bases";
import { handleRag } from "./http";
import { handleMcp } from "./mcp";
import { type RagTestEnv, ragTestEnv } from "./test-support";

// biome-ignore lint/suspicious/noExplicitAny: forme libre des réponses JSON-RPC lues par les essais
type Libre = any;

let env: RagTestEnv;
beforeAll(async () => {
  env = await ragTestEnv({ config: { inlineMaxChunks: 4, embedBatch: 2 } });
});
afterAll(async () => {
  await env.close();
});
beforeEach(() => {
  env.logLines.length = 0;
  env.jobs.length = 0;
});

const httpDeps = () => ({
  ...env.deps,
  allowedOrigins: ["https://nexora.example"],
});
const ok = <T>(
  r: { ok: true; value: T } | { ok: false; failure: { code: string } },
): T => {
  if (!r.ok) throw new Error(`échec : ${r.failure.code}`);
  return r.value;
};
async function client(balance?: bigint, name = "Base HTTP") {
  const org = await env.org(balance);
  const made = ok(
    await createBaseWithKey(env.deps, {
      organizationId: org,
      userId: null,
      name,
    }),
  );
  return { org, base: made.base, secret: made.key, keyId: made.keyId };
}
const req = (
  secret: string | null,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  new Request(`http://localhost/v1/rag${path}`, {
    method,
    headers: {
      ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body:
      body === undefined
        ? undefined
        : typeof body === "string"
          ? body
          : JSON.stringify(body),
  });
const call = (r: Request) => handleRag(r, httpDeps());

const TEXT =
  "# Politique\n\nLes remboursements sont traités sous dix jours ouvrables après réception de la demande écrite du client.";

describe("API REST /v1/rag : accès", () => {
  it("refuse sans clé, avec une clé inconnue, et avec une clé sans permission RAG", async () => {
    expect((await call(req(null, "GET", "/bases"))).status).toBe(401);
    expect(
      (await call(req(`nxk_${"a".repeat(43)}`, "GET", "/bases"))).status,
    ).toBe(401);
    const org = await env.org();
    const { createApiKey } = await import("../gateway/keys");
    const plain = await createApiKey(env.t.db, {
      organizationId: org,
      name: "sans rag",
    });
    const res = await call(req(plain.key, "GET", "/bases"));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("operation_not_allowed");
  });

  it("ne liste que les bases de la portée de la clé", async () => {
    const c = await client(undefined, "Base visible");
    ok(
      await createBase(env.deps, {
        organizationId: c.org,
        userId: null,
        name: "Base cachée",
      }),
    );
    const res = await call(req(c.secret, "GET", "/bases"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.map((b: { name: string }) => b.name)).toEqual([
      "Base visible",
    ]);
    expect(json.data[0]).toMatchObject({
      id: c.base.id,
      embedding_model: "nexora/qwen3-embedding-8b",
      documents: 0,
    });
  });

  it("une base de la même organisation hors portée est introuvable (404), comme une base inexistante", async () => {
    const c = await client(undefined, "Dans la portée");
    const other = ok(
      await createBase(env.deps, {
        organizationId: c.org,
        userId: null,
        name: "Hors portée",
      }),
    );
    for (const id of [
      other.id,
      "00000000-0000-0000-0000-000000000000",
      "pas-un-id",
    ]) {
      const res = await call(
        req(c.secret, "POST", `/bases/${id}/query`, { query: "x" }),
      );
      expect(res.status, id).toBe(404);
      expect((await res.json()).error.code).toBe("base_not_found");
    }
  });

  it("une clé en lecture seule cherche et liste, mais n'ajoute ni ne supprime", async () => {
    const c = await client();
    const ro = ok(
      await createRagKey(env.deps, {
        organizationId: c.org,
        baseIds: [c.base.id],
        mode: "read",
        name: "lecture",
      }),
    );
    expect(
      (
        await call(
          req(ro.key, "POST", `/bases/${c.base.id}/query`, { query: "x" }),
        )
      ).status,
    ).toBe(200);
    expect(
      (await call(req(ro.key, "GET", `/bases/${c.base.id}/documents`))).status,
    ).toBe(200);
    const add = await call(
      req(ro.key, "POST", `/bases/${c.base.id}/documents`, { text: TEXT }),
    );
    expect(add.status).toBe(403);
    expect((await add.json()).error.code).toBe("read_only_key");
    const del = await call(
      req(
        ro.key,
        "DELETE",
        `/bases/${c.base.id}/documents/${"0".repeat(8)}-0000-0000-0000-${"0".repeat(12)}`,
      ),
    );
    expect(del.status).toBe(403);
  });

  it("limite le débit par clé (429 avec Retry-After)", async () => {
    const c = await client();
    await env.t.db
      .update(apiKeys)
      .set({ rpmLimit: 2 })
      .where(eq(apiKeys.id, c.keyId));
    const statuses: number[] = [];
    let last: Response | null = null;
    for (let i = 0; i < 4; i++) {
      last = await call(req(c.secret, "GET", "/bases"));
      statuses.push(last.status);
    }
    expect(statuses).toEqual([200, 200, 429, 429]);
    expect(last?.headers.get("retry-after")).toMatch(/^\d+$/);
  });

  it("répond 404 à une adresse inconnue et 405 à une mauvaise méthode", async () => {
    const c = await client();
    expect((await call(req(c.secret, "GET", "/nimporte"))).status).toBe(404);
    const res = await call(req(c.secret, "PUT", `/bases/${c.base.id}`));
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBeTruthy();
  });
});

describe("API REST /v1/rag : documents et recherche", () => {
  it("ajoute un document en JSON, le liste, le relit, le cherche, puis le supprime", async () => {
    const c = await client();
    const added = await call(
      req(c.secret, "POST", `/bases/${c.base.id}/documents`, {
        title: "Remboursements",
        text: TEXT,
        metadata: { service: "ventes" },
      }),
    );
    expect(added.status).toBe(201);
    const doc = await added.json();
    expect(doc).toMatchObject({
      object: "document",
      title: "Remboursements",
      status: "ready",
      metadata: { service: "ventes" },
      duplicate: false,
    });
    // Même contenu : 200, même document.
    const again = await call(
      req(c.secret, "POST", `/bases/${c.base.id}/documents`, {
        title: "Autre",
        text: TEXT,
      }),
    );
    expect(again.status).toBe(200);
    expect((await again.json()).id).toBe(doc.id);

    const list = await (
      await call(req(c.secret, "GET", `/bases/${c.base.id}/documents`))
    ).json();
    expect(list.data.map((d: { id: string }) => d.id)).toEqual([doc.id]);
    expect(
      (
        await (
          await call(
            req(c.secret, "GET", `/bases/${c.base.id}/documents/${doc.id}`),
          )
        ).json()
      ).title,
    ).toBe("Remboursements");

    const q = await call(
      req(c.secret, "POST", `/bases/${c.base.id}/query`, {
        query: "délai de remboursement",
        top_k: 3,
      }),
    );
    expect(q.status).toBe(200);
    expect(q.headers.get("x-nexora-cost-micro")).toMatch(/^\d+$/);
    const found = await q.json();
    expect(found.data[0]).toMatchObject({
      document_title: "Remboursements",
      heading: "Politique",
    });
    // Un seul extrait candidat : pas de reclassement à payer.
    expect(found.rerank).toMatchObject({
      requested: true,
      applied: false,
      reason: "single_candidate",
    });

    expect(
      (
        await call(
          req(c.secret, "DELETE", `/bases/${c.base.id}/documents/${doc.id}`),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          req(c.secret, "GET", `/bases/${c.base.id}/documents/${doc.id}`),
        )
      ).status,
    ).toBe(404);
  });

  it("reçoit un fichier par formulaire (multipart)", async () => {
    const c = await client();
    const form = new FormData();
    form.set(
      "file",
      new File([TEXT], "remboursements.md", { type: "text/markdown" }),
    );
    form.set("metadata", JSON.stringify({ origine: "televersement" }));
    const res = await call(
      new Request(`http://localhost/v1/rag/bases/${c.base.id}/documents`, {
        method: "POST",
        headers: { authorization: `Bearer ${c.secret}` },
        body: form,
      }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      title: "Politique",
      source: "remboursements.md",
      metadata: { origine: "televersement" },
    });
  });

  it("répond 202 pour un gros document (indexation par le worker) et 413 au-delà de la taille permise", async () => {
    const c = await client();
    const big = Array.from(
      { length: 30 },
      (_, i) => `## S${i}\n\n${"Du texte pour remplir. ".repeat(60)}`,
    ).join("\n\n");
    const res = await call(
      req(c.secret, "POST", `/bases/${c.base.id}/documents`, {
        title: "Gros",
        text: big,
      }),
    );
    expect(res.status).toBe(202);
    expect((await res.json()).status).toBe("queued");
    expect(env.jobs[0]?.type).toBe("rag.index");
    const tiny = {
      ...httpDeps(),
      config: { ...env.deps.config, maxBodyBytes: 200, maxFileBytes: 100 },
    };
    const huge = await handleRag(
      req(c.secret, "POST", `/bases/${c.base.id}/documents`, {
        text: "a".repeat(1000),
      }),
      tiny,
    );
    expect(huge.status).toBe(413);
  });

  it("rejette un JSON invalide et des champs inconnus ou mal typés", async () => {
    const c = await client();
    expect(
      (
        await call(
          req(c.secret, "POST", `/bases/${c.base.id}/query`, "{pas du json"),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          req(c.secret, "POST", `/bases/${c.base.id}/query`, { query: 12 }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          req(c.secret, "POST", `/bases/${c.base.id}/query`, {
            query: "x",
            top_k: "5",
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          req(c.secret, "POST", `/bases/${c.base.id}/query`, {
            query: "x",
            imprévu: true,
          }),
        )
      ).status,
    ).toBe(400);
  });

  it("solde nul : mêmes 402 que la passerelle", async () => {
    const c = await client(0n);
    const res = await call(
      req(c.secret, "POST", `/bases/${c.base.id}/query`, { query: "bonjour" }),
    );
    expect(res.status).toBe(402);
    expect((await res.json()).error).toMatchObject({
      code: "insufficient_quota",
      message:
        "Solde de crédits insuffisant pour cette requête. Rechargez votre compte.",
    });
  });

  it("ne journalise ni la requête ni le contenu", async () => {
    const c = await client();
    const marker = "PHRASE-TRÈS-SECRÈTE-DU-CLIENT";
    await call(
      req(c.secret, "POST", `/bases/${c.base.id}/documents`, {
        text: `${marker} dans un document assez long pour exister.`,
      }),
    );
    await call(
      req(c.secret, "POST", `/bases/${c.base.id}/query`, { query: marker }),
    );
    expect(env.logLines.join("\n")).not.toContain(marker);
  });
});

describe("serveur MCP /v1/rag/mcp", () => {
  const rpc = (
    secret: string | null,
    message: unknown,
    headers: Record<string, string> = {},
  ) =>
    handleMcp(
      new Request("http://localhost/v1/rag/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...(secret ? { authorization: `Bearer ${secret}` } : {}),
          ...headers,
        },
        body: JSON.stringify(message),
      }),
      httpDeps(),
    );
  const result = async (res: Response) =>
    (await res.json()) as {
      jsonrpc: string;
      id: number;
      result?: Libre;
      error?: { code: number; message: string };
    };

  it("négocie la version, annonce les outils et reste sans état", async () => {
    const c = await client();
    const init = await result(
      await rpc(c.secret, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "essai", version: "1" },
        },
      }),
    );
    expect(init.result.protocolVersion).toBe("2025-06-18");
    expect(init.result.capabilities.tools).toBeTruthy();
    expect(init.result.serverInfo.name).toBe("nexora-rag");
    const old = await result(
      await rpc(c.secret, {
        jsonrpc: "2.0",
        id: 2,
        method: "initialize",
        params: { protocolVersion: "1999-01-01" },
      }),
    );
    expect(["2025-11-25", "2025-06-18", "2025-03-26"]).toContain(
      old.result.protocolVersion,
    );
    const note = await rpc(c.secret, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    expect(note.status).toBe(202);
    const tools = await result(
      await rpc(c.secret, { jsonrpc: "2.0", id: 3, method: "tools/list" }),
    );
    expect(tools.result.tools.map((t: { name: string }) => t.name)).toEqual([
      "rag_search",
      "rag_list_documents",
      "rag_add_document",
    ]);
    for (const t of tools.result.tools) {
      expect(t.inputSchema.type).toBe("object");
      expect(t.description.length).toBeGreaterThan(20);
    }
    expect(
      (
        await result(
          await rpc(c.secret, { jsonrpc: "2.0", id: 4, method: "ping" }),
        )
      ).result,
    ).toEqual({});
  });

  it("rag_add_document puis rag_search puis rag_list_documents, avec la base par défaut de la clé", async () => {
    const c = await client();
    const call1 = await result(
      await rpc(c.secret, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "rag_add_document",
          arguments: { title: "Remboursements", text: TEXT },
        },
      }),
    );
    expect(call1.result.isError).toBeFalsy();
    expect(call1.result.content[0].text).toMatch(/Remboursements/);
    const search = await result(
      await rpc(c.secret, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "rag_search",
          arguments: { query: "délai de remboursement", top_k: 2 },
        },
      }),
    );
    expect(search.result.isError).toBeFalsy();
    expect(search.result.content[0].text).toContain("Remboursements");
    expect(search.result.content[0].text).toContain("dix jours ouvrables");
    expect(search.result.structuredContent.results[0]).toMatchObject({
      document_title: "Remboursements",
    });
    const list = await result(
      await rpc(c.secret, {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "rag_list_documents", arguments: {} },
      }),
    );
    expect(list.result.content[0].text).toContain("Remboursements");
  });

  it("désigne la base par son nom, exige de la nommer quand la clé en couvre plusieurs", async () => {
    const c = await client(undefined, "Alpha");
    const beta = ok(
      await createBase(env.deps, {
        organizationId: c.org,
        userId: null,
        name: "Beta",
      }),
    );
    const both = ok(
      await createRagKey(env.deps, {
        organizationId: c.org,
        baseIds: [c.base.id, beta.id],
        mode: "write",
        name: "deux",
      }),
    );
    const ambiguous = await result(
      await rpc(both.key, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "rag_search", arguments: { query: "x" } },
      }),
    );
    expect(ambiguous.result.isError).toBe(true);
    expect(ambiguous.result.content[0].text).toMatch(
      /Alpha.*Beta|Beta.*Alpha/s,
    );
    const named = await result(
      await rpc(both.key, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "rag_search", arguments: { query: "x", base: "Beta" } },
      }),
    );
    expect(named.result.isError).toBeFalsy();
    const unknown = await result(
      await rpc(both.key, {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "rag_search",
          arguments: { query: "x", base: "Gamma" },
        },
      }),
    );
    expect(unknown.result.isError).toBe(true);
  });

  it("une clé en lecture seule ne peut pas ajouter ; l'erreur est un résultat d'outil, pas une panne du protocole", async () => {
    const c = await client();
    const ro = ok(
      await createRagKey(env.deps, {
        organizationId: c.org,
        baseIds: [c.base.id],
        mode: "read",
        name: "lecture",
      }),
    );
    const res = await result(
      await rpc(ro.key, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "rag_add_document",
          arguments: { title: "x", text: TEXT },
        },
      }),
    );
    expect(res.error).toBeUndefined();
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toMatch(/lecture seule/);
  });

  it("relaie le refus de solde dans le résultat de l'outil", async () => {
    const c = await client(0n);
    const res = await result(
      await rpc(c.secret, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "rag_search", arguments: { query: "x" } },
      }),
    );
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain(
      "Solde de crédits insuffisant",
    );
  });

  it("erreurs du protocole : méthode inconnue, outil inconnu, JSON invalide, lot", async () => {
    const c = await client();
    expect(
      (
        await result(
          await rpc(c.secret, { jsonrpc: "2.0", id: 1, method: "inconnue" }),
        )
      ).error?.code,
    ).toBe(-32601);
    expect(
      (
        await result(
          await rpc(c.secret, {
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: { name: "autre", arguments: {} },
          }),
        )
      ).error?.code,
    ).toBe(-32602);
    const bad = await handleMcp(
      new Request("http://localhost/v1/rag/mcp", {
        method: "POST",
        headers: {
          authorization: `Bearer ${c.secret}`,
          "content-type": "application/json",
        },
        body: "{oups",
      }),
      httpDeps(),
    );
    expect(((await bad.json()) as { error: { code: number } }).error.code).toBe(
      -32700,
    );
    const batch = await rpc(c.secret, [
      { jsonrpc: "2.0", id: 1, method: "ping" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
    ]);
    expect(((await batch.json()) as unknown[]).length).toBe(2);
  });

  it("exige la clé, refuse GET (pas de flux serveur) et une origine de navigateur non approuvée", async () => {
    const c = await client();
    const unauthenticated = await rpc(null, {
      jsonrpc: "2.0",
      id: 1,
      method: "ping",
    });
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get("www-authenticate")).toMatch(/Bearer/);
    const get = await handleMcp(
      new Request("http://localhost/v1/rag/mcp", {
        method: "GET",
        headers: { authorization: `Bearer ${c.secret}` },
      }),
      httpDeps(),
    );
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST");
    const evil = await rpc(
      c.secret,
      { jsonrpc: "2.0", id: 1, method: "ping" },
      { origin: "https://evil.example" },
    );
    expect(evil.status).toBe(403);
    const same = await rpc(
      c.secret,
      { jsonrpc: "2.0", id: 1, method: "ping" },
      { origin: "https://nexora.example" },
    );
    expect(same.status).toBe(200);
  });
});
