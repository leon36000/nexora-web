import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  apiKeys,
  organizations,
  usageEvents,
  webpilotPriceItems,
  webpilotPriceSheets,
  webpilotTaskResults,
  webpilotTasks,
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

async function sheet() {
  const [row] = await t.db.insert(webpilotPriceSheets).values({}).returning();
  if (!row) throw new Error("feuille non créée");
  await t.db
    .insert(webpilotPriceItems)
    .values({ sheetId: row.id, unit: "page_static", sellCadMicro: 5000n });
  return row;
}

describe("migration WebPilot : feuille de prix immuable", () => {
  it("une feuille est un brouillon à sa création et reçoit un numéro de version croissant", async () => {
    const a = await sheet();
    const b = await sheet();
    expect(a.status).toBe("draft");
    expect(b.version).toBeGreaterThan(a.version);
  });

  it("un brouillon peut être publié une fois, puis plus rien ne change", async () => {
    const s = await sheet();
    await t.db
      .update(webpilotPriceSheets)
      .set({ status: "published", publishedAt: new Date() })
      .where(eq(webpilotPriceSheets.id, s.id));
    await expect(
      t.db
        .update(webpilotPriceSheets)
        .set({ note: "retouche" })
        .where(eq(webpilotPriceSheets.id, s.id)),
    ).rejects.toThrow();
    await expect(
      t.db
        .update(webpilotPriceSheets)
        .set({ status: "draft" })
        .where(eq(webpilotPriceSheets.id, s.id)),
    ).rejects.toThrow();
    await expect(
      t.db.delete(webpilotPriceSheets).where(eq(webpilotPriceSheets.id, s.id)),
    ).rejects.toThrow();
  });

  it("on ne change pas la marge ni la note d'un brouillon en le publiant", async () => {
    const s = await sheet();
    await expect(
      t.db
        .update(webpilotPriceSheets)
        .set({ status: "published", marginFloorBps: 5000 })
        .where(eq(webpilotPriceSheets.id, s.id)),
    ).rejects.toThrow();
  });

  it("les lignes de prix sont en ajout seulement", async () => {
    const s = await sheet();
    await expect(
      t.db
        .update(webpilotPriceItems)
        .set({ sellCadMicro: 1n })
        .where(eq(webpilotPriceItems.sheetId, s.id)),
    ).rejects.toThrow();
    await expect(
      t.db
        .delete(webpilotPriceItems)
        .where(eq(webpilotPriceItems.sheetId, s.id)),
    ).rejects.toThrow();
  });

  it("refuse une unité inconnue et un prix négatif", async () => {
    const [s] = await t.db.insert(webpilotPriceSheets).values({}).returning();
    if (!s) throw new Error("feuille");
    await expect(
      t.db.insert(webpilotPriceItems).values({
        sheetId: s.id,
        unit: "gigaoctet" as never,
        sellCadMicro: 1n,
      }),
    ).rejects.toThrow();
    await expect(
      t.db
        .insert(webpilotPriceItems)
        .values({ sheetId: s.id, unit: "page_browser", sellCadMicro: -1n }),
    ).rejects.toThrow();
  });
});

describe("migration WebPilot : colonnes additives", () => {
  it("une clé n'a pas la permission webpilot par défaut", async () => {
    const organizationId = await org();
    const [key] = await t.db
      .insert(apiKeys)
      .values({
        organizationId,
        name: "k",
        prefix: "nxk_aaaaaaa",
        keyHash: randomBytes(16).toString("hex"),
      })
      .returning();
    expect(key?.webpilotOperations).toBeNull();
  });

  it("un événement d'usage de modèle garde ses compteurs WebPilot à zéro", async () => {
    const organizationId = await org();
    const [key] = await t.db
      .insert(apiKeys)
      .values({
        organizationId,
        name: "k",
        prefix: "nxk_bbbbbbb",
        keyHash: randomBytes(16).toString("hex"),
      })
      .returning();
    const [ev] = await t.db
      .insert(usageEvents)
      .values({
        requestId: `r_${randomBytes(4).toString("hex")}`,
        organizationId,
        apiKeyId: key?.id as string,
        modelPublicId: "m",
        endpoint: "chat.completions",
        configVersion: "v",
        status: "ok",
        httpStatus: 200,
      })
      .returning();
    expect(ev?.unitsPageStatic).toBe(0);
    expect(ev?.unitsPageBrowser).toBe(0);
    expect(ev?.unitsBrowserMinute).toBe(0);
    expect(ev?.destinationHost).toBeNull();
    expect(ev?.privacyDecision).toBeNull();
  });
});

describe("migration WebPilot : tâches", () => {
  it("effacer une tâche efface ses résultats", async () => {
    const organizationId = await org();
    const [key] = await t.db
      .insert(apiKeys)
      .values({
        organizationId,
        name: "k",
        prefix: "nxk_ccccccc",
        keyHash: randomBytes(16).toString("hex"),
      })
      .returning();
    const [task] = await t.db
      .insert(webpilotTasks)
      .values({
        organizationId,
        apiKeyId: key?.id as string,
        kind: "crawl",
        params: {
          url: "https://exemple.test/",
          limit: 3,
          maxDepth: 1,
          includePaths: [],
          excludePaths: [],
          sameOriginOnly: true,
          formats: ["markdown"],
          onlyMainContent: true,
        },
        pagesLimit: 3,
        configVersion: "webpilot_prices_v1",
      })
      .returning();
    expect(task?.status).toBe("queued");
    await t.db.insert(webpilotTaskResults).values({
      taskId: task?.id as string,
      seq: 1,
      url: "https://exemple.test/",
      httpStatus: 200,
      content: { markdown: "x" },
      metadata: {},
    });
    await t.db
      .delete(webpilotTasks)
      .where(eq(webpilotTasks.id, task?.id as string));
    const left = await t.db.select().from(webpilotTaskResults);
    expect(left).toHaveLength(0);
  });
});
