import {
  ensureSiteAgents,
  eq,
  jobs,
  seoAudits,
  siteAgentRuns,
  siteAgents,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { localClock, tickScheduler } from "./scheduler.ts";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});
beforeEach(async () => {
  await t.db.delete(jobs);
  await t.db.delete(siteAgentRuns);
  await t.db.delete(seoAudits);
  await t.db.delete(siteAgents);
  await ensureSiteAgents(t.db);
});
const silent = createLogger({ name: "test", sink: () => {} });

describe("horloge locale (America/Toronto)", () => {
  it("heure d'été et d'hiver", () => {
    expect(localClock(new Date("2026-07-15T07:30:00Z")).hour).toBe(3);
    expect(localClock(new Date("2026-12-15T08:30:00Z")).hour).toBe(3);
    expect(localClock(new Date("2026-10-26T12:00:00Z"))).toMatchObject({
      date: "2026-10-26",
      weekday: "Mon",
      hour: 8,
    });
  });
});

describe("planificateur", () => {
  const at = (iso: string) => ({
    db: t.db,
    log: silent,
    now: () => new Date(iso),
  });

  it("rien avant 3 h ; audit nocturne une seule fois par jour, même rappelé", async () => {
    expect(await tickScheduler(at("2026-10-27T05:00:00Z"))).toEqual([]); // 01:00 locale
    expect(
      (await tickScheduler(at("2026-10-27T07:05:00Z"))).includes(
        "audit nocturne",
      ),
    ).toBe(true); // 03:05 locale
    expect(await tickScheduler(at("2026-10-27T07:06:00Z"))).toEqual([]);
    expect(await tickScheduler(at("2026-10-27T07:07:00Z"))).toEqual([]);
    const audits = await t.db.select().from(seoAudits);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      kind: "all",
      trigger: "schedule",
      status: "queued",
    });
    const queued = (await t.db.select().from(jobs)).filter(
      (j) => j.type === "seo.audit",
    );
    expect(queued).toHaveLength(1);
    expect(queued[0]?.payload).toEqual({ auditId: audits[0]?.id });
  });

  it("l'indexation de sécurité et les vérifications d'adaptateurs sont planifiées à partir de 4 h, une fois", async () => {
    await tickScheduler(at("2026-10-27T08:10:00Z"));
    await tickScheduler(at("2026-10-27T08:11:00Z"));
    const types = (await t.db.select().from(jobs)).map((j) => j.type).sort();
    expect(types.filter((x) => x === "seo.index")).toHaveLength(1);
    expect(types.filter((x) => x === "seo.adapter-check")).toHaveLength(5);
  });

  it("Santé : une exécution par heure, seulement si l'agent est activé", async () => {
    await tickScheduler(at("2026-10-27T14:00:00Z"));
    expect(await t.db.select().from(siteAgentRuns)).toHaveLength(0);
    await t.db
      .update(siteAgents)
      .set({ enabled: true, state: "idle" })
      .where(eq(siteAgents.key, "sante"));
    await tickScheduler(at("2026-10-27T14:01:00Z"));
    await tickScheduler(at("2026-10-27T14:30:00Z"));
    await tickScheduler(at("2026-10-27T15:01:00Z"));
    const runs = await t.db.select().from(siteAgentRuns);
    expect(runs).toHaveLength(2);
    expect(
      runs.every((r) => r.agentKey === "sante" && r.trigger === "schedule"),
    ).toBe(true);
    const runJobs = (await t.db.select().from(jobs)).filter(
      (j) => j.type === "site-agent.run",
    );
    expect(
      runJobs.map((j) => (j.payload as { runId: string }).runId).sort(),
    ).toEqual(runs.map((r) => r.id).sort());
  });

  it("Veille : le lundi, si activée ET source configurée", async () => {
    await t.db
      .update(siteAgents)
      .set({ enabled: true, state: "idle" })
      .where(eq(siteAgents.key, "veille"));
    await tickScheduler(at("2026-10-26T12:00:00Z")); // lundi, pas de source
    expect(
      (await t.db.select().from(siteAgentRuns)).filter(
        (r) => r.agentKey === "veille",
      ),
    ).toHaveLength(0);
    await t.db
      .update(siteAgents)
      .set({ config: { sourceUrl: "https://source.example/veille" } })
      .where(eq(siteAgents.key, "veille"));
    await tickScheduler(at("2026-10-26T12:05:00Z"));
    await tickScheduler(at("2026-10-26T12:06:00Z"));
    const v = (await t.db.select().from(siteAgentRuns)).filter(
      (r) => r.agentKey === "veille",
    );
    expect(v).toHaveLength(1);
    expect(v[0]?.input).toEqual({ sourceUrl: "https://source.example/veille" });
    await tickScheduler(at("2026-10-28T12:00:00Z")); // mercredi
    expect(
      (await t.db.select().from(siteAgentRuns)).filter(
        (r) => r.agentKey === "veille",
      ),
    ).toHaveLength(1);
  });

  it("grand livre : libération des réservations perdues toutes les 10 minutes, expiration une fois par jour", async () => {
    await tickScheduler(at("2026-10-27T14:00:00Z"));
    await tickScheduler(at("2026-10-27T14:03:00Z")); // même tranche de 10 minutes
    await tickScheduler(at("2026-10-27T14:11:00Z")); // tranche suivante
    await tickScheduler(at("2026-10-27T18:00:00Z")); // plus tard le même jour
    const all = await t.db.select().from(jobs);
    const releases = all.filter((j) => j.type === "ledger.release-stale");
    const expires = all.filter((j) => j.type === "ledger.expire");
    expect(releases.length).toBe(3);
    expect(new Set(releases.map((j) => j.idempotencyKey)).size).toBe(3);
    expect(expires).toHaveLength(1);
    expect(expires[0]?.idempotencyKey).toBe("ledger-expire:2026-10-27");
    await tickScheduler(at("2026-10-28T14:00:00Z"));
    expect(
      (await t.db.select().from(jobs)).filter(
        (j) => j.type === "ledger.expire",
      ),
    ).toHaveLength(2);
  });

  it("grand livre : le versement des douzièmes des offres annuelles est déclaré une fois par heure", async () => {
    await tickScheduler(at("2026-10-27T14:00:00Z"));
    await tickScheduler(at("2026-10-27T14:40:00Z")); // même heure
    await tickScheduler(at("2026-10-27T15:05:00Z")); // heure suivante
    const grants = (await t.db.select().from(jobs)).filter(
      (j) => j.type === "ledger.grant-tranches",
    );
    expect(grants).toHaveLength(2);
    expect(new Set(grants.map((j) => j.idempotencyKey)).size).toBe(2);
  });

  it("alertes de solde bas : déclarées une fois par demi-heure", async () => {
    await tickScheduler(at("2026-10-27T14:00:00Z"));
    await tickScheduler(at("2026-10-27T14:20:00Z")); // même demi-heure
    await tickScheduler(at("2026-10-27T14:35:00Z")); // demi-heure suivante
    const alerts = (await t.db.select().from(jobs)).filter(
      (j) => j.type === "billing.balance-alerts",
    );
    expect(alerts).toHaveLength(2);
    expect(new Set(alerts.map((j) => j.idempotencyKey)).size).toBe(2);
  });

  it("grand livre : l'expiration n'est pas déclarée avant 2 h (heure locale)", async () => {
    await tickScheduler(at("2026-10-27T05:00:00Z")); // 01:00 locale
    expect(
      (await t.db.select().from(jobs)).filter(
        (j) => j.type === "ledger.expire",
      ),
    ).toHaveLength(0);
  });
});
