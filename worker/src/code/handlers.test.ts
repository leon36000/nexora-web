import { randomBytes } from "node:crypto";
import { type WorkspaceDriver, WorkspaceDriverError } from "@nexora/code";
import { codeWorkspaces, eq, jobs, organizations, users } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HandlerRegistry } from "../registry.ts";
import { tickScheduler } from "../scheduler.ts";
import {
  registerCodeHandlers,
  runCodeSweep,
  type UsageClient,
  usageClientFromEnv,
} from "./handlers.ts";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});
const silent = createLogger({ name: "test", sink: () => {} });
const NOW = new Date("2026-10-30T15:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
const MB = 1_000_000;

class FakeDriver implements WorkspaceDriver {
  stopped: string[] = [];
  measured: string[] = [];
  sizes = new Map<string, number>();
  failMeasure = new Set<string>();
  async create() {}
  async start() {}
  async stop(name: string) {
    this.stopped.push(name);
  }
  async remove() {}
  async state() {
    return {
      status: "running" as const,
      health: "healthy" as const,
      exitCode: null,
    };
  }
  async volumeBytes(i: { volumeName: string }) {
    this.measured.push(i.volumeName);
    if (this.failMeasure.has(i.volumeName))
      throw new WorkspaceDriverError("docker_failed", "x");
    return this.sizes.get(i.volumeName) ?? 0;
  }
}
class FakeUsage implements UsageClient {
  calls: { orgId: string; delta: number }[] = [];
  over = new Set<string>();
  fail = new Set<string>();
  onCall: (() => Promise<void>) | null = null;
  async apply(orgId: string, delta: number) {
    this.calls.push({ orgId, delta });
    if (this.fail.has(orgId)) throw new Error("site injoignable");
    await this.onCall?.();
    return { overQuota: this.over.has(orgId) };
  }
}

let seq = 0;
async function ws(over: Partial<typeof codeWorkspaces.$inferInsert> = {}) {
  seq += 1;
  const org = `org_sw_${seq}_${randomBytes(3).toString("hex")}`;
  const user = `usr_sw_${seq}_${randomBytes(3).toString("hex")}`;
  await t.db.insert(organizations).values({ id: org, name: org, slug: org });
  await t.db
    .insert(users)
    .values({ id: user, name: "M", email: `${user}@example.com` });
  const [row] = await t.db
    .insert(codeWorkspaces)
    .values({
      organizationId: org,
      userId: user,
      proxyId: randomBytes(16).toString("hex"),
      containerName: `nexora-code-sw${seq}${randomBytes(3).toString("hex")}`,
      volumeName: `nexora-code-vol-sw${seq}${randomBytes(3).toString("hex")}`,
      port: 22_000 + seq,
      desiredStatus: "running",
      lastStartedAt: minutesAgo(5),
      lastActivityAt: minutesAgo(1),
      ...over,
    })
    .returning();
  if (!row) throw new Error("ligne");
  return row;
}
const reload = async (id: string) =>
  (
    await t.db.select().from(codeWorkspaces).where(eq(codeWorkspaces.id, id))
  )[0];

function setup() {
  const driver = new FakeDriver();
  const usage = new FakeUsage();
  const deps = {
    db: t.db,
    log: silent,
    driver,
    usage,
    image: "nexora/code-workspace:local",
    idleMinutes: 30,
    now: () => NOW,
  };
  return { driver, usage, deps };
}

describe("code.sweep : arrêt après inactivité", () => {
  it("arrête les environnements inactifs depuis plus que le délai, pas les actifs", async () => {
    const { driver, deps } = setup();
    const idle = await ws({ lastActivityAt: minutesAgo(45) });
    const busy = await ws({ lastActivityAt: minutesAgo(10) });
    const never = await ws({
      lastActivityAt: null,
      lastStartedAt: minutesAgo(90),
    });
    const fresh = await ws({
      lastActivityAt: null,
      lastStartedAt: minutesAgo(3),
    });
    const result = await runCodeSweep(deps);
    expect(driver.stopped.sort()).toEqual(
      [idle.containerName, never.containerName].sort(),
    );
    expect(result.stopped).toBe(2);
    expect((await reload(idle.id))?.desiredStatus).toBe("stopped");
    expect((await reload(idle.id))?.lastStoppedAt?.toISOString()).toBe(
      NOW.toISOString(),
    );
    expect((await reload(busy.id))?.desiredStatus).toBe("running");
    expect((await reload(fresh.id))?.desiredStatus).toBe("running");
  });

  it("un échec d'arrêt n'empêche pas les suivants et laisse l'environnement « en marche » pour le prochain tour", async () => {
    const { driver, deps } = setup();
    const a = await ws({ lastActivityAt: minutesAgo(60) });
    const b = await ws({ lastActivityAt: minutesAgo(60) });
    const original = driver.stop.bind(driver);
    driver.stop = async (name: string) => {
      if (name === a.containerName)
        throw new WorkspaceDriverError("docker_failed", "x");
      return original(name);
    };
    const result = await runCodeSweep(deps);
    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect((await reload(a.id))?.desiredStatus).toBe("running");
    expect((await reload(b.id))?.desiredStatus).toBe("stopped");
  });
});

describe("code.sweep : espace du volume", () => {
  it("compte l'écart entre la taille mesurée et l'espace déjà compté", async () => {
    const { driver, usage, deps } = setup();
    const w = await ws({ accountedBytes: BigInt(64 * MB) });
    driver.sizes.set(w.volumeName, 200 * MB);
    const result = await runCodeSweep(deps);
    expect(usage.calls).toEqual([{ orgId: w.organizationId, delta: 136 * MB }]);
    const row = await reload(w.id);
    expect(row?.accountedBytes).toBe(BigInt(200 * MB));
    expect(row?.sizeMeasuredAt?.toISOString()).toBe(NOW.toISOString());
    expect(row?.quotaBlocked).toBe(false);
    expect(result.measured).toBeGreaterThanOrEqual(1);
  });

  it("une réserve de démarrage est remplacée par la taille réelle (écart négatif libéré)", async () => {
    const { driver, usage, deps } = setup();
    const w = await ws({ accountedBytes: BigInt(64 * MB) });
    driver.sizes.set(w.volumeName, 5 * MB);
    await runCodeSweep(deps);
    expect(usage.calls).toEqual([{ orgId: w.organizationId, delta: -59 * MB }]);
    expect((await reload(w.id))?.accountedBytes).toBe(BigInt(5 * MB));
  });

  it("aucun appel au site quand rien n'a changé, mais la mesure est notée", async () => {
    const { driver, usage, deps } = setup();
    const w = await ws({ accountedBytes: BigInt(10 * MB) });
    driver.sizes.set(w.volumeName, 10 * MB);
    await runCodeSweep(deps);
    expect(usage.calls).toEqual([]);
    expect((await reload(w.id))?.sizeMeasuredAt).not.toBeNull();
  });

  it("un environnement arrêté n'est mesuré qu'une fois après son arrêt", async () => {
    const { driver, usage, deps } = setup();
    const w = await ws({
      desiredStatus: "stopped",
      lastActivityAt: minutesAgo(200),
      lastStoppedAt: minutesAgo(100),
      sizeMeasuredAt: minutesAgo(300),
      accountedBytes: BigInt(1 * MB),
    });
    driver.sizes.set(w.volumeName, 3 * MB);
    await runCodeSweep(deps);
    expect(driver.measured).toContain(w.volumeName);
    expect(usage.calls.at(-1)).toEqual({
      orgId: w.organizationId,
      delta: 2 * MB,
    });
    driver.measured.length = 0;
    await runCodeSweep(deps);
    expect(driver.measured).not.toContain(w.volumeName);
  });

  it("dépassement du quota : l'environnement est bloqué et arrêté", async () => {
    const { driver, usage, deps } = setup();
    const w = await ws({ accountedBytes: BigInt(1 * MB) });
    driver.sizes.set(w.volumeName, 900 * MB);
    usage.over.add(w.organizationId);
    const result = await runCodeSweep(deps);
    const row = await reload(w.id);
    expect(row?.quotaBlocked).toBe(true);
    expect(row?.accountedBytes).toBe(BigInt(900 * MB));
    expect(row?.desiredStatus).toBe("stopped");
    expect(driver.stopped).toContain(w.containerName);
    expect(result.blocked).toBe(1);
  });

  it("le site injoignable ou la mesure en échec ne bloquent pas les autres et ne changent rien", async () => {
    const { driver, usage, deps } = setup();
    const bad = await ws({ accountedBytes: BigInt(1 * MB) });
    const unmeasurable = await ws({ accountedBytes: BigInt(1 * MB) });
    const good = await ws({ accountedBytes: BigInt(1 * MB) });
    driver.sizes.set(bad.volumeName, 9 * MB);
    driver.sizes.set(good.volumeName, 7 * MB);
    driver.failMeasure.add(unmeasurable.volumeName);
    usage.fail.add(bad.organizationId);
    const result = await runCodeSweep(deps);
    expect((await reload(bad.id))?.accountedBytes).toBe(BigInt(1 * MB));
    expect((await reload(unmeasurable.id))?.accountedBytes).toBe(
      BigInt(1 * MB),
    );
    expect((await reload(good.id))?.accountedBytes).toBe(BigInt(7 * MB));
    expect(result.failed).toBeGreaterThanOrEqual(2);
  });

  it("ne remplace pas une valeur changée entre-temps par le service (démarrage simultané)", async () => {
    const { driver, usage, deps } = setup();
    const w = await ws({ accountedBytes: BigInt(1 * MB) });
    driver.sizes.set(w.volumeName, 50 * MB);
    usage.onCall = async () => {
      await t.db
        .update(codeWorkspaces)
        .set({ accountedBytes: BigInt(64 * MB) })
        .where(eq(codeWorkspaces.id, w.id));
    };
    await runCodeSweep(deps);
    expect((await reload(w.id))?.accountedBytes).toBe(BigInt(64 * MB));
  });
});

describe("enregistrement et planification", () => {
  it("le type code.sweep est enregistré dans le registre", () => {
    const registry = new HandlerRegistry();
    registerCodeHandlers(registry, setup().deps);
    expect(registry.types()).toContain("code.sweep");
  });

  it("le planificateur déclare code.sweep toutes les 5 minutes, seulement si l'hébergement est configuré", async () => {
    const tick = (iso: string, enabled: boolean) =>
      tickScheduler({
        db: t.db,
        log: silent,
        now: () => new Date(iso),
        codeSweep: enabled,
      });
    await tick("2026-10-27T14:00:00Z", false);
    expect(
      (await t.db.select().from(jobs)).filter((j) => j.type === "code.sweep"),
    ).toHaveLength(0);
    await tick("2026-10-27T14:00:00Z", true);
    await tick("2026-10-27T14:02:00Z", true); // même tranche de 5 minutes
    await tick("2026-10-27T14:06:00Z", true); // tranche suivante
    const sweeps = (await t.db.select().from(jobs)).filter(
      (j) => j.type === "code.sweep",
    );
    expect(sweeps).toHaveLength(2);
    expect(new Set(sweeps.map((j) => j.idempotencyKey)).size).toBe(2);
  });
});

describe("client du site (usageClientFromEnv)", () => {
  it("absent sans adresse ou sans jeton assez long", () => {
    expect(usageClientFromEnv({})).toBeNull();
    expect(
      usageClientFromEnv({
        NEXORA_APP_INTERNAL_URL: "http://localhost:3500",
        NEXORA_APP_ADMIN_TOKEN: "court",
      }),
    ).toBeNull();
  });

  it("appelle /api/admin/code/usage avec le jeton, jamais de suivi de redirection", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return Response.json({ ok: true, overQuota: true });
    }) as unknown as typeof fetch;
    const client = usageClientFromEnv(
      {
        NEXORA_APP_INTERNAL_URL: "http://localhost:3500/",
        NEXORA_APP_ADMIN_TOKEN: "j".repeat(40),
      },
      fakeFetch,
    );
    expect(await client?.apply("org_1", 42)).toEqual({ overQuota: true });
    expect(seen[0]?.url).toBe("http://localhost:3500/api/admin/code/usage");
    const init = seen[0]?.init;
    expect(
      ((init?.headers ?? {}) as Record<string, string>).authorization,
    ).toBe(`Bearer ${"j".repeat(40)}`);
    expect(init?.redirect).toBe("error");
    expect(JSON.parse(String(init?.body))).toEqual({
      organizationId: "org_1",
      deltaBytes: 42,
    });
  });

  it("une réponse en erreur est une erreur (le tour suivant réessaiera)", async () => {
    const client = usageClientFromEnv(
      {
        NEXORA_APP_INTERNAL_URL: "http://localhost:3500",
        NEXORA_APP_ADMIN_TOKEN: "j".repeat(40),
      },
      (async () =>
        new Response("{}", { status: 503 })) as unknown as typeof fetch,
    );
    await expect(client?.apply("org_1", 1)).rejects.toThrow(/503/);
  });
});
