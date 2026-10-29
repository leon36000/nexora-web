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
  webpilotSessions,
  webpilotTasks,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import {
  type BrowserService,
  BrowserServiceError,
  type CloseReason,
  type CrawlDeps,
  createCrawl,
  openSession,
  publicSessionId,
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
  SESSIONS_SWEEP_JOB,
} from "./handlers.ts";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
  const [sheet] = await t.db.insert(webpilotPriceSheets).values({}).returning();
  if (!sheet) throw new Error("feuille");
  await t.db.insert(webpilotPriceItems).values([
    { sheetId: sheet.id, unit: "page_static", sellCadMicro: 1000n },
    { sheetId: sheet.id, unit: "browser_minute", sellCadMicro: 2000n },
  ]);
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

describe("balayage des sessions de navigateur", () => {
  const T0 = new Date("2026-11-03T09:00:00.000Z");
  const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

  async function session(
    opts: { balance?: bigint; maxMinutes?: number; idleTimeoutS?: number } = {},
  ) {
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
      amountMicro: opts.balance ?? 100_000n,
      idempotencyKey: `f:${org}`,
      configVersion: "t",
      source: "t",
    });
    const { activePrices } = await import("@nexora/webpilot");
    const opened = await openSession(t.db, {
      organizationId: org,
      apiKeyId: key?.id as string,
      maxMinutes: opts.maxMinutes ?? 5,
      idleTimeoutS: opts.idleTimeoutS ?? 600,
      params: {},
      prices: await activePrices(t.db, T0),
      house: false,
      maxOpen: 5,
      now: T0,
      privacy: null,
    });
    if (!opened.ok) throw new Error("ouverture");
    return { org, id: opened.sessionId };
  }

  function browser() {
    const closes: Array<{ id: string; reason: CloseReason }> = [];
    const fail: { close?: BrowserServiceError } = {};
    const service: BrowserService = {
      open: async () => {
        throw new Error("non utilisé");
      },
      run: async () => {
        throw new Error("non utilisé");
      },
      get: async () => {
        throw new Error("non utilisé");
      },
      close: async (id, reason) => {
        if (fail.close) throw fail.close;
        closes.push({ id, reason });
        return {
          id,
          status: "closed",
          closeReason: reason,
          expiresAt: new Date(),
          url: null,
        };
      },
    };
    return { service, closes, fail };
  }

  const sweep = (b: BrowserService | null, now: Date) => {
    const registry = registerWebpilotHandlers(new HandlerRegistry(), {
      db: t.db,
      log: silent,
      sessions: { browser: b, now: () => now },
    });
    return registry.get(SESSIONS_SWEEP_JOB)?.(
      {
        id: "j",
        type: SESSIONS_SWEEP_JOB,
        payload: {},
        attempt: 1,
        maxAttempts: 1,
      },
      ctx,
    );
  };
  const rowOf = async (id: string) =>
    (
      await t.db
        .select()
        .from(webpilotSessions)
        .where(eq(webpilotSessions.id, id))
    )[0];

  it("est enregistré par défaut et déclaré par le planificateur chaque minute (une seule fois par minute)", async () => {
    expect(defaultRegistry({ db: t.db, log: silent }).types()).toContain(
      SESSIONS_SWEEP_JOB,
    );
    const { tickScheduler } = await import("../scheduler.ts");
    await t.db.delete(jobs);
    const tick = (iso: string) =>
      tickScheduler({ db: t.db, log: silent, now: () => new Date(iso) });
    await tick("2026-11-03T09:00:05Z");
    await tick("2026-11-03T09:00:40Z");
    await tick("2026-11-03T09:01:10Z");
    const rows = await t.db
      .select()
      .from(jobs)
      .where(eq(jobs.type, SESSIONS_SWEEP_JOB));
    expect(rows).toHaveLength(2);
  });

  it("règle la minute échue et réserve la suivante", async () => {
    const { id, org } = await session();
    await sweep(null, at(61));
    expect(await rowOf(id)).toMatchObject({
      status: "open",
      minutesSettled: 1,
      costMicro: 2000n,
    });
    const events = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, org));
    expect(
      events.filter((e) => e.endpoint === "webpilot.session"),
    ).toHaveLength(1);
  });

  it("ferme une session échue, détruit son navigateur avec le motif et le confirme", async () => {
    const { id } = await session({ maxMinutes: 1 });
    const b = browser();
    await sweep(b.service, at(61));
    const r = await rowOf(id);
    expect(r).toMatchObject({
      status: "closed",
      closeReason: "max_minutes",
      minutesSettled: 1,
    });
    expect(r?.browserClosedAt).not.toBeNull();
    expect(b.closes).toEqual([
      { id: publicSessionId(id), reason: "max_minutes" },
    ]);
    await sweep(b.service, at(120));
    expect(b.closes).toHaveLength(1);
  });

  it("ferme une session inactive et libère tout (plus rien de retenu)", async () => {
    const { id, org } = await session({ idleTimeoutS: 20, balance: 10_000n });
    const b = browser();
    await sweep(b.service, at(30));
    expect((await rowOf(id))?.closeReason).toBe("idle");
    const { getAccount } = await import("@nexora/db");
    const acct = await getAccount(t.db, org);
    expect(acct.heldMicro).toBe(0n);
    expect(acct.balanceMicro).toBe(8000n);
  });

  it("solde épuisé à la minute suivante : fermée en insufficient_quota", async () => {
    const { id } = await session({ balance: 2000n });
    const b = browser();
    await sweep(b.service, at(61));
    expect(await rowOf(id)).toMatchObject({
      status: "closed",
      closeReason: "insufficient_quota",
    });
    expect(b.closes[0]?.reason).toBe("insufficient_quota");
  });

  it("réessaie de détruire un navigateur resté en vie, sans jamais échouer la tâche", async () => {
    const { id } = await session({ maxMinutes: 1 });
    const b = browser();
    b.fail.close = new BrowserServiceError("unavailable");
    await expect(sweep(b.service, at(61))).resolves.toBeUndefined();
    expect((await rowOf(id))?.browserClosedAt).toBeNull();
    b.fail.close = undefined;
    await sweep(b.service, at(120));
    expect((await rowOf(id))?.browserClosedAt).not.toBeNull();
    expect(b.closes).toEqual([
      { id: publicSessionId(id), reason: "max_minutes" },
    ]);
  });

  it("un navigateur inconnu du service (déjà détruit) compte comme détruit", async () => {
    const { id } = await session({ maxMinutes: 1 });
    const b = browser();
    b.fail.close = new BrowserServiceError("not_found");
    await sweep(b.service, at(61));
    expect((await rowOf(id))?.browserClosedAt).not.toBeNull();
  });

  it("sans service de navigateur configuré, la facturation avance quand même", async () => {
    const { id } = await session({ maxMinutes: 1 });
    await sweep(null, at(61));
    const r = await rowOf(id);
    expect(r).toMatchObject({ status: "closed", minutesSettled: 1 });
    expect(r?.browserClosedAt).toBeNull();
  });
});
