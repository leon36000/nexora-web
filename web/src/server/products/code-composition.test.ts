import { randomBytes } from "node:crypto";
import {
  type CodeHostingConfig,
  DockerWorkspaceDriver,
  dryRunDockerClient,
} from "@nexora/code";
import { users } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { recordStorageUsageIn, setExtraStorage } from "../billing/entitlements";
import { createWorkspaceService } from "../code/workspace-service";
import { newOrganization } from "../gateway/test-support";
import { loadKeyring } from "../vault/crypto";
import { loadCodeWorkspacePanel } from "./code-workspace";
import { handleCodeWorkspace, type PanelServicesDeps } from "./panel-handlers";
import { getCodeWorkspaceService } from "./services";

/**
 * Composition du panneau (chantier D) avec le VRAI service de l'environnement hébergé (chantier F) : base jetable,
 * pilote Docker en « essai à blanc » (aucun conteneur lancé).
 */
let t: TestDatabase;
const SITE = "http://localhost:3722";
const MB = 1_000_000;
let clock = Date.now();
const printed: string[] = [];

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const config: CodeHostingConfig = {
  mode: "docker-dry-run",
  image: "nexora/code-workspace:local",
  gatewayUrl: `${SITE}/v1`,
  limits: { cpus: "1.0", memory: "2g", pids: 512, tmpSize: "256m" },
  portMin: 21_000,
  portMax: 21_100,
  upstreamHost: "127.0.0.1",
  dockerHost: null,
  dockerBin: "docker",
  defaultModel: null,
  idleMinutes: 30,
};

function build() {
  const driver = new DockerWorkspaceDriver(
    dryRunDockerClient({
      print: (l) => printed.push(l),
      now: () => clock,
      healthyAfterMs: 2000,
    }),
  );
  return createWorkspaceService({
    db: () => t.db,
    keyring: () => loadKeyring({ NEXORA_VAULT_MASTER_KEY: KEY }),
    driver,
    config,
    siteUrl: SITE,
    now: () => new Date(clock),
    log: createLogger({ name: "test", sink: () => {} }),
    record: (org, delta) => recordStorageUsageIn(t.db, org, "code", delta),
    installCommand: null,
  });
}
const KEY = randomBytes(32).toString("base64");

async function person(extra: number) {
  const orgId = await newOrganization(t.db);
  const userId = `usr_comp_${randomBytes(4).toString("hex")}`;
  await t.db
    .insert(users)
    .values({ id: userId, name: "M", email: `${userId}@example.com` });
  await setExtraStorage(t.db, orgId, extra);
  return { orgId, userId };
}

function routeDeps(
  service: ReturnType<typeof build>,
  p: { orgId: string; userId: string } | null,
  enabled = true,
): PanelServicesDeps {
  return {
    siteUrl: SITE,
    getContext: async () =>
      p
        ? { userId: p.userId, organizationId: p.orgId, role: "owner" as const }
        : null,
    rateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
    log: createLogger({ name: "test", sink: () => {} }),
    codeEnabled: () => enabled,
    code: () => service,
  };
}
const req = (method: string) =>
  new Request(`${SITE}/api/account/code/workspace`, {
    method,
    headers: { origin: SITE },
  });

describe("panneau + service réel (essai à blanc)", () => {
  it("arrêté → démarrage (202) → en démarrage → prêt avec l'adresse d'ouverture", async () => {
    const service = build();
    const p = await person(500 * MB);
    const deps = routeDeps(service, p);

    const first = await (await handleCodeWorkspace(req("GET"), deps)).json();
    expect(first).toEqual({ status: "stopped", usedBytes: 0, openUrl: null });

    const started = await handleCodeWorkspace(req("POST"), deps);
    expect(started.status).toBe(202);
    expect((await started.json()).status).toBe("starting");
    expect(
      printed.some((l) => l.includes("docker create --name nexora-code-")),
    ).toBe(true);
    expect(printed.some((l) => l.includes("docker start nexora-code-"))).toBe(
      true,
    );
    expect(printed.join("\n")).not.toContain("nxk_");

    expect(
      (await (await handleCodeWorkspace(req("GET"), deps)).json()).status,
    ).toBe("starting");
    clock += 2500;
    const ready = await (await handleCodeWorkspace(req("GET"), deps)).json();
    expect(ready.status).toBe("ready");
    expect(ready.openUrl).toMatch(
      /^http:\/\/localhost:3722\/code\/ws\/[0-9a-f]{32}\/$/,
    );
    expect(ready.usedBytes).toBeGreaterThan(0);

    // la page du panneau reçoit le même état, avec la commande de connexion
    const model = await loadCodeWorkspacePanel({
      enabled: true,
      service,
      ...p,
    });
    expect(model).toMatchObject({
      kind: "ready",
      workspace: { status: "ready" },
      cli: { loginCommand: "nexora-code login" },
    });
  });

  it("sans espace : 402 quota_exceeded, rien n'a été lancé", async () => {
    const service = build();
    const p = await person(0);
    printed.length = 0;
    const res = await handleCodeWorkspace(req("POST"), routeDeps(service, p));
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: "quota_exceeded" });
    expect(printed).toEqual([]);
  });

  it("sans session : 401 ; interrupteur éteint : 404", async () => {
    const service = build();
    expect(
      (await handleCodeWorkspace(req("GET"), routeDeps(service, null))).status,
    ).toBe(401);
    const p = await person(500 * MB);
    expect(
      (await handleCodeWorkspace(req("GET"), routeDeps(service, p, false)))
        .status,
    ).toBe(404);
  });
});

describe("getCodeWorkspaceService (branchement derrière l'interrupteur)", () => {
  it("éteint : aucun service", () => {
    vi.stubEnv("NEXORA_PRODUCT_CODE", "");
    vi.stubEnv("NEXORA_CODE_DRIVER", "docker-dry-run");
    vi.stubEnv("NEXORA_CODE_IMAGE", "nexora/code-workspace:local");
    expect(getCodeWorkspaceService()).toBeNull();
  });

  it("allumé sans pilote configuré : aucun service (la page dit « indisponible »)", () => {
    vi.stubEnv("NEXORA_PRODUCT_CODE", "1");
    vi.stubEnv("NEXORA_CODE_DRIVER", "");
    expect(getCodeWorkspaceService()).toBeNull();
  });

  it("allumé avec un pilote valide : le service réel", () => {
    vi.stubEnv("NEXORA_PRODUCT_CODE", "1");
    vi.stubEnv("NEXORA_CODE_DRIVER", "docker-dry-run");
    vi.stubEnv("NEXORA_CODE_IMAGE", "nexora/code-workspace:local");
    const service = getCodeWorkspaceService();
    expect(service).not.toBeNull();
    expect(service?.cli().loginCommand).toBe("nexora-code login");
  });

  it("allumé avec des réglages invalides : aucun service", () => {
    vi.stubEnv("NEXORA_PRODUCT_CODE", "1");
    vi.stubEnv("NEXORA_CODE_DRIVER", "docker");
    vi.stubEnv("NEXORA_CODE_IMAGE", "--privileged");
    expect(getCodeWorkspaceService()).toBeNull();
  });
});
