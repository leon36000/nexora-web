import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  apiKeys,
  organizations,
  ragBases,
  ragChunks,
  ragDocuments,
} from "./schema.ts";
import { createTestDatabase, type TestDatabase } from "./testing.ts";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

async function org(): Promise<string> {
  const id = `org_${randomBytes(6).toString("hex")}`;
  await t.db.insert(organizations).values({ id, name: id, slug: id });
  return id;
}

/** Vecteur de 1024 composantes dont seule la composante `hot` est non nulle. */
const unit = (hot: number): string => {
  const v = new Array(1024).fill(0);
  v[hot] = 1;
  return `[${v.join(",")}]`;
};

async function baseWithDoc(organizationId: string, name = "Base") {
  const [base] = await t.db
    .insert(ragBases)
    .values({
      organizationId,
      name,
      embeddingModel: "nexora/qwen3-embedding-8b",
    })
    .returning();
  if (!base) throw new Error("base non créée");
  const [doc] = await t.db
    .insert(ragDocuments)
    .values({
      baseId: base.id,
      organizationId,
      title: "Document",
      status: "ready",
      contentHash: randomBytes(8).toString("hex"),
    })
    .returning();
  if (!doc) throw new Error("document non créé");
  return { base, doc };
}

describe("migration RAG : pgvector, bases, documents, extraits", () => {
  it("installe l'extension vector", async () => {
    const rows = await t.db.execute(
      sql`SELECT extname FROM pg_extension WHERE extname = 'vector'`,
    );
    expect(rows.length).toBe(1);
  });

  it("stocke un extrait en demi-précision et le retrouve par distance cosinus, dans l'ordre", async () => {
    const o = await org();
    const { base, doc } = await baseWithDoc(o);
    for (const [ord, hot] of [
      [0, 1],
      [1, 2],
      [2, 3],
    ] as const) {
      await t.db.execute(sql`
        INSERT INTO rag_chunks (document_id, base_id, organization_id, ord, content, start_char, end_char, embedding)
        VALUES (${doc.id}, ${base.id}, ${o}, ${ord}, ${`extrait ${ord}`}, 0, 9, ${unit(hot)}::halfvec(1024))`);
    }
    const rows = await t.db.execute<{ ord: number; sim: number }>(sql`
      SELECT ord, 1 - (embedding <=> ${unit(2)}::halfvec(1024)) AS sim
      FROM rag_chunks WHERE base_id = ${base.id} AND organization_id = ${o}
      ORDER BY embedding <=> ${unit(2)}::halfvec(1024) LIMIT 3`);
    expect(rows[0]?.ord).toBe(1);
    expect(Number(rows[0]?.sim)).toBeCloseTo(1, 3);
    expect(Number(rows[1]?.sim)).toBeCloseTo(0, 3);
  });

  it("refuse un vecteur qui n'a pas 1024 composantes", async () => {
    const o = await org();
    const { base, doc } = await baseWithDoc(o);
    await expect(
      t.db.execute(sql`
        INSERT INTO rag_chunks (document_id, base_id, organization_id, ord, content, start_char, end_char, embedding)
        VALUES (${doc.id}, ${base.id}, ${o}, 0, 'x', 0, 1, '[1,2,3]'::halfvec)`),
    ).rejects.toThrow();
  });

  it("calcule le vecteur de texte (plein texte) à l'insertion", async () => {
    const o = await org();
    const { base, doc } = await baseWithDoc(o);
    await t.db.execute(sql`
      INSERT INTO rag_chunks (document_id, base_id, organization_id, ord, content, start_char, end_char, embedding)
      VALUES (${doc.id}, ${base.id}, ${o}, 0, 'La facture 4012 est payable en Mars', 0, 30, ${unit(5)}::halfvec(1024))`);
    const rows = await t.db.execute(sql`
      SELECT ord FROM rag_chunks WHERE base_id = ${base.id}
      AND tsv @@ to_tsquery('simple', 'facture | zzz')`);
    expect(rows.length).toBe(1);
  });

  it("efface les extraits avec le document et avec la base (cascade)", async () => {
    const o = await org();
    const { base, doc } = await baseWithDoc(o);
    await t.db.execute(sql`
      INSERT INTO rag_chunks (document_id, base_id, organization_id, ord, content, start_char, end_char, embedding)
      VALUES (${doc.id}, ${base.id}, ${o}, 0, 'x', 0, 1, ${unit(1)}::halfvec(1024))`);
    await t.db.delete(ragDocuments).where(eq(ragDocuments.id, doc.id));
    expect(
      (await t.db.select().from(ragChunks).where(eq(ragChunks.baseId, base.id)))
        .length,
    ).toBe(0);
    const second = await baseWithDoc(o, "Autre");
    await t.db.delete(ragBases).where(eq(ragBases.id, second.base.id));
    expect(
      (
        await t.db
          .select()
          .from(ragDocuments)
          .where(eq(ragDocuments.baseId, second.base.id))
      ).length,
    ).toBe(0);
  });

  it("refuse deux bases de même nom dans une organisation, pas dans deux organisations", async () => {
    const a = await org();
    const b = await org();
    await baseWithDoc(a, "Ventes");
    await expect(baseWithDoc(a, "Ventes")).rejects.toThrow();
    await expect(baseWithDoc(b, "Ventes")).resolves.toBeTruthy();
  });

  it("refuse le même contenu deux fois dans une base (empreinte unique)", async () => {
    const o = await org();
    const { base } = await baseWithDoc(o);
    const row = {
      baseId: base.id,
      organizationId: o,
      title: "Même",
      status: "ready" as const,
      contentHash: "empreinte-fixe",
    };
    await t.db.insert(ragDocuments).values(row);
    await expect(t.db.insert(ragDocuments).values(row)).rejects.toThrow();
  });

  it("refuse un état de document inconnu et des paramètres de découpage hors limites", async () => {
    const o = await org();
    const { base } = await baseWithDoc(o);
    await expect(
      t.db.insert(ragDocuments).values({
        baseId: base.id,
        organizationId: o,
        title: "x",
        status: "bizarre" as never,
        contentHash: "h1",
      }),
    ).rejects.toThrow();
    await expect(
      t.db.insert(ragBases).values({
        organizationId: o,
        name: "trop",
        embeddingModel: "m",
        chunkChars: 1000,
        chunkOverlap: 900,
      }),
    ).rejects.toThrow();
  });

  it("garde la permission RAG d'une clé API (null par défaut = aucun accès)", async () => {
    const o = await org();
    const [k] = await t.db
      .insert(apiKeys)
      .values({
        organizationId: o,
        name: "k",
        prefix: "nxk_abc",
        keyHash: randomBytes(8).toString("hex"),
      })
      .returning();
    expect(k?.ragAccess).toBeNull();
    const [k2] = await t.db
      .insert(apiKeys)
      .values({
        organizationId: o,
        name: "k2",
        prefix: "nxk_abd",
        keyHash: randomBytes(8).toString("hex"),
        ragAccess: {
          bases: ["00000000-0000-0000-0000-000000000000"],
          mode: "read",
        },
      })
      .returning();
    expect(k2?.ragAccess?.mode).toBe("read");
  });
});
