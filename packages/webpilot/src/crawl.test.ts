import {
  debit,
  eq,
  getAccount,
  jobs,
  usageEvents,
  type WebpilotCrawlParams,
  webpilotTaskResults,
  webpilotTasks,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activePrices } from "./billing.ts";
import {
  type CrawlDeps,
  createCrawl,
  finishTask,
  followable,
  parsePublicTaskId,
  publicTaskId,
  purgeExpiredTasks,
  runCrawlSlice,
} from "./crawl.ts";
import { SafeFetchError, type SafeHttpClient } from "./http.ts";
import type { PrivacyGate } from "./privacy.ts";
import { fund, newKey, newOrg, publishSheet } from "./test-support.ts";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
  await publishSheet(t.db, { page_static: { sell: 1000n, upstream: 100n } });
});
afterAll(async () => {
  await t.drop();
});

const SITE: Record<string, string> = {
  "https://s.test/": `<title>Accueil</title><main><h1>Accueil</h1><a href="/a">A</a><a href="/b">B</a><a href="https://autre.test/x">externe</a></main>`,
  "https://s.test/a": `<main><h1>A</h1><a href="/c">C</a><a href="/">retour</a></main>`,
  "https://s.test/b": `<main><h1>B</h1><a href="/d">D</a></main>`,
  "https://s.test/c": `<main><h1>C</h1><a href="/prive/e">E</a></main>`,
  "https://s.test/d": `<main><h1>D</h1></main>`,
  "https://s.test/prive/e": `<main><h1>E</h1></main>`,
};

function fakeReader(opts: { blocked?: string[]; failing?: string[] } = {}) {
  const gets: string[] = [];
  const client: SafeHttpClient = {
    post: async () => {
      throw new Error("non utilisé");
    },
    check: async (u) => new URL(u),
    get: async (u, o) => {
      await o?.beforeHop?.(new URL(u));
      gets.push(u);
      if (opts.failing?.includes(u))
        throw new SafeFetchError("target_timeout", "t");
      const html = SITE[u];
      return {
        url: u,
        status: html ? 200 : 404,
        headers: { "content-type": "text/html" },
        body: new TextEncoder().encode(html ?? ""),
        redirects: 0,
      };
    },
  };
  const robots = {
    allowed: async (u: URL) => !opts.blocked?.includes(u.pathname),
  };
  return { reader: { client, robots }, gets };
}

const allowAll: PrivacyGate = {
  evaluate: async () => ({ decision: "allow", policyVersion: "pol-1" }),
};
const PARAMS: WebpilotCrawlParams = {
  url: "https://s.test/",
  limit: 10,
  maxDepth: 5,
  includePaths: [],
  excludePaths: [],
  sameOriginOnly: true,
  formats: ["markdown"],
  onlyMainContent: true,
};

async function start(
  opts: {
    balance?: bigint;
    house?: boolean;
    params?: Partial<WebpilotCrawlParams>;
    cap?: bigint;
  } = {},
) {
  const org = await newOrg(t.db, opts.house);
  const key = await newKey(
    t.db,
    org,
    opts.cap ? { spendCapMicro: opts.cap } : {},
  );
  if (opts.balance) await fund(t.db, org, opts.balance);
  const prices = await activePrices(t.db, new Date());
  const created = await createCrawl(t.db, {
    organizationId: org,
    apiKeyId: key,
    requestId: `req_${Math.random().toString(16).slice(2)}`,
    params: { ...PARAMS, ...opts.params },
    prices,
    house: Boolean(opts.house),
    maxActive: 3,
  });
  return { org, key, created };
}

function deps(
  over: Partial<CrawlDeps> & { reader: CrawlDeps["reader"] },
): CrawlDeps {
  return {
    db: t.db,
    privacy: allowAll,
    now: () => new Date(),
    retentionMs: 3_600_000,
    batchSize: 2,
    delayMs: 0,
    sliceMs: 60_000,
    sleep: async () => undefined,
    ...over,
  };
}

const taskOf = async (id: string) =>
  (await t.db.select().from(webpilotTasks).where(eq(webpilotTasks.id, id)))[0];

describe("identifiant public", () => {
  it("aller-retour crawl_<hex>", () => {
    const id = "0a1b2c3d-4e5f-6789-abcd-ef0123456789";
    expect(publicTaskId(id)).toBe("crawl_0a1b2c3d4e5f6789abcdef0123456789");
    expect(parsePublicTaskId(publicTaskId(id))).toBe(id);
    expect(parsePublicTaskId("crawl_xyz")).toBeNull();
    expect(parsePublicTaskId(id)).toBeNull();
  });
});

describe("filtre des liens", () => {
  const p = (x: Partial<WebpilotCrawlParams>): WebpilotCrawlParams => ({
    ...PARAMS,
    ...x,
  });
  const start = new URL("https://s.test/");
  it("même hôte par défaut, motifs d'inclusion et d'exclusion", () => {
    expect(followable(new URL("https://s.test/x"), start, p({}))).toBe(true);
    expect(followable(new URL("https://autre.test/x"), start, p({}))).toBe(
      false,
    );
    expect(
      followable(
        new URL("https://autre.test/x"),
        start,
        p({ sameOriginOnly: false }),
      ),
    ).toBe(true);
    expect(
      followable(
        new URL("https://s.test/blog/a"),
        start,
        p({ includePaths: ["/blog"] }),
      ),
    ).toBe(true);
    expect(
      followable(
        new URL("https://s.test/blogue"),
        start,
        p({ includePaths: ["/blog"] }),
      ),
    ).toBe(false);
    expect(
      followable(
        new URL("https://s.test/docs/v1/x"),
        start,
        p({ includePaths: ["/docs/*"] }),
      ),
    ).toBe(true);
    expect(
      followable(
        new URL("https://s.test/prive/e"),
        start,
        p({ excludePaths: ["/prive/*"] }),
      ),
    ).toBe(false);
  });
});

describe("création", () => {
  it("réserve limit × prix de la page, met la tâche en file et la tâche du worker", async () => {
    const s = await start({ balance: 100_000n });
    if (!s.created.ok) throw new Error("création");
    expect(s.created.reservedMicro).toBe(10_000n);
    const acct = await getAccount(t.db, s.org);
    expect(acct.heldMicro).toBe(10_000n);
    const task = await taskOf(s.created.taskId);
    expect(task?.status).toBe("queued");
    expect(task?.sellCadMicro).toBe(1000n);
    const queued = await t.db
      .select()
      .from(jobs)
      .where(eq(jobs.idempotencyKey, `webpilot-crawl:${s.created.taskId}:0`));
    expect(queued).toHaveLength(1);
    expect(queued[0]?.type).toBe("webpilot.crawl");
  });

  it("402 : solde insuffisant, plafond de la clé ; rien n'est créé", async () => {
    const poor = await start({ balance: 5000n });
    expect(poor.created).toEqual({ ok: false, reason: "insufficient" });
    const capped = await start({ balance: 100_000n, cap: 3000n });
    expect(capped.created).toEqual({ ok: false, reason: "key_cap" });
    expect(
      await t.db
        .select()
        .from(webpilotTasks)
        .where(eq(webpilotTasks.organizationId, poor.org)),
    ).toHaveLength(0);
  });

  it("limite le nombre d'explorations actives par organisation", async () => {
    const s = await start({ balance: 1_000_000n });
    const key = s.key;
    const again = async () =>
      createCrawl(t.db, {
        organizationId: s.org,
        apiKeyId: key,
        requestId: `r_${Math.random()}`,
        params: PARAMS,
        prices: await activePrices(t.db, new Date()),
        house: false,
        maxActive: 2,
      });
    expect((await again()).ok).toBe(true); // 2e active
    expect(await again()).toEqual({ ok: false, reason: "too_many_active" });
  });

  it("organisation maison : aucune réservation", async () => {
    const s = await start({ house: true });
    if (!s.created.ok) throw new Error("création");
    expect(s.created.reservedMicro).toBe(0n);
    expect((await taskOf(s.created.taskId))?.billed).toBe(false);
  });
});

describe("exécution", () => {
  it("explore le site par largeur, facture page par page et libère le reste", async () => {
    const s = await start({ balance: 100_000n, params: { limit: 5 } });
    if (!s.created.ok) throw new Error("création");
    const { reader, gets } = fakeReader();
    const out = await runCrawlSlice(deps({ reader }), s.created.taskId);
    expect(out.done).toBe(true);
    const task = await taskOf(s.created.taskId);
    expect(task?.status).toBe("completed");
    expect(task?.pagesDone).toBe(5);
    expect(gets.every((u) => u.startsWith("https://s.test"))).toBe(true);
    expect(gets).not.toContain("https://autre.test/x");
    const rows = await t.db
      .select()
      .from(webpilotTaskResults)
      .where(eq(webpilotTaskResults.taskId, s.created.taskId));
    expect(rows.map((r) => r.seq).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(rows[0]?.url).toBe("https://s.test/");
    expect(
      ((rows[0]?.content ?? {}) as { markdown?: string }).markdown,
    ).toContain("# Accueil");
    const acct = await getAccount(t.db, s.org);
    expect(acct.balanceMicro).toBe(100_000n - 5000n);
    expect(acct.heldMicro).toBe(0n);
    expect(task?.costMicro).toBe(5000n);
    // Un événement d'usage par lot (2 + 2 + 1 pages), jamais d'adresse complète.
    const events = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, s.org));
    expect(events.map((e) => e.unitsPageStatic).sort()).toEqual([1, 2, 2]);
    expect(
      events.every(
        (e) =>
          e.endpoint === "webpilot.crawl" && e.destinationHost === "s.test",
      ),
    ).toBe(true);
    expect(events.reduce((a, e) => a + e.costMicro, 0n)).toBe(5000n);
    expect(task?.expiresAt).not.toBeNull();
    expect(task?.state).toEqual({ queue: [], seen: [] });
  });

  it("règle chaque lot sans attendre la fin : la réservation suit les pages restantes", async () => {
    const s = await start({ balance: 100_000n, params: { limit: 6 } });
    if (!s.created.ok) throw new Error("création");
    const { reader } = fakeReader();
    let ticks = 0;
    // Une seule tranche de deux pages : le délai est dépassé après le premier lot.
    const out = await runCrawlSlice(
      deps({
        reader,
        now: () => new Date(Date.now() + (ticks++ > 3 ? 120_000 : 0)),
        sliceMs: 60_000,
      }),
      s.created.taskId,
    );
    expect(out.done).toBe(false);
    const task = await taskOf(s.created.taskId);
    expect(task?.status).toBe("running");
    expect(task?.pagesDone).toBeGreaterThan(0);
    const acct = await getAccount(t.db, s.org);
    const spent = BigInt(task?.pagesDone ?? 0) * 1000n;
    expect(acct.balanceMicro).toBe(100_000n - spent);
    expect(acct.heldMicro).toBe(BigInt(6 - (task?.pagesDone ?? 0)) * 1000n);
  });

  it("page refusée par robots.txt ou en erreur : écartée, jamais facturée", async () => {
    const s = await start({ balance: 100_000n });
    if (!s.created.ok) throw new Error("création");
    const { reader } = fakeReader({
      blocked: ["/b"],
      failing: ["https://s.test/c"],
    });
    await runCrawlSlice(deps({ reader }), s.created.taskId);
    const task = await taskOf(s.created.taskId);
    expect(task?.status).toBe("completed");
    expect(task?.pagesSkipped).toBe(2);
    const urls = (
      await t.db
        .select()
        .from(webpilotTaskResults)
        .where(eq(webpilotTaskResults.taskId, s.created.taskId))
    ).map((r) => r.url);
    expect(urls).not.toContain("https://s.test/b");
    expect(urls).not.toContain("https://s.test/c");
    expect(task?.costMicro).toBe(BigInt(task?.pagesDone ?? 0) * 1000n);
  });

  it("profondeur maximale et motifs d'exclusion", async () => {
    const s = await start({
      balance: 100_000n,
      params: { maxDepth: 1, excludePaths: ["/b"] },
    });
    if (!s.created.ok) throw new Error("création");
    const { reader } = fakeReader();
    await runCrawlSlice(deps({ reader }), s.created.taskId);
    const urls = (
      await t.db
        .select()
        .from(webpilotTaskResults)
        .where(eq(webpilotTaskResults.taskId, s.created.taskId))
    )
      .map((r) => r.url)
      .sort();
    expect(urls).toEqual(["https://s.test/", "https://s.test/a"]);
  });

  it("annulation : les pages lues sont facturées, le reste est libéré", async () => {
    const s = await start({ balance: 100_000n });
    if (!s.created.ok) throw new Error("création");
    const { reader } = fakeReader();
    const cancelId = s.created.taskId;
    let reads = 0;
    const counting: CrawlDeps["reader"] = {
      ...reader,
      client: {
        ...reader.client,
        get: async (u, o) => {
          const r = await reader.client.get(u, o);
          if (++reads === 3)
            await t.db
              .update(webpilotTasks)
              .set({ cancelRequested: true })
              .where(eq(webpilotTasks.id, cancelId));
          return r;
        },
      },
    };
    await runCrawlSlice(deps({ reader: counting }), s.created.taskId);
    const task = await taskOf(s.created.taskId);
    expect(task?.status).toBe("cancelled");
    expect(task?.pagesDone).toBe(3);
    const acct = await getAccount(t.db, s.org);
    expect(acct.balanceMicro).toBe(100_000n - 3000n);
    expect(acct.heldMicro).toBe(0n);
  });

  it("solde épuisé en cours de route : la tâche échoue (insufficient_quota) et garde ce qui a été lu et facturé", async () => {
    const s = await start({ balance: 100_000n, params: { limit: 6 } });
    if (!s.created.ok) throw new Error("création");
    const { reader } = fakeReader();
    let lots = 0;
    const draining: CrawlDeps["reader"] = {
      ...reader,
      client: {
        ...reader.client,
        get: async (u, o) => {
          // Pendant le 2e lot, un remboursement rend le solde négatif.
          if (++lots === 3)
            await debit(t.db, {
              organizationId: s.org,
              kind: "refund",
              amountMicro: 200_000n,
              idempotencyKey: `refund:${s.org}`,
              configVersion: "t",
              source: "essai",
            });
          return reader.client.get(u, o);
        },
      },
    };
    await runCrawlSlice(deps({ reader: draining }), s.created.taskId);
    const task = await taskOf(s.created.taskId);
    expect(task?.status).toBe("failed");
    expect(task?.errorCode).toBe("insufficient_quota");
    expect(task?.pagesDone).toBeGreaterThan(0);
    expect((await getAccount(t.db, s.org)).heldMicro).toBe(0n);
    const results = await t.db
      .select()
      .from(webpilotTaskResults)
      .where(eq(webpilotTaskResults.taskId, s.created.taskId));
    expect(results.length).toBe(task?.pagesDone);
  });

  it("politique de confidentialité : un hôte refusé n'est pas lu, la panne de la couche fait échouer la tâche", async () => {
    const s = await start({ balance: 100_000n });
    if (!s.created.ok) throw new Error("création");
    const { reader, gets } = fakeReader();
    const denyB: PrivacyGate = {
      evaluate: async (i) =>
        "host" in i.destination && i.destination.path === "/b"
          ? {
              decision: "deny",
              policyVersion: "pol-2",
              ruleId: "r1",
              reason: "host_blocked",
            }
          : { decision: "allow", policyVersion: "pol-2" },
    };
    await runCrawlSlice(deps({ reader, privacy: denyB }), s.created.taskId);
    expect(gets).not.toContain("https://s.test/b");
    const task = await taskOf(s.created.taskId);
    expect(task?.status).toBe("completed");
    expect(task?.privacyDecision).toBe("deny");
    expect(task?.policyVersion).toBe("pol-2");

    const s2 = await start({ balance: 100_000n });
    if (!s2.created.ok) throw new Error("création");
    const down: PrivacyGate = {
      evaluate: async () => {
        const e = new Error("indisponible");
        e.name = "PrivacyRouterUnavailableError";
        throw e;
      },
    };
    const f = fakeReader();
    await runCrawlSlice(
      deps({ reader: f.reader, privacy: down }),
      s2.created.taskId,
    );
    const failed = await taskOf(s2.created.taskId);
    expect(failed?.status).toBe("failed");
    expect(failed?.errorCode).toBe("privacy_router_unavailable");
    expect(f.gets).toEqual([]);
    expect((await getAccount(t.db, s2.org)).balanceMicro).toBe(100_000n);
    expect((await getAccount(t.db, s2.org)).heldMicro).toBe(0n);
  });

  it("organisation maison : explore sans débit, la valeur offerte est comptée", async () => {
    const s = await start({ house: true, params: { limit: 3 } });
    if (!s.created.ok) throw new Error("création");
    const { reader } = fakeReader();
    await runCrawlSlice(deps({ reader }), s.created.taskId);
    const events = await t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, s.org));
    expect(events.every((e) => !e.billed && e.costMicro === 0n)).toBe(true);
    expect(events.reduce((a, e) => a + e.valueMicro, 0n)).toBe(3000n);
    expect((await getAccount(t.db, s.org)).balanceMicro).toBe(0n);
  });

  it("rejouer une tâche terminée ne fait rien", async () => {
    const s = await start({ balance: 100_000n, params: { limit: 2 } });
    if (!s.created.ok) throw new Error("création");
    const { reader, gets } = fakeReader();
    await runCrawlSlice(deps({ reader }), s.created.taskId);
    const n = gets.length;
    expect(await runCrawlSlice(deps({ reader }), s.created.taskId)).toEqual({
      done: true,
    });
    expect(gets.length).toBe(n);
  });
});

describe("fin de tâche et conservation", () => {
  it("annuler une tâche en file libère la réservation, une seule fois", async () => {
    const s = await start({ balance: 100_000n });
    if (!s.created.ok) throw new Error("création");
    const opts = { retentionMs: 1000, now: new Date() };
    expect(await finishTask(t.db, s.created.taskId, "cancelled", opts)).toBe(
      true,
    );
    expect(await finishTask(t.db, s.created.taskId, "cancelled", opts)).toBe(
      false,
    );
    const acct = await getAccount(t.db, s.org);
    expect(acct.heldMicro).toBe(0n);
    expect(acct.balanceMicro).toBe(100_000n);
  });

  it("efface les tâches échues et leurs résultats", async () => {
    const s = await start({ balance: 100_000n, params: { limit: 2 } });
    if (!s.created.ok) throw new Error("création");
    const { reader } = fakeReader();
    const now = new Date();
    await runCrawlSlice(
      deps({ reader, now: () => now, retentionMs: 1000 }),
      s.created.taskId,
    );
    expect(await purgeExpiredTasks(t.db, new Date(now.getTime() + 500))).toBe(
      0,
    );
    expect(
      await purgeExpiredTasks(t.db, new Date(now.getTime() + 5000)),
    ).toBeGreaterThanOrEqual(1);
    expect(await taskOf(s.created.taskId)).toBeUndefined();
    expect(
      await t.db
        .select()
        .from(webpilotTaskResults)
        .where(eq(webpilotTaskResults.taskId, s.created.taskId)),
    ).toHaveLength(0);
  });
});
