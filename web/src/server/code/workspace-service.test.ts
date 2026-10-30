import { randomBytes } from "node:crypto";
import {
  type CodeHostingConfig,
  type WorkspaceDriver,
  WorkspaceDriverError,
  type WorkspaceRuntimeState,
  type WorkspaceSpec,
} from "@nexora/code";
import { apiKeys, codeWorkspaces, eq, storageUsage, users } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordStorageUsageIn, setExtraStorage } from "../billing/entitlements";
import { authenticateApiKey, revokeApiKey } from "../gateway/keys";
import { newOrganization } from "../gateway/test-support";
import { normalizeWorkspace } from "../products/code-workspace";
import { loadKeyring } from "../vault/crypto";
import { readSecret } from "../vault/store";
import {
  createWorkspaceService,
  RESERVE_BYTES,
  type WorkspaceServiceDeps,
} from "./workspace-service";

let t: TestDatabase;
const keyring = loadKeyring({
  NEXORA_VAULT_MASTER_KEY: randomBytes(32).toString("base64"),
});
const MB = 1_000_000;

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

/** Faux pilote en mémoire : il enregistre les appels et laisse le test choisir l'état d'exécution. */
class FakeDriver implements WorkspaceDriver {
  calls: string[] = [];
  specs: WorkspaceSpec[] = [];
  runtime = new Map<string, WorkspaceRuntimeState>();
  failOn: "create" | "start" | null = null;
  async create(spec: WorkspaceSpec) {
    this.calls.push(`create:${spec.containerName}`);
    if (this.failOn === "create")
      throw new WorkspaceDriverError("docker_failed", "boum");
    this.specs.push(spec);
    this.runtime.set(spec.containerName, {
      status: "created",
      health: "none",
      exitCode: null,
    });
  }
  async start(name: string) {
    this.calls.push(`start:${name}`);
    if (this.failOn === "start")
      throw new WorkspaceDriverError("docker_failed", "boum");
    this.runtime.set(name, {
      status: "running",
      health: "starting",
      exitCode: null,
    });
  }
  async stop(name: string) {
    this.calls.push(`stop:${name}`);
    this.runtime.set(name, { status: "exited", health: "none", exitCode: 0 });
  }
  async remove(i: {
    containerName: string;
    volumeName: string;
    removeVolume: boolean;
  }) {
    this.calls.push(
      `remove:${i.containerName}:${i.removeVolume ? "volume" : "keep"}`,
    );
    this.runtime.delete(i.containerName);
  }
  async state(name: string): Promise<WorkspaceRuntimeState> {
    return (
      this.runtime.get(name) ?? {
        status: "missing",
        health: "none",
        exitCode: null,
      }
    );
  }
  async volumeBytes() {
    return 5 * MB;
  }
  set(name: string, s: Partial<WorkspaceRuntimeState>) {
    this.runtime.set(name, {
      status: "running",
      health: "none",
      exitCode: null,
      ...s,
    });
  }
}

const config: CodeHostingConfig = {
  mode: "docker",
  image: "nexora/code-workspace:local",
  gatewayUrl: "http://localhost:3722/v1",
  limits: { cpus: "1.0", memory: "2g", pids: 512, tmpSize: "256m" },
  portMin: 20_500,
  portMax: 20_520,
  upstreamHost: "127.0.0.1",
  dockerHost: null,
  dockerBin: "docker",
  defaultModel: "nexora/test-model",
  idleMinutes: 30,
};

let seq = 0;
async function person(extraBytes = 500 * MB) {
  seq += 1;
  const orgId = await newOrganization(t.db);
  const userId = `usr_ws_${seq}_${randomBytes(3).toString("hex")}`;
  await t.db
    .insert(users)
    .values({ id: userId, name: "Marie", email: `${userId}@example.com` });
  // Pas d'offre dans l'essai : l'espace vient des Go supplémentaires.
  await setExtraStorage(t.db, orgId, extraBytes);
  return { orgId, userId };
}

function setup(over: Partial<WorkspaceServiceDeps> = {}) {
  const driver = new FakeDriver();
  const deps: WorkspaceServiceDeps = {
    db: () => t.db,
    keyring: () => keyring,
    driver,
    config,
    siteUrl: "http://localhost:3722",
    now: () => new Date(),
    log: createLogger({ name: "test", sink: () => {} }),
    record: (orgId, delta) => recordStorageUsageIn(t.db, orgId, "code", delta),
    installCommand: null,
    ...over,
  };
  return { driver, service: createWorkspaceService(deps), deps };
}

const used = async (orgId: string) => {
  const [row] = await t.db
    .select()
    .from(storageUsage)
    .where(eq(storageUsage.organizationId, orgId));
  return Number(row?.usedBytes ?? 0n);
};

describe("état", () => {
  it("sans environnement : arrêté, rien d'occupé, rien à ouvrir", async () => {
    const { service } = setup();
    const p = await person();
    expect(await service.getState(p)).toEqual({
      status: "stopped",
      usedBytes: 0,
      openUrl: null,
    });
  });
});

describe("démarrage", () => {
  it("crée l'environnement : conteneur durci, clé dédiée, mot de passe au coffre, espace réservé", async () => {
    const { service, driver } = setup();
    const p = await person();
    const result = await service.start(p);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.status).toBe("starting");

    const [row] = await t.db
      .select()
      .from(codeWorkspaces)
      .where(eq(codeWorkspaces.userId, p.userId));
    expect(row).toBeDefined();
    if (!row) return;
    expect(row.organizationId).toBe(p.orgId);
    expect(row.desiredStatus).toBe("running");
    expect(row.port).toBeGreaterThanOrEqual(20_500);
    expect(row.port).toBeLessThanOrEqual(20_520);
    expect(row.containerName).toMatch(/^nexora-code-[0-9a-f]{12}$/);
    expect(row.proxyId).toMatch(/^[0-9a-f]{32}$/);
    expect(driver.calls).toEqual([
      `create:${row.containerName}`,
      `start:${row.containerName}`,
    ]);

    const spec = driver.specs[0];
    expect(spec?.publicEnv.NEXORA_API_URL).toBe("http://localhost:3722/v1");
    expect(spec?.publicEnv.NEXORA_CODE_MODEL).toBe("nexora/test-model");
    expect(spec?.hostPort).toBe(row.port);
    const key = spec?.secretEnv.NEXORA_API_KEY ?? "";
    const password = spec?.secretEnv.NEXORA_CODE_PASSWORD ?? "";
    expect(key).toMatch(/^nxk_/);
    expect(password.length).toBeGreaterThanOrEqual(32);

    // clé dédiée, nommée, de l'organisation, valide ; mot de passe au coffre et nulle part en clair
    const auth = await authenticateApiKey(t.db, `Bearer ${key}`);
    expect(auth.ok && auth.key.name).toBe(
      "Nexora Code (environnement hébergé)",
    );
    expect(auth.ok && auth.key.organizationId).toBe(p.orgId);
    expect(auth.ok && auth.key.createdBy).toBe(p.userId);
    expect(row.apiKeyId).toBe(auth.ok ? auth.key.id : null);
    expect(
      await readSecret(t.db, keyring, `code-workspace-password.${row.id}`),
    ).toBe(password);
    const dump = JSON.stringify(row, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    expect(dump).not.toContain(password);
    expect(dump).not.toContain(key);

    // espace réservé et compté au produit « code »
    expect(row.accountedBytes).toBe(BigInt(RESERVE_BYTES));
    expect(await used(p.orgId)).toBe(RESERVE_BYTES);
  });

  it("est idempotent : un second appel ne recrée ni conteneur ni clé", async () => {
    const { service, driver } = setup();
    const p = await person();
    await service.start(p);
    const before = driver.calls.length;
    const again = await service.start(p);
    expect(again.ok).toBe(true);
    expect(driver.calls.length).toBe(before); // déjà en marche : aucun appel au pilote
    expect(driver.calls.filter((c) => c.startsWith("create:"))).toHaveLength(1);
    expect(
      await t.db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.organizationId, p.orgId)),
    ).toHaveLength(1);
  });

  it("deux démarrages simultanés ne créent qu'un environnement", async () => {
    const { service, driver } = setup();
    const p = await person();
    const [a, b] = await Promise.all([service.start(p), service.start(p)]);
    expect(a.ok && b.ok).toBe(true);
    expect(driver.calls.filter((c) => c.startsWith("create:"))).toHaveLength(1);
    expect(
      await t.db
        .select()
        .from(codeWorkspaces)
        .where(eq(codeWorkspaces.userId, p.userId)),
    ).toHaveLength(1);
  });

  it("refuse sans espace : quota_exceeded, et rien n'est créé (ni ligne, ni clé, ni conteneur)", async () => {
    const { service, driver } = setup();
    const p = await person(1 * MB); // moins que la réserve
    const result = await service.start(p);
    expect(result).toEqual({ ok: false, reason: "quota_exceeded" });
    expect(driver.calls).toEqual([]);
    expect(
      await t.db
        .select()
        .from(codeWorkspaces)
        .where(eq(codeWorkspaces.userId, p.userId)),
    ).toHaveLength(0);
    expect(
      await t.db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.organizationId, p.orgId)),
    ).toHaveLength(0);
    expect(await used(p.orgId)).toBe(0);
  });

  it("un environnement existant dont l'organisation dépasse son espace ne démarre pas", async () => {
    const { service, driver } = setup();
    const p = await person(200 * MB);
    await service.start(p);
    await service.stop(p);
    // l'organisation remplit tout son espace ailleurs
    await recordStorageUsageIn(t.db, p.orgId, "rag", 200 * MB - RESERVE_BYTES);
    driver.calls.length = 0;
    expect(await service.start(p)).toEqual({
      ok: false,
      reason: "quota_exceeded",
    });
    expect(driver.calls).toEqual([]);
  });

  it("un échec du pilote est « unavailable », nettoie la clé et l'espace réservé", async () => {
    const { service, driver } = setup();
    const p = await person();
    driver.failOn = "create";
    expect(await service.start(p)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    const keys = await t.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.organizationId, p.orgId));
    expect(keys.every((k) => k.revokedAt !== null)).toBe(true);
    expect(await used(p.orgId)).toBe(0);
    const [row] = await t.db
      .select()
      .from(codeWorkspaces)
      .where(eq(codeWorkspaces.userId, p.userId));
    expect(row?.lastError).toBe("docker_failed");
    expect(row?.desiredStatus).toBe("stopped");
    // et la personne peut réessayer
    driver.failOn = null;
    expect((await service.start(p)).ok).toBe(true);
  });

  it("deux personnes ont deux environnements isolés (ports, mots de passe, clés distincts)", async () => {
    const { service, driver } = setup();
    const a = await person();
    const b = await person();
    await service.start(a);
    await service.start(b);
    const [sa, sb] = driver.specs;
    expect(sa?.containerName).not.toBe(sb?.containerName);
    expect(sa?.hostPort).not.toBe(sb?.hostPort);
    expect(sa?.secretEnv.NEXORA_CODE_PASSWORD).not.toBe(
      sb?.secretEnv.NEXORA_CODE_PASSWORD,
    );
    expect(sa?.secretEnv.NEXORA_API_KEY).not.toBe(sb?.secretEnv.NEXORA_API_KEY);
    // le même identifiant d'organisation avec une autre personne ne voit pas l'environnement de la première
    expect(
      (await service.getState({ orgId: a.orgId, userId: b.userId })).status,
    ).toBe("stopped");
  });

  it("si la personne révoque la clé de l'environnement, le démarrage suivant recrée le conteneur avec une clé neuve", async () => {
    const { service, driver } = setup();
    const p = await person();
    await service.start(p);
    const [row] = await t.db
      .select()
      .from(codeWorkspaces)
      .where(eq(codeWorkspaces.userId, p.userId));
    await service.stop(p);
    await revokeApiKey(t.db, p.orgId, row?.apiKeyId as string);
    driver.calls.length = 0;
    expect((await service.start(p)).ok).toBe(true);
    expect(driver.calls[0]).toBe(`remove:${row?.containerName}:keep`);
    expect(driver.calls[1]).toBe(`create:${row?.containerName}`);
    const fresh =
      driver.specs[driver.specs.length - 1]?.secretEnv.NEXORA_API_KEY ?? "";
    expect((await authenticateApiKey(t.db, `Bearer ${fresh}`)).ok).toBe(true);
    // le mot de passe, lui, ne change pas (le volume et l'adresse restent)
    expect(driver.specs[0]?.secretEnv.NEXORA_CODE_PASSWORD).toBe(
      driver.specs[driver.specs.length - 1]?.secretEnv.NEXORA_CODE_PASSWORD,
    );
  });

  it("choisit un port libre dans la plage et échoue proprement si elle est pleine", async () => {
    const { service } = setup({
      config: { ...config, portMin: 20_600, portMax: 20_601 },
    });
    const ok1 = await service.start(await person());
    const ok2 = await service.start(await person());
    const full = await service.start(await person());
    expect([ok1.ok, ok2.ok]).toEqual([true, true]);
    expect(full).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("état selon le conteneur", () => {
  async function started() {
    const ctx = setup();
    const p = await person();
    await ctx.service.start(p);
    const [row] = await t.db
      .select()
      .from(codeWorkspaces)
      .where(eq(codeWorkspaces.userId, p.userId));
    return { ...ctx, p, name: row?.containerName as string, row };
  }

  it("en marche mais pas encore sain : en démarrage, sans adresse", async () => {
    const { service, driver, p, name } = await started();
    driver.set(name, { health: "starting" });
    expect(await service.getState(p)).toMatchObject({
      status: "starting",
      openUrl: null,
    });
  });

  it("sain (ou sans sonde) : prêt, avec l'adresse du mandataire, acceptée par le panneau", async () => {
    const { service, driver, p, name, row } = await started();
    for (const health of ["healthy", "none"] as const) {
      driver.set(name, { health });
      const state = await service.getState(p);
      expect(state.status).toBe("ready");
      expect(state.openUrl).toBe(
        `http://localhost:3722/code/ws/${row?.proxyId}/`,
      );
      expect(state.usedBytes).toBe(RESERVE_BYTES);
      expect(normalizeWorkspace(state).status).toBe("ready"); // http://localhost est admis par le panneau
    }
  });

  it("avec une origine dédiée, l'adresse d'ouverture est celle qui y envoie la personne", async () => {
    const { service, driver } = setup({
      openUrl: () => "http://localhost:3722/api/account/code/open",
    });
    const p = await person();
    await service.start(p);
    const [row] = await t.db
      .select()
      .from(codeWorkspaces)
      .where(eq(codeWorkspaces.userId, p.userId));
    driver.set(row?.containerName as string, { health: "healthy" });
    const state = await service.getState(p);
    expect(state.status).toBe("ready");
    expect(state.openUrl).toBe("http://localhost:3722/api/account/code/open");
  });

  it("non sain, ou arrêté alors qu'il devait tourner : erreur", async () => {
    const { service, driver, p, name } = await started();
    driver.set(name, { health: "unhealthy" });
    expect((await service.getState(p)).status).toBe("error");
    driver.set(name, { status: "exited", exitCode: 137 });
    expect((await service.getState(p)).status).toBe("error");
    driver.runtime.delete(name);
    expect((await service.getState(p)).status).toBe("error");
  });

  it("un pilote qui ne répond pas donne « erreur », pas une exception", async () => {
    const { service, driver, p } = await started();
    driver.state = async () => {
      throw new WorkspaceDriverError("docker_unreachable", "x");
    };
    expect((await service.getState(p)).status).toBe("error");
  });
});

describe("arrêt et suppression", () => {
  it("l'arrêt demandé donne l'état « arrêté » (et non « erreur »)", async () => {
    const { service, driver } = setup();
    const p = await person();
    await service.start(p);
    await service.stop(p);
    expect(driver.calls.some((c) => c.startsWith("stop:"))).toBe(true);
    expect((await service.getState(p)).status).toBe("stopped");
    const [row] = await t.db
      .select()
      .from(codeWorkspaces)
      .where(eq(codeWorkspaces.userId, p.userId));
    expect(row?.desiredStatus).toBe("stopped");
    expect(row?.lastStoppedAt).not.toBeNull();
  });

  it("la suppression libère l'espace, révoque la clé et le secret, retire conteneur et volume", async () => {
    const { service, driver } = setup();
    const p = await person();
    await service.start(p);
    const [row] = await t.db
      .select()
      .from(codeWorkspaces)
      .where(eq(codeWorkspaces.userId, p.userId));
    await service.remove(p);
    expect(driver.calls).toContain(`remove:${row?.containerName}:volume`);
    expect(
      await t.db
        .select()
        .from(codeWorkspaces)
        .where(eq(codeWorkspaces.userId, p.userId)),
    ).toHaveLength(0);
    expect(await used(p.orgId)).toBe(0);
    const [key] = await t.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, row?.apiKeyId as string));
    expect(key?.revokedAt).not.toBeNull();
    await expect(
      readSecret(t.db, keyring, `code-workspace-password.${row?.id}`),
    ).rejects.toThrow(/révoqué/);
    expect((await service.getState(p)).status).toBe("stopped");
  });

  it("une suppression sans environnement ne fait rien", async () => {
    const { service } = setup();
    const p = await person();
    await expect(service.remove(p)).resolves.toBeUndefined();
  });
});

describe("interface du panneau", () => {
  it("cli() : commande de connexion, installation selon la configuration", () => {
    expect(setup().service.cli()).toEqual({
      installCommand: null,
      loginCommand: "nexora-code login",
    });
    expect(
      setup({
        installCommand: "curl -fsSL https://nexora.example/install | sh",
      }).service.cli().installCommand,
    ).toContain("curl");
  });
});
