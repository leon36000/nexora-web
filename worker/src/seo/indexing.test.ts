import {
  eq,
  indexingSubmissions,
  seoAdapters,
  sitemapSnapshots,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getOrCreateIndexNowKey } from "./adapters.ts";
import { diffSitemap, runIndexing } from "./indexing.ts";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});
beforeEach(async () => {
  await t.db.delete(indexingSubmissions);
  await t.db.delete(sitemapSnapshots);
  await t.db.delete(seoAdapters);
});
const silent = createLogger({ name: "test", sink: () => {} });

const sitemap = (rows: [string, string?][]) =>
  `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rows
    .map(
      ([u, m]) =>
        `<url><loc>${u}</loc>${m ? `<lastmod>${m}</lastmod>` : ""}</url>`,
    )
    .join("")}</urlset>`;

function harness(xml: string, post: { status: number } = { status: 200 }) {
  const calls: { url: string; body?: Record<string, unknown> }[] = [];
  const fetchImpl = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    const u = String(url);
    calls.push({
      url: u,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (u.endsWith("/sitemap.xml")) return new Response(xml);
    return new Response("", { status: post.status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}
const env = (over: Record<string, string> = {}) => ({
  SEO_AUDIT_BASE_URL: "http://app",
  SITE_URL: "https://nexora.test",
  ...over,
});
/** Comme en production : la vérification a généré la clé IndexNow, puis un humain a autorisé l'écriture. */
const authorize = async (key: "indexnow" | "bing") => {
  if (key === "indexnow") await getOrCreateIndexNowKey(t.db);
  await t.db
    .insert(seoAdapters)
    .values({ key, writeEnabled: true, lastCheckStatus: "ok" })
    .onConflictDoUpdate({
      target: seoAdapters.key,
      set: { writeEnabled: true, lastCheckStatus: "ok" },
    });
};

const XML = sitemap([
  ["https://nexora.test/", "2026-10-01"],
  ["https://nexora.test/a", "2026-10-02"],
]);

describe("diff du sitemap", () => {
  it("nouvelles URL et lastmod changé ; tout au premier passage", () => {
    expect(diffSitemap(null, { a: "1", b: null })).toEqual(["a", "b"]);
    expect(diffSitemap({ a: "1", b: null }, { a: "1", b: null })).toEqual([]);
    expect(diffSitemap({ a: "1" }, { a: "2", c: null })).toEqual(["a", "c"]);
  });
});

describe("indexation après publication", () => {
  it("préproduction : rien n'est envoyé, la raison est journalisée, la photographie n'avance pas", async () => {
    const h = harness(XML);
    const out = await runIndexing(
      {
        db: t.db,
        log: silent,
        readSecret: async () => "",
        fetchImpl: h.fetchImpl,
        env: env({ SITE_ENV: "staging" }),
      },
      { trigger: "publish" },
    );
    expect(h.calls.map((c) => c.url)).toEqual(["http://app/sitemap.xml"]);
    expect(out.engines.every((e) => e.status === "skipped")).toBe(true);
    expect(out.snapshotSaved).toBe(false);
    expect((await t.db.select().from(indexingSubmissions)).length).toBe(2);
  });

  it("production mais adaptateur non autorisé en écriture : ignoré, rien d'envoyé", async () => {
    const h = harness(XML);
    const out = await runIndexing(
      {
        db: t.db,
        log: silent,
        readSecret: async () => "",
        fetchImpl: h.fetchImpl,
        env: env({ SITE_ENV: "production" }),
      },
      { trigger: "publish" },
    );
    expect(h.calls).toHaveLength(1);
    expect(out.engines.map((e) => `${e.engine}:${e.status}`)).toEqual([
      "indexnow:skipped",
      "bing:skipped",
    ]);
  });

  it("simulation : journalisée « dry_run », jamais envoyée", async () => {
    const h = harness(XML);
    await authorize("indexnow");
    const out = await runIndexing(
      {
        db: t.db,
        log: silent,
        readSecret: async () => "",
        fetchImpl: h.fetchImpl,
        env: env({ SITE_ENV: "production" }),
      },
      { trigger: "manual", dryRun: true },
    );
    expect(h.calls).toHaveLength(1);
    expect(out.engines.every((e) => e.status === "dry_run")).toBe(true);
    expect(out.snapshotSaved).toBe(false);
  });

  it("production + autorisé : IndexNow reçoit host, clé, emplacement de la clé et URL ; la photographie avance ; le passage suivant n'a rien à faire", async () => {
    await authorize("indexnow");
    const h = harness(XML);
    const deps = {
      db: t.db,
      log: silent,
      readSecret: async () => "",
      fetchImpl: h.fetchImpl,
      env: env({ SITE_ENV: "production" }),
    };
    const out = await runIndexing(deps, { trigger: "publish" });
    const key = await getOrCreateIndexNowKey(t.db);
    const post = h.calls.find(
      (c) => c.url === "https://api.indexnow.org/IndexNow",
    );
    expect(post?.body).toEqual({
      host: "nexora.test",
      key,
      keyLocation: `https://nexora.test/${key}.txt`,
      urlList: ["https://nexora.test/", "https://nexora.test/a"],
    });
    expect(out.snapshotSaved).toBe(true);
    const again = await runIndexing(deps, { trigger: "publish" });
    expect(again.changed).toEqual([]);
    expect(h.calls.filter((c) => c.url.includes("indexnow")).length).toBe(1);
  });

  it("une page modifiée (lastmod) est seule renvoyée", async () => {
    await authorize("indexnow");
    const h1 = harness(XML);
    const deps = (h: ReturnType<typeof harness>) => ({
      db: t.db,
      log: silent,
      readSecret: async () => "",
      fetchImpl: h.fetchImpl,
      env: env({ SITE_ENV: "production" }),
    });
    await runIndexing(deps(h1), { trigger: "publish" });
    const h2 = harness(
      sitemap([
        ["https://nexora.test/", "2026-10-01"],
        ["https://nexora.test/a", "2026-10-05"],
      ]),
    );
    const out = await runIndexing(deps(h2), { trigger: "publish" });
    expect(out.changed).toEqual(["https://nexora.test/a"]);
  });

  it("échec du moteur : journalisé « failed », la photographie n'avance pas (rien n'est perdu)", async () => {
    await authorize("indexnow");
    const h = harness(XML, { status: 500 });
    const out = await runIndexing(
      {
        db: t.db,
        log: silent,
        readSecret: async () => "",
        fetchImpl: h.fetchImpl,
        env: env({ SITE_ENV: "production" }),
      },
      { trigger: "publish" },
    );
    expect(out.engines[0]).toMatchObject({
      engine: "indexnow",
      status: "failed",
    });
    expect(out.snapshotSaved).toBe(false);
    const rows = await t.db
      .select()
      .from(indexingSubmissions)
      .where(eq(indexingSubmissions.engine, "indexnow"));
    expect(rows[0]?.httpStatus).toBe(500);
  });
});
