/**
 * `reconcile.daily` (audit F-06) : comparaison du grand livre aux sources amont, sur une vraie base et des sources
 * simulées (aucun appel réel, aucun secret). Vérifie : écarts consignés, aucune correction du grand livre, sources
 * illisibles qui ne concluent rien, rejeu idempotent, détection des dépenses sans ligne, adaptateurs LiteLLM (SQL réel)
 * et OpenRouter (fetch simulé), planification à 03:00 America/Toronto.
 */
import { randomBytes } from "node:crypto";
import {
  apiKeys,
  credit,
  creditEntries,
  eq,
  getAccount,
  jobs,
  organizations,
  reconciliationFindings,
  reconciliationRuns,
  sql,
  type UpstreamRecord,
  usageEvents,
  usageIntents,
  usageReconciliations,
  usdToNano,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultRegistry } from "./handlers.ts";
import {
  createLitellmSpendReader,
  createOpenRouterReader,
  previousUtcDay,
  type ReconcileDeps,
  reconcileDay,
} from "./reconcile-handlers.ts";
import { tickScheduler } from "./scheduler.ts";

let t: TestDatabase;
const lines: string[] = [];
const log = createLogger({ name: "test", sink: (l) => lines.push(l) });
const M = 1_000_000n;
const DAY = "2026-11-10";
const nano = (v: string | number) => usdToNano(v) as bigint;

beforeAll(async () => {
  t = await createTestDatabase();
  await t.db.execute(sql`
    CREATE TABLE "LiteLLM_SpendLogs" (
      request_id text PRIMARY KEY, litellm_call_id text, api_key text DEFAULT '', spend double precision DEFAULT 0,
      prompt_tokens int DEFAULT 0, completion_tokens int DEFAULT 0, "startTime" timestamptz NOT NULL,
      model_group text, custom_llm_provider text)`);
});
afterAll(async () => {
  await t.drop();
});

async function client() {
  const org = `org_${randomBytes(6).toString("hex")}`;
  await t.db.insert(organizations).values({ id: org, name: org, slug: org });
  await credit(t.db, {
    organizationId: org,
    amountMicro: 10n * M,
    idempotencyKey: `f:${org}`,
    configVersion: "t",
    source: "purchase",
  });
  const [key] = await t.db
    .insert(apiKeys)
    .values({
      organizationId: org,
      name: "k",
      prefix: "nxk_t",
      keyHash: randomBytes(12).toString("hex"),
    })
    .returning();
  if (!key) throw new Error("clé");
  return { org, keyId: key.id };
}
async function event(
  c: { org: string; keyId: string },
  requestId: string,
  over: Partial<typeof usageEvents.$inferInsert> = {},
) {
  const [e] = await t.db
    .insert(usageEvents)
    .values({
      requestId,
      organizationId: c.org,
      apiKeyId: c.keyId,
      modelPublicId: "nexora/m",
      endpoint: "chat.completions",
      configVersion: "cat",
      status: "ok",
      httpStatus: 200,
      promptTokens: 100,
      completionTokens: 20,
      costMicro: 5_000n,
      valueMicro: 5_000n,
      usageSource: "provider",
      fxUsdToCadMicro: 1_400_000n,
      upstreamCostUsdNano: 1_000_000n,
      createdAt: new Date(`${DAY}T15:00:00Z`),
      ...over,
    })
    .returning();
  if (!e) throw new Error("événement");
  return e;
}
const rec = (
  id: string,
  over: Partial<UpstreamRecord> = {},
): UpstreamRecord => ({
  id,
  source: "litellm",
  day: DAY,
  model: "nexora/m",
  totalCostUsdNano: 1_000_000n,
  nativePrompt: 100,
  nativeCompletion: 20,
  nativeCached: null,
  nativeReasoning: null,
  cancelled: false,
  provider: null,
  ...over,
});
const deps = (over: Partial<ReconcileDeps> = {}): ReconcileDeps => ({
  db: t.db,
  log,
  litellm: null,
  openrouter: null,
  now: () => new Date("2026-11-11T08:00:00Z"),
  ...over,
});
const findingsOf = (org: string) =>
  t.db
    .select()
    .from(reconciliationFindings)
    .where(eq(reconciliationFindings.organizationId, org));

describe("reconcile.daily", () => {
  it("compare, consigne les écarts, enregistre le résultat par événement et ne touche JAMAIS au grand livre", async () => {
    const c = await client();
    const healthy = await event(c, "r_ok", { litellmCallId: "call-ok" });
    await event(c, "r_missing", { litellmCallId: "call-missing" });
    await event(c, "r_aborted", {
      litellmCallId: "call-ab",
      usageSource: "estimated_aborted",
      completionTokens: 0,
    });
    const before = await t.db
      .select()
      .from(creditEntries)
      .where(eq(creditEntries.organizationId, c.org));
    const balance = await getAccount(t.db, c.org);
    const alerts: string[] = [];
    const out = await reconcileDay(
      deps({
        litellm: {
          byCallIds: async () => [
            rec("call-ok"),
            rec("call-ab", { nativeCompletion: 812 }),
          ],
          forDay: null,
        },
        notify: async (s, body) => void alerts.push(`${s}|${body}`),
      }),
      DAY,
    );
    expect(out).toMatchObject({
      day: DAY,
      ledgerRows: 3,
      results: 3,
      unbilledChecked: false,
    });
    const kinds = (await findingsOf(c.org)).map((f) => f.kind).sort();
    expect(kinds).toEqual(["billed_no_upstream", "token_mismatch"]);
    const res = await t.db
      .select()
      .from(usageReconciliations)
      .where(eq(usageReconciliations.usageEventId, healthy.id));
    expect(res[0]).toMatchObject({
      status: "ok",
      source: "litellm",
      nativeCompletionTokens: 20,
    });
    // Aucune correction automatique : mêmes écritures, même solde.
    expect(
      await t.db
        .select()
        .from(creditEntries)
        .where(eq(creditEntries.organizationId, c.org)),
    ).toEqual(before);
    expect(await getAccount(t.db, c.org)).toEqual(balance);
    // Ni billed_no_upstream ni token_mismatch ne réveillent personne.
    expect(alerts).toEqual([]);
    const [run] = await t.db
      .select()
      .from(reconciliationRuns)
      .where(eq(reconciliationRuns.id, out.runId));
    expect(run?.status).toBe("ok");
  });

  it("marge négative ou dérive : alerte (comptes seulement, aucun contenu ni identifiant client)", async () => {
    const c = await client();
    await event(c, "r_neg", {
      litellmCallId: "call-neg",
      costMicro: 100n,
      upstreamCostUsdNano: 5_000_000n,
    });
    const alerts: string[] = [];
    const out = await reconcileDay(
      deps({
        litellm: {
          byCallIds: async () => [
            rec("call-neg", { totalCostUsdNano: 5_000_000n }),
          ],
          forDay: null,
        },
        notify: async (s, body) => void alerts.push(`${s}|${body}`),
      }),
      DAY,
    );
    expect(out.alerted).toBe(true);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain("negative_margin");
    expect(alerts[0]).not.toContain(c.org);
    expect(alerts[0]).not.toContain("r_neg");
  });

  it("une source illisible ne conclut rien : aucun « manquant », l'événement reste à reprendre", async () => {
    const c = await client();
    const e = await event(c, "r_down", {
      litellmCallId: "call-down",
      upstreamGenerationId: "gen-down",
    });
    const out = await reconcileDay(
      deps({
        litellm: {
          byCallIds: async () => {
            throw new Error("connexion refusée");
          },
          forDay: null,
        },
        openrouter: {
          generation: async () => {
            throw new Error("HTTP 503");
          },
        },
      }),
      DAY,
    );
    expect(out.unavailable.sort()).toEqual(["litellm", "openrouter"]);
    expect(
      (await findingsOf(c.org)).filter((f) => f.kind === "billed_no_upstream"),
    ).toEqual([]);
    expect(
      await t.db
        .select()
        .from(usageReconciliations)
        .where(eq(usageReconciliations.usageEventId, e.id)),
    ).toEqual([]);
  });

  it("rejouable : un second passage ne duplique ni les écarts ni les résultats", async () => {
    const c = await client();
    await event(c, "r_replay", { litellmCallId: "call-replay" });
    const sources = {
      litellm: { byCallIds: async () => [] as UpstreamRecord[], forDay: null },
    };
    await reconcileDay(deps(sources), DAY);
    await reconcileDay(deps(sources), DAY);
    expect(
      (await findingsOf(c.org)).filter((f) => f.requestId === "r_replay"),
    ).toHaveLength(1);
    expect(
      await t.db
        .select()
        .from(usageReconciliations)
        .where(eq(usageReconciliations.requestId, "r_replay")),
    ).toHaveLength(1);
  });

  it("dépenses LiteLLM sans ligne chez nous : unbilled_upstream, sauf les appels connus (événement ou intention)", async () => {
    const c = await client();
    await event(c, "r_known", { litellmCallId: "call-known" });
    await t.db.insert(usageIntents).values({
      requestId: "r_intent_only",
      organizationId: c.org,
      apiKeyId: c.keyId,
      modelPublicId: "nexora/m",
      endpoint: "chat.completions",
      configVersion: "cat",
      promptEstimate: 1,
      recoveryCostMicro: 0n,
      litellmCallId: "call-intent",
    });
    const out = await reconcileDay(
      deps({
        litellm: {
          byCallIds: async () => [rec("call-known")],
          forDay: async () => [
            rec("call-known"),
            rec("call-intent"),
            rec("call-orphan", { totalCostUsdNano: nano("0.25") }),
          ],
        },
      }),
      DAY,
    );
    expect(out.unbilledChecked).toBe(true);
    const f = await t.db
      .select()
      .from(reconciliationFindings)
      .where(eq(reconciliationFindings.kind, "unbilled_upstream"));
    expect(f.map((x) => x.litellmCallId)).toContain("call-orphan");
    expect(f.map((x) => x.litellmCallId)).not.toContain("call-known");
    expect(f.map((x) => x.litellmCallId)).not.toContain("call-intent");
    expect(out.alerted).toBe(true);
  });

  it("invariant interne rompu : ledger_mismatch consigné et alerte", async () => {
    const c = await client();
    await t.db.execute(
      sql`UPDATE credit_accounts SET balance_micro = 7 WHERE organization_id = ${c.org}`,
    );
    const day = new Date().toISOString().slice(0, 10);
    const out = await reconcileDay(deps(), day);
    expect(out.findings.ledger_mismatch).toBeGreaterThanOrEqual(1);
    expect(out.alerted).toBe(true);
  });
});

describe("reprise des jours incomplets", () => {
  it("sans jour explicite, le job reprend aussi les jours précédents qui ont encore des événements sans résultat", async () => {
    const c = await client();
    await event(c, "r_resume", {
      litellmCallId: "call-resume",
      createdAt: new Date("2026-11-08T12:00:00Z"),
    });
    const registry = defaultRegistry({ db: t.db, log });
    const handler = registry.get("reconcile.daily");
    if (!handler) throw new Error("gestionnaire attendu");
    // Premier passage : LiteLLM en panne (aucune source). Le registre de production n'a pas de source configurée ici,
    // on exerce donc le gestionnaire avec des sources injectées.
    const { registerReconcileHandlers } = await import(
      "./reconcile-handlers.ts"
    );
    const { HandlerRegistry } = await import("./registry.ts");
    const mine = registerReconcileHandlers(new HandlerRegistry(), {
      ...deps({
        litellm: {
          byCallIds: async () => [rec("call-resume", { day: "2026-11-08" })],
          forDay: null,
        },
      }),
      now: () => new Date("2026-11-10T08:00:00Z"), // J-1 = 2026-11-09 ; J-3 = 2026-11-07 ; le 08 est J-2
    }).get("reconcile.daily");
    await mine?.(
      {
        id: "j",
        type: "reconcile.daily",
        payload: {},
        attempt: 1,
        maxAttempts: 1,
      },
      { log, signal: new AbortController().signal },
    );
    const done = await t.db
      .select()
      .from(usageReconciliations)
      .where(eq(usageReconciliations.requestId, "r_resume"));
    expect(done).toHaveLength(1);
    expect(done[0]?.status).toBe("ok");
  });
});

describe("adaptateur LiteLLM (SQL réel sur une table de même forme)", () => {
  it("lit la dépense par identifiant d'appel et, avec un filtre de clé, les dépenses du jour UTC", async () => {
    await t.db.execute(sql`
      INSERT INTO "LiteLLM_SpendLogs" (request_id, litellm_call_id, api_key, spend, prompt_tokens, completion_tokens, "startTime", model_group, custom_llm_provider) VALUES
      ('q1','c1','hash-gw', 0.0000575, 50, 20, '2026-11-10T04:59:59Z', 'nexora/m', 'openrouter'),
      ('q2','c2','hash-other', 1.5, 10, 10, '2026-11-10T10:00:00Z', 'nexora/m', 'deepinfra'),
      ('q3','c3','hash-gw', 0.2, 10, 10, '2026-11-11T00:00:00Z', 'nexora/m', 'deepinfra')`);
    const reader = createLitellmSpendReader(t.db, { keyHashes: ["hash-gw"] });
    const one = await reader.byCallIds(["c1", "c2"]);
    expect(one.find((r) => r.id === "c1")).toMatchObject({
      totalCostUsdNano: 57_500n,
      nativePrompt: 50,
      nativeCompletion: 20,
      provider: "openrouter",
      day: "2026-11-10",
    });
    const day = await reader.forDay?.(DAY);
    expect(day?.map((r) => r.id)).toEqual(["c1"]); // c2 : autre clé ; c3 : autre jour
    expect(createLitellmSpendReader(t.db).forDay).toBeNull();
  });
});

describe("adaptateur OpenRouter (fetch simulé)", () => {
  it("lit coût et jetons natifs ; reprend sur 404 ; la clé ne sort que dans l'en-tête ; null si introuvable", async () => {
    const seen: { url: string; auth: string | null }[] = [];
    let n = 0;
    const fake = (async (
      input: Parameters<typeof fetch>[0],
      init?: RequestInit,
    ) => {
      seen.push({
        url: String(input),
        auth: new Headers(init?.headers).get("authorization"),
      });
      n += 1;
      if (String(input).includes("gen-late") && n < 3)
        return new Response("", { status: 404 });
      if (String(input).includes("gen-none"))
        return new Response("", { status: 404 });
      return Response.json({
        data: {
          id: "x",
          total_cost: 0.0000575,
          created_at: "2026-11-10T12:00:00Z",
          model: "m",
          native_tokens_prompt: 50,
          native_tokens_completion: 20,
          native_tokens_cached: 5,
          native_tokens_reasoning: 3,
          cancelled: true,
          provider_name: "Wafer",
        },
      });
    }) as typeof fetch;
    const reader = createOpenRouterReader({
      key: async () => "sk-or-secret",
      fetch: fake,
      retryDelayMs: 1,
    });
    const late = await reader.generation("gen-late");
    expect(late).toMatchObject({
      source: "openrouter",
      id: "gen-late",
      day: "2026-11-10",
      totalCostUsdNano: 57_500n,
      nativePrompt: 50,
      nativeCompletion: 20,
      nativeCached: 5,
      nativeReasoning: 3,
      cancelled: true,
      provider: "Wafer",
    });
    expect(await reader.generation("gen-none")).toBeNull();
    expect(
      seen.every(
        (s) =>
          s.url.startsWith("https://openrouter.ai/api/v1/generation?id=") &&
          s.auth === "Bearer sk-or-secret",
      ),
    ).toBe(true);
    expect(JSON.stringify(seen.map((s) => s.url))).not.toContain(
      "sk-or-secret",
    );
    const failing = createOpenRouterReader({
      key: async () => "k",
      fetch: (async () => new Response("", { status: 503 })) as typeof fetch,
    });
    await expect(failing.generation("gen-x")).rejects.toThrow("HTTP 503");
  });
});

describe("planification", () => {
  it("le jour réconcilié est le jour UTC précédent", () => {
    expect(previousUtcDay(new Date("2026-11-11T08:00:00Z"))).toBe("2026-11-10");
    expect(previousUtcDay(new Date("2026-03-01T00:30:00Z"))).toBe("2026-02-28");
  });

  it("le registre déclare reconcile.daily ; le planificateur le met en file une fois par jour, à partir de 03:00 (America/Toronto)", async () => {
    expect(defaultRegistry({ db: t.db, log }).types()).toContain(
      "reconcile.daily",
    );
    await t.db.delete(jobs);
    const tick = (iso: string) =>
      tickScheduler({ db: t.db, log, now: () => new Date(iso) });
    await tick("2026-11-11T07:30:00Z"); // 02:30 à Toronto (UTC−5) : pas encore
    expect(
      await t.db.select().from(jobs).where(eq(jobs.type, "reconcile.daily")),
    ).toHaveLength(0);
    await tick("2026-11-11T08:05:00Z"); // 03:05
    await tick("2026-11-11T15:00:00Z"); // rejeu plus tard le même jour : rien de plus
    const rows = await t.db
      .select()
      .from(jobs)
      .where(eq(jobs.type, "reconcile.daily"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload).toEqual({ day: "2026-11-10" });
  });
});
