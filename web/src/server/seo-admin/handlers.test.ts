import { randomBytes } from "node:crypto";
import {
  eq,
  indexingSubmissions,
  jobs,
  seoAdapters,
  seoAudits,
  seoIssues,
  seoSettings,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadKeyring } from "../vault/crypto";
import { putSecret } from "../vault/store";
import { adapterState, SEO_ADAPTER_SECRET_REFS } from "./adapters";
import { handleSeoAdmin, type SeoAdminDeps } from "./handlers";

const TOKEN = "s".repeat(40);
const keyring = loadKeyring({
  NEXORA_VAULT_MASTER_KEY: randomBytes(32).toString("base64"),
});
let t: TestDatabase;
let deps: SeoAdminDeps;
const seen: string[] = [];

beforeAll(async () => {
  t = await createTestDatabase();
  deps = {
    db: () => t.db,
    adminToken: TOKEN,
    log: createLogger({ name: "test", level: "error" }),
    now: () => new Date(),
    env: { SITE_ENV: "staging" },
  };
});
afterAll(async () => {
  await t.drop();
});

async function call(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` },
  override: Partial<SeoAdminDeps> = {},
) {
  const [pathname] = path.split("?");
  const request = new Request(`http://app.test/api/admin/seo/${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await handleSeoAdmin(
    request,
    pathname?.split("/").filter(Boolean) ?? [],
    { ...deps, ...override },
  );
  const text = await res.text();
  seen.push(text);
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

describe("état honnête d'un adaptateur", () => {
  it.each([
    [
      { secretPresent: false, lastCheckStatus: "ok", writeEnabled: true },
      "not_connected",
    ],
    [
      { secretPresent: true, lastCheckStatus: "never", writeEnabled: true },
      "not_connected",
    ],
    [
      { secretPresent: true, lastCheckStatus: "error", writeEnabled: true },
      "not_connected",
    ],
    [
      { secretPresent: true, lastCheckStatus: "ok", writeEnabled: false },
      "read",
    ],
    [
      { secretPresent: true, lastCheckStatus: "ok", writeEnabled: true },
      "write",
    ],
  ] as const)("%j -> %s", (input, expected) => {
    expect(adapterState(input)).toBe(expected);
  });
});

describe("authentification", () => {
  it("503 sans jeton, 401 avec un mauvais jeton", async () => {
    expect(
      (await call("GET", "", undefined, {}, { adminToken: undefined })).status,
    ).toBe(503);
    expect((await call("GET", "", undefined, {})).status).toBe(401);
    expect(
      (await call("GET", "", undefined, { authorization: "Bearer x" })).status,
    ).toBe(401);
  });
});

describe("vue d'ensemble et adaptateurs", () => {
  it("tout est non connecté sans clé, et la politique robots est lisible", async () => {
    const r = await call("GET", "");
    expect(r.status).toBe(200);
    expect(r.body.adapters.map((a: { key: string }) => a.key)).toEqual([
      "indexnow",
      "bing",
      "searchconsole",
      "dataforseo",
      "postiz",
    ]);
    for (const a of r.body.adapters) {
      expect(a.state).toBe("not_connected");
      expect(a.stateDetail.length).toBeGreaterThan(5);
    }
    expect(r.body.robots).toEqual({
      siteEnv: "staging",
      aiTraining: "allow",
    });
    expect(r.body.issues.open).toEqual({ error: 0, warning: 0, info: 0 });
  });

  it("refuse l'autorisation d'écriture tant que l'adaptateur n'est pas au moins en lecture", async () => {
    expect(
      (await call("PATCH", "adapters/bing", { writeEnabled: true })).body.error,
    ).toBe("adapter_not_ready");
    expect(
      (await call("PATCH", "adapters/inconnu", { writeEnabled: true })).status,
    ).toBe(404);
    // clé présente mais jamais vérifiée : toujours refusé
    await putSecret(t.db, keyring, {
      ref: SEO_ADAPTER_SECRET_REFS.bing,
      value: "cle-bing-factice-0123456789",
      kind: "other",
    });
    expect(
      (await call("PATCH", "adapters/bing", { writeEnabled: true })).status,
    ).toBe(409);
    const view = await call("GET", "");
    const bing = view.body.adapters.find(
      (a: { key: string }) => a.key === "bing",
    );
    expect(bing.state).toBe("not_connected");
    expect(bing.secretPresent).toBe(true);
    expect(bing.stateDetail).toContain("non vérifiée");
    // vérification réussie -> lecture, puis écriture autorisée par un humain
    await t.db
      .update(seoAdapters)
      .set({ lastCheckStatus: "ok", lastCheckAt: new Date() })
      .where(eq(seoAdapters.key, "bing"));
    const read = (await call("GET", "")).body.adapters.find(
      (a: { key: string }) => a.key === "bing",
    );
    expect(read.state).toBe("read");
    const write = await call("PATCH", "adapters/bing", { writeEnabled: true });
    expect(write.body.adapter.state).toBe("write");
    expect(
      (await call("PATCH", "adapters/bing", { writeEnabled: false })).body
        .adapter.state,
    ).toBe("read");
    for (const text of seen) expect(text).not.toContain("cle-bing-factice");
  });

  it("IndexNow est connecté dès que sa clé publique existe et que la vérification a réussi", async () => {
    await t.db
      .insert(seoSettings)
      .values({ key: "indexnow_key", value: "a".repeat(32) });
    await t.db
      .update(seoAdapters)
      .set({ lastCheckStatus: "ok" })
      .where(eq(seoAdapters.key, "indexnow"));
    const nx = (await call("GET", "")).body.adapters.find(
      (a: { key: string }) => a.key === "indexnow",
    );
    expect(nx.state).toBe("read");
    expect(JSON.stringify(nx)).not.toContain("a".repeat(32));
  });

  it("met la vérification d'un adaptateur en file", async () => {
    const r = await call("POST", "adapters/postiz/check");
    expect(r.status).toBe(202);
    const [job] = await t.db
      .select()
      .from(jobs)
      .where(eq(jobs.id, r.body.jobId));
    expect(job?.type).toBe("seo.adapter-check");
    expect(job?.payload).toEqual({ key: "postiz" });
  });
});

describe("audits et problèmes", () => {
  it("crée un audit par volet demandé et une tâche chacun", async () => {
    const r = await call("POST", "audits", {
      kinds: ["links", "a11y", "links"],
    });
    expect(r.status).toBe(202);
    expect(r.body.auditIds).toHaveLength(2);
    const all = await call("POST", "audits");
    expect(all.body.auditIds).toHaveLength(1);
    const [audit] = await t.db
      .select()
      .from(seoAudits)
      .where(eq(seoAudits.id, all.body.auditId));
    expect(audit?.kind).toBe("all");
    expect(audit?.status).toBe("queued");
    expect(audit?.trigger).toBe("manual");
    const [job] = await t.db
      .select()
      .from(jobs)
      .where(eq(jobs.idempotencyKey, `seo-audit:${all.body.auditId}`));
    expect(job?.type).toBe("seo.audit");
    expect((await call("POST", "audits", { kinds: ["inconnu"] })).status).toBe(
      422,
    );
    expect(
      (await call("GET", "audits")).body.audits.length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("liste les problèmes ouverts triés par gravité, permet d'ignorer et de rouvrir, jamais de résoudre à la main", async () => {
    const [audit] = await t.db
      .insert(seoAudits)
      .values({ kind: "links", status: "succeeded" })
      .returning();
    const mk = (rule: string, severity: "error" | "warning" | "info") => ({
      auditId: audit?.id,
      kind: "links",
      severity,
      rule,
      url: `https://site.test/${rule}`,
      message: rule,
      fingerprint: `links|${rule}`,
    });
    await t.db
      .insert(seoIssues)
      .values([mk("b", "warning"), mk("a", "error"), mk("c", "info")]);
    const list = await call("GET", "issues?status=open&kind=links");
    expect(list.body.issues.map((i: { rule: string }) => i.rule)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(
      (await call("GET", "issues?severity=error")).body.issues,
    ).toHaveLength(1);
    expect((await call("GET", "issues?status=nimporte")).status).toBe(422);
    const id = list.body.issues[0].id;
    expect(
      (await call("PATCH", `issues/${id}`, { status: "ignored" })).body.issue
        .status,
    ).toBe("ignored");
    expect(
      (await call("GET", "issues?status=open&kind=links")).body.issues,
    ).toHaveLength(2);
    expect(
      (await call("PATCH", `issues/${id}`, { status: "open" })).body.issue
        .status,
    ).toBe("open");
    expect(
      (await call("PATCH", `issues/${id}`, { status: "resolved" })).status,
    ).toBe(422);
    const detail = await call("GET", `audits/${audit?.id}`);
    expect(detail.body.issues).toHaveLength(3);
    const overview = await call("GET", "");
    expect(overview.body.issues.open).toEqual({
      error: 1,
      warning: 1,
      info: 1,
    });
    expect(
      overview.body.audits.find((a: { kind: string }) => a.kind === "links"),
    ).toBeTruthy();
  });
});

describe("indexation", () => {
  it("met en file une indexation (simulation ou non) et liste les soumissions", async () => {
    const dry = await call("POST", "indexing/run", { dryRun: true });
    expect(dry.status).toBe(202);
    const [job] = await t.db
      .select()
      .from(jobs)
      .where(eq(jobs.id, dry.body.jobId));
    expect(job?.type).toBe("seo.index");
    expect(job?.payload).toEqual({ trigger: "manual", dryRun: true });
    const live = await call("POST", "indexing/run", {});
    expect(live.status).toBe(202);
    await t.db.insert(indexingSubmissions).values({
      engine: "indexnow",
      trigger: "manual",
      status: "dry_run",
      urlCount: 2,
    });
    const r = await call("GET", "indexing");
    expect(r.body.submissions).toHaveLength(1);
    expect((await call("POST", "indexing/run", { dryRun: "oui" })).status).toBe(
      422,
    );
  });
});
