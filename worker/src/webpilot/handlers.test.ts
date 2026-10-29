// Les outils d'essai du moteur partagé vivent dans le paquet ; ils sont réécrits ici en petit pour le worker.
import { randomBytes } from "node:crypto";
import {
  apiKeys,
  credit,
  eq,
  jobs,
  organizations,
  usageEvents,
  webpilotPriceItems,
  webpilotPriceSheets,
  webpilotTasks,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import {
  type CrawlDeps,
  createCrawl,
  type SafeHttpClient,
} from "@nexora/webpilot";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultRegistry } from "../handlers.ts";
import { HandlerRegistry } from "../registry.ts";
import { localClock } from "../scheduler.ts";
import {
  failClosedGate,
  PURGE_JOB,
  registerWebpilotHandlers,
} from "./handlers.ts";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
  const [sheet] = await t.db.insert(webpilotPriceSheets).values({}).returning();
  if (!sheet) throw new Error("feuille");
  await t.db
    .insert(webpilotPriceItems)
    .values({ sheetId: sheet.id, unit: "page_static", sellCadMicro: 1000n });
  await t.db
    .update(webpilotPriceSheets)
    .set({ status: "published", publishedAt: new Date() })
    .where(eq(webpilotPriceSheets.id, sheet.id));
});
afterAll(async () => {
  await t.drop();
});
const silent = createLogger({ name: "test", sink: () => {} });

async function crawlTask(limit: number) {
  const org = `org_${randomBytes(5).toString("hex")}`;
  await t.db.insert(organizations).values({ id: org, name: org, slug: org });
  const [key] = await t.db
    .insert(apiKeys)
    .values({
      organizationId: org,
      name: "k",
      prefix: "nxk_essai00",
      keyHash: randomBytes(12).toString("hex"),
    })
    .returning();
  await credit(t.db, {
    organizationId: org,
    amountMicro: 1_000_000n,
    idempotencyKey: `f:${org}`,
    configVersion: "t",
    source: "t",
  });
  const { activePrices } = await import("@nexora/webpilot");
  const created = await createCrawl(t.db, {
    organizationId: org,
    apiKeyId: key?.id as string,
    requestId: `r_${org}`,
    params: {
      url: "https://s.test/",
      limit,
      maxDepth: 3,
      includePaths: [],
      excludePaths: [],
      sameOriginOnly: true,
      formats: ["markdown"],
      onlyMainContent: true,
    },
    prices: await activePrices(t.db, new Date()),
    house: false,
    maxActive: 3,
  });
  if (!created.ok) throw new Error("création");
  return { org, taskId: created.taskId };
}

const SITE: Record<string, string> = {
  "https://s.test/":
    '<main>Accueil <a href="/a">A</a><a href="/b">B</a></main>',
  "https://s.test/a": "<main>A</main>",
  "https://s.test/b": "<main>B</main>",
};
const crawlDeps = (over: Partial<CrawlDeps> = {}): CrawlDeps => {
  const client: SafeHttpClient = {
    post: async () => {
      throw new Error("non utilisé");
    },
    check: async (u) => new URL(u),
    get: async (u) => ({
      url: u,
      status: SITE[u] ? 200 : 404,
      headers: { "content-type": "text/html" },
      body: new TextEncoder().encode(SITE[u] ?? ""),
      redirects: 0,
    }),
  };
  return {
    db: t.db,
    reader: { client, robots: { allowed: async () => true } },
    privacy: {
      evaluate: async () => ({ decision: "allow", policyVersion: "p" }),
    },
    now: () => new Date(),
    retentionMs: 60_000,
    batchSize: 1,
    delayMs: 0,
    sliceMs: 60_000,
    sleep: async () => undefined,
    ...over,
  };
};
const ctx = { log: silent, signal: new AbortController().signal };
const jobOf = (taskId: string, slice = 0, attempt = 1, maxAttempts = 5) => ({
  id: "j",
  type: "webpilot.crawl",
  payload: { taskId, slice },
  attempt,
  maxAttempts,
});

describe("tâches WebPilot du worker", () => {
  it("est enregistré par défaut avec la base", () => {
    const types = defaultRegistry({ db: t.db, log: silent }).types();
    expect(types).toContain("webpilot.crawl");
    expect(types).toContain(PURGE_JOB);
  });

  it("explore et règle une tâche en une tranche", async () => {
    const { taskId, org } = await crawlTask(3);
    const registry = registerWebpilotHandlers(new HandlerRegistry(), {
      db: t.db,
      log: silent,
      crawl: crawlDeps(),
    });
    await registry.get("webpilot.crawl")?.(jobOf(taskId), ctx);
    const [task] = await t.db
      .select()
      .from(webpilotTasks)
      .where(eq(webpilotTasks.id, taskId));
    expect(task).toMatchObject({ status: "completed", pagesDone: 3 });
    const events = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, org));
    expect(events.reduce((n, e) => n + e.unitsPageStatic, 0)).toBe(3);
  });

  it("relance une tranche suivante quand il reste des pages (clé d'idempotence par tranche)", async () => {
    const { taskId } = await crawlTask(3);
    let calls = 0;
    const slow = crawlDeps({
      now: () => new Date(Date.now() + (calls++ > 2 ? 3_600_000 : 0)),
      sliceMs: 1000,
    });
    const registry = registerWebpilotHandlers(new HandlerRegistry(), {
      db: t.db,
      log: silent,
      crawl: slow,
    });
    await registry.get("webpilot.crawl")?.(jobOf(taskId), ctx);
    const next = await t.db
      .select()
      .from(jobs)
      .where(eq(jobs.idempotencyKey, `webpilot-crawl:${taskId}:1`));
    expect(next).toHaveLength(1);
    expect(next[0]?.payload).toEqual({ taskId, slice: 1 });
  });

  it("sans Privacy Router branché, l'exploration échoue en échec fermé et rien n'est facturé", async () => {
    const { taskId, org } = await crawlTask(2);
    const registry = registerWebpilotHandlers(new HandlerRegistry(), {
      db: t.db,
      log: silent,
      crawl: crawlDeps({ privacy: failClosedGate() }),
    });
    await registry.get("webpilot.crawl")?.(jobOf(taskId), ctx);
    const [task] = await t.db
      .select()
      .from(webpilotTasks)
      .where(eq(webpilotTasks.id, taskId));
    expect(task).toMatchObject({
      status: "failed",
      errorCode: "privacy_router_unavailable",
      pagesDone: 0,
    });
    const events = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, org));
    expect(events.every((e) => e.costMicro === 0n)).toBe(true);
  });

  it("dernier essai perdu : l'exploration est close en échec et sa réservation libérée", async () => {
    const { taskId, org } = await crawlTask(2);
    const broken = crawlDeps();
    broken.reader = {
      ...broken.reader,
      client: {
        ...broken.reader.client,
        get: async () => {
          throw new TypeError("boum");
        },
      },
    };
    const registry = registerWebpilotHandlers(new HandlerRegistry(), {
      db: t.db,
      log: silent,
      crawl: broken,
    });
    await expect(
      registry.get("webpilot.crawl")?.(jobOf(taskId, 0, 5, 5), ctx),
    ).rejects.toThrow("boum");
    const [task] = await t.db
      .select()
      .from(webpilotTasks)
      .where(eq(webpilotTasks.id, taskId));
    expect(task).toMatchObject({
      status: "failed",
      errorCode: "internal_error",
    });
    const { getAccount } = await import("@nexora/db");
    expect((await getAccount(t.db, org)).heldMicro).toBe(0n);
  });

  it("l'effacement horaire est déclaré par le planificateur", async () => {
    const { tickScheduler } = await import("../scheduler.ts");
    await t.db.delete(jobs);
    await tickScheduler({
      db: t.db,
      log: silent,
      now: () => new Date("2026-10-29T15:00:00Z"),
    });
    const purge = await t.db
      .select()
      .from(jobs)
      .where(eq(jobs.type, PURGE_JOB));
    expect(purge).toHaveLength(1);
    expect(localClock(new Date()).date).toBeTruthy();
  });
});
