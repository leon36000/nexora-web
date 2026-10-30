/**
 * PREUVE DE BOUT EN BOUT du RAG géré, sur une base jetable : création en un clic par la route du compte, ajout de trois
 * documents (Markdown en JSON, HTML et PDF par formulaire) avec la clé montrée une fois, requêtes par l'API REST et par le
 * serveur MCP, puis contrôle du débit (grand livre), de l'Activité du client et de l'espace compté.
 * Limite : le fournisseur d'embedding et de reclassement est un FAUX déterministe (sac de mots haché, recouvrement de
 * mots) derrière la VRAIE passerelle ; aucun vrai modèle n'est appelé.
 */

import {
  eq,
  getAccount,
  ragChunks,
  ragDocuments,
  usageEvents,
} from "@nexora/db";
import { chunkStorageBytes } from "@nexora/rag";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activityBreakdown } from "../gateway/activity";
import { handleAccountRag } from "./account";
import { handleRag } from "./http";
import { handleMcp } from "./mcp";
import { type RagTestEnv, ragTestEnv } from "./test-support";

let env: RagTestEnv;
beforeAll(async () => {
  env = await ragTestEnv({
    quota: 50 * 1024 * 1024,
    config: { inlineMaxChunks: 8, embedBatch: 4 },
  });
});
afterAll(async () => {
  await env.close();
});

const SITE = "https://nexora.example";

function makePdf(pages: string[]): Uint8Array {
  const objs: string[] = [];
  const fontRef = 3 + pages.length * 2;
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  objs.push(
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  );
  pages.forEach((text, i) => {
    const content = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 ${fontRef} 0 R >> >> >>`,
    );
    objs.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets)
    out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}

describe("RAG géré : de la création au débit", () => {
  it("crée, indexe 3 documents, interroge (REST et MCP), débite, compte l'espace et nettoie", async () => {
    const org = await env.org(5_000_000n);
    const fundedBalance = (await getAccount(env.t.db, org)).balanceMicro;
    const accountDeps = {
      ...env.deps,
      siteUrl: SITE,
      getContext: async () => ({
        userId: "u1",
        organizationId: org,
        role: "owner" as const,
      }),
    };
    const httpDeps = { ...env.deps, allowedOrigins: [SITE] };

    // 1. En un clic.
    const created = await handleAccountRag(
      new Request(`${SITE}/api/account/rag`, {
        method: "POST",
        headers: { origin: SITE, "content-type": "application/json" },
        body: JSON.stringify({ name: "Base de la PME" }),
      }),
      accountDeps,
    );
    expect(created.status).toBe(201);
    const made = await created.json();
    const secret: string = made.key.value;
    const baseId: string = made.base.id;
    const rest = (
      method: string,
      path: string,
      body?: BodyInit,
      headers: Record<string, string> = {},
    ) =>
      handleRag(
        new Request(`http://localhost/v1/rag${path}`, {
          method,
          headers: { authorization: `Bearer ${secret}`, ...headers },
          body,
        }),
        httpDeps,
      );

    // 2. Trois documents : Markdown (JSON), HTML (fichier), PDF (fichier).
    const md = await rest(
      "POST",
      `/bases/${baseId}/documents`,
      JSON.stringify({
        title: "Politique de remboursement",
        text: "# Remboursements\n\nUn client peut demander un remboursement dans les trente jours suivant l'achat en écrivant au service à la clientèle.",
      }),
      { "content-type": "application/json" },
    );
    expect(md.status).toBe(201);
    const html = new FormData();
    html.set(
      "file",
      new File(
        [
          "<html><head><title>Guide d'installation</title></head><body><h1>Installation</h1><p>Pour installer le logiciel, téléchargez le programme puis lancez l'installateur et suivez les étapes à l'écran.</p><script>alert('x')</script></body></html>",
        ],
        "installation.html",
        { type: "text/html" },
      ),
    );
    expect(
      (await rest("POST", `/bases/${baseId}/documents`, html)).status,
    ).toBe(201);
    const pdf = new FormData();
    pdf.set(
      "file",
      new File(
        [
          makePdf([
            "Le conge parental dure cinquante deux semaines avec une prestation partielle",
            "Les vacances annuelles sont de quinze jours payes",
          ]) as unknown as BlobPart,
        ],
        "conges.pdf",
        { type: "application/pdf" },
      ),
    );
    const pdfRes = await rest("POST", `/bases/${baseId}/documents`, pdf);
    expect(pdfRes.status).toBe(201);
    expect(await pdfRes.json()).toMatchObject({
      title: "conges.pdf",
      status: "ready",
    });

    // 3. Interrogation par l'API REST : chaque question retrouve le bon document.
    const ask = async (query: string) => {
      const res = await rest(
        "POST",
        `/bases/${baseId}/query`,
        JSON.stringify({ query, top_k: 3 }),
        { "content-type": "application/json" },
      );
      expect(res.status).toBe(200);
      return res.json();
    };
    expect(
      (await ask("remboursement dans les trente jours")).data[0].document_title,
    ).toBe("Politique de remboursement");
    expect(
      (await ask("comment installer le logiciel")).data[0].document_title,
    ).toBe("Guide d'installation");
    const leave = await ask("durée du congé parental");
    expect(leave.data[0].document_title).toBe("conges.pdf");
    expect(leave.data[0].page).toBe(1);
    expect(JSON.stringify(leave)).not.toContain("alert");

    // 4. Même chose par le serveur MCP, avec la même clé.
    const mcp = await handleMcp(
      new Request("http://localhost/v1/rag/mcp", {
        method: "POST",
        headers: {
          authorization: `Bearer ${secret}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "rag_search",
            arguments: { query: "vacances annuelles payées" },
          },
        }),
      }),
      httpDeps,
    );
    const mcpOut = await mcp.json();
    expect(mcpOut.result.content[0].text).toContain("conges.pdf");

    // 5. Le débit : le solde baisse exactement du total des lignes d'usage (embeddings et reclassement).
    const events = await env.t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, org));
    const total = events.reduce((s, e) => s + e.costMicro, 0n);
    const balance = (await getAccount(env.t.db, org)).balanceMicro;
    expect(fundedBalance - balance).toBe(total);
    expect(total).toBeGreaterThan(0n);
    expect(new Set(events.map((e) => e.endpoint))).toEqual(
      new Set(["embeddings", "rerank"]),
    );
    expect(
      events.filter((e) => e.endpoint === "embeddings").length,
    ).toBeGreaterThanOrEqual(3 + 4);
    expect(events.every((e) => e.status === "ok")).toBe(true);
    // ... et l'Activité du client les montre par modèle.
    const activity = await activityBreakdown(
      env.t.db,
      {
        organizationId: org,
        from: new Date(Date.now() - 3_600_000),
        to: new Date(Date.now() + 3_600_000),
      },
      "model",
    );
    expect(activity.map((r) => r.key).sort()).toEqual([
      "nexora/qwen3-embedding-8b",
      "nexora/qwen3-reranker-4b",
    ]);
    expect(activity.reduce((s, r) => s + r.costMicro, 0n)).toBe(total);

    // 6. L'espace : exactement le texte des extraits + les vecteurs, et le compteur le sait.
    const rows = await env.t.db
      .select()
      .from(ragChunks)
      .where(eq(ragChunks.baseId, baseId));
    const bytes = rows.reduce((s, r) => s + chunkStorageBytes(r.content), 0);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(env.storage.usedBytes(org)).toBe(bytes);
    const docs = await env.t.db
      .select()
      .from(ragDocuments)
      .where(eq(ragDocuments.baseId, baseId));
    expect(docs.reduce((s, d) => s + d.storedBytes, 0)).toBe(bytes);
    expect(
      docs.every((d) => d.pendingText === null && d.status === "ready"),
    ).toBe(true);

    // 7. Nettoyage : supprimer la base rend tout l'espace et révoque la clé.
    const del = await handleAccountRag(
      new Request(`${SITE}/api/account/rag/${baseId}`, {
        method: "DELETE",
        headers: { origin: SITE },
      }),
      accountDeps,
    );
    expect(del.status).toBe(200);
    expect(env.storage.usedBytes(org)).toBe(0);
    expect((await rest("GET", "/bases")).status).toBe(401);
  });
});
