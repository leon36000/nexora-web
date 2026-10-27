import { eq, jobs, osTemplates, proxmoxServers } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { checkOutboundUrl } from "@nexora/net";
import { CLOUD_IMAGES, runSetup } from "@nexora/vps";
import { ProxmoxSimulator } from "@nexora/vps/simulator";
import { createSimRunner, engineDeps, SIM_TOKEN } from "@nexora/vps/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleVpsAdmin, type VpsAdminDeps } from "./admin-handlers";

const ADMIN = "a".repeat(40);
const [DEBIAN] = CLOUD_IMAGES;
const SUM = "d".repeat(128);
let t: TestDatabase;
let sim: ProxmoxSimulator;
let simPort = 0;
let stop: () => Promise<void>;
let token = SIM_TOKEN;
const silent = { debug() {}, info() {}, warn() {}, error() {} } as never;

const FAKE_PROBE = {
  fingerprint: "ab".repeat(32),
  fingerprintDisplay: "AB:".repeat(31) + "AB",
  subject: "CN=pve1",
  issuer: "CN=Proxmox Virtual Environment",
  validFrom: "2026-01-01T00:00:00.000Z",
  validTo: "2036-01-01T00:00:00.000Z",
  expired: false,
  selfSigned: false,
  trusted: false,
  hostnameMatches: true,
};
const probed: { host: string; port: number }[] = [];

function deps(over: Partial<VpsAdminDeps> = {}): VpsAdminDeps {
  return {
    db: () => t.db,
    adminToken: ADMIN,
    getSecret: async (ref) => {
      if (!ref.startsWith("proxmox.")) throw new Error("absent");
      return token;
    },
    stripe: async () => ({}) as never,
    log: silent,
    now: () => new Date(),
    env: { NODE_ENV: "development" },
    // Les noms de domaine d'essai se résolvent en une adresse publique fictive (pas de DNS réel).
    outbound: (raw) =>
      checkOutboundUrl(
        raw,
        { allowInternal: true, allow: [] },
        { resolve: async () => ["93.184.216.34"] },
      ),
    probe: async (o) => {
      probed.push({ host: o.host, port: o.port });
      return FAKE_PROBE;
    },
    ...over,
  };
}
async function call(
  method: string,
  path: string,
  body?: unknown,
  over: Partial<VpsAdminDeps> = {},
  auth: string | null = ADMIN,
) {
  const res = await handleVpsAdmin(
    new Request(`http://localhost/api/admin/vps/${path}`, {
      method,
      headers: {
        ...(auth ? { authorization: `Bearer ${auth}` } : {}),
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    path.split("/").filter(Boolean),
    deps(over),
  );
  return {
    status: res.status,
    body: (await res.json()) as Record<string, any>,
  };
}

beforeAll(async () => {
  t = await createTestDatabase();
  sim = new ProxmoxSimulator({
    token: SIM_TOKEN,
    templates: [],
    taskPolls: 2,
    storages: [
      { storage: "local", type: "dir", content: "iso,vztmpl,backup,import" },
      { storage: "local-lvm", type: "lvmthin", content: "images,rootdir" },
    ],
    remoteFiles: {
      [DEBIAN?.imageUrl as string]: { sha512: SUM, size: 3 * 1024 ** 3 },
    },
  });
  const s = await sim.start();
  simPort = s.port;
  stop = s.close;
});
afterAll(async () => {
  await stop();
  await t.drop();
});

const NETWORK = {
  ranges: [{ from: "192.168.1.100", to: "192.168.1.120" }],
  prefix: 24,
  gateway: "192.168.1.1",
  dns: ["192.168.1.1"],
  bridge: "vmbr0",
};
const PLAN = {
  name: "Serveur de Québec",
  node: "pve1",
  region: "quebec",
  vmStorage: "local-lvm",
  importStorage: "local",
  pool: null,
  capacity: { vcpu: 16, ramMb: 65_536, diskGb: 1_000 },
  network: NETWORK,
  templates: ["debian-12-ci"],
};
let serverId = "";

describe("premier contact : empreinte du certificat", () => {
  it("exige l'authentification", async () => {
    expect(
      (
        await call(
          "POST",
          "connect/probe",
          { address: "pve.exemple.ca" },
          {},
          null,
        )
      ).status,
    ).toBe(401);
  });

  it("montre l'empreinte, le port par défaut et un code proposé, sans envoyer de jeton", async () => {
    const r = await call("POST", "connect/probe", {
      address: "pve.exemple.ca",
    });
    expect(r.status).toBe(200);
    expect(probed.at(-1)).toEqual({ host: "pve.exemple.ca", port: 8006 });
    expect(r.body).toMatchObject({
      address: { host: "pve.exemple.ca", port: 8006 },
      code: "pve-exemple-ca",
      tls: { fingerprint: FAKE_PROBE.fingerprint },
      recommendation: "pinned",
    });
  });

  it("recommande la vérification classique quand le certificat est reconnu", async () => {
    const r = await call(
      "POST",
      "connect/probe",
      { address: "pve.exemple.ca:8443" },
      { probe: async () => ({ ...FAKE_PROBE, trusted: true }) },
    );
    expect(r.body.recommendation).toBe("verify");
    expect(r.body.address.port).toBe(8443);
  });

  it("refuse une adresse mal formée, le schéma http hors boucle locale et les cibles interdites (SSRF)", async () => {
    for (const address of ["", "http://pve.exemple.ca", "pve exemple"]) {
      const r = await call("POST", "connect/probe", { address });
      expect(r.status, address).toBe(422);
    }
    for (const address of ["169.254.169.254", "0.0.0.0"]) {
      const before = probed.length;
      const r = await call("POST", "connect/probe", { address });
      expect(r.status, address).toBe(422);
      expect(r.body.error).toBe("url_blocked");
      expect(probed.length).toBe(before);
    }
  });

  it("dit pourquoi le serveur est injoignable, en français, avec l'action", async () => {
    const r = await call(
      "POST",
      "connect/probe",
      { address: "pve.exemple.ca" },
      {
        probe: async () => {
          const { TlsProbeError } = await import("@nexora/vps");
          throw new TlsProbeError(
            "network",
            "serveur injoignable (ECONNREFUSED)",
          );
        },
      },
    );
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ error: "probe_failed", kind: "network" });
    expect(r.body.action).toMatch(/8006|pare-feu/);
  });
});

describe("« Connecter » : fiche créée, serveur découvert", () => {
  it("crée la fiche en brouillon et renvoie ce que Proxmox a découvert, sans secret", async () => {
    const r = await call("POST", "connect", {
      address: `http://127.0.0.1:${simPort}`,
      code: "pve-essai",
      tlsMode: "verify",
      tokenRef: "proxmox.pve-essai",
    });
    expect(r.status).toBe(201);
    expect(r.body.created).toBe(true);
    expect(r.body.server).toMatchObject({
      code: "pve-essai",
      state: "draft",
      node: "pve1",
      pveVersion: "9.0.3",
    });
    expect(r.body.discovery).toMatchObject({
      node: "pve1",
      vmStorage: "local-lvm",
      importStorage: "local",
      bridge: "vmbr0",
    });
    expect(JSON.stringify(r.body)).not.toContain(SIM_TOKEN);
    serverId = r.body.server.id;
  });

  it("rejouer retombe sur la même fiche, sans doublon", async () => {
    const again = await call("POST", "connect", {
      address: `http://127.0.0.1:${simPort}`,
      code: "pve-essai",
      tlsMode: "verify",
      tokenRef: "proxmox.pve-essai",
    });
    expect(again.status).toBe(200);
    expect(again.body.created).toBe(false);
    expect(again.body.server.id).toBe(serverId);
    const all = await t.db.select().from(proxmoxServers);
    expect(all.filter((s) => s.code === "pve-essai")).toHaveLength(1);
  });

  it("jeton refusé par Proxmox : cause lisible et action, jamais le jeton", async () => {
    token = "nexora@pve!provision=99999999-2222-3333-4444-555555555555";
    const r = await call("POST", "connect", {
      address: `http://127.0.0.1:${simPort}`,
      code: "pve-essai-2",
      tlsMode: "verify",
      tokenRef: "proxmox.pve-essai-2",
    });
    token = SIM_TOKEN;
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ error: "connect_failed" });
    expect(r.body.cause).toMatch(/jeton/i);
    expect(r.body.action).toBeTruthy();
    expect(JSON.stringify(r.body)).not.toContain("99999999");
    expect(
      (await t.db.select().from(proxmoxServers)).some(
        (s) => s.code === "pve-essai-2",
      ),
    ).toBe(false);
  });

  it("jeton absent du Coffre : le dit, et demande de le coller", async () => {
    const r = await call(
      "POST",
      "connect",
      {
        address: `http://127.0.0.1:${simPort}`,
        code: "pve-essai-3",
        tlsMode: "verify",
        tokenRef: "proxmox.pve-essai-3",
      },
      {
        getSecret: async () => {
          throw new Error("absent");
        },
      },
    );
    expect(r.status).toBe(422);
    expect(r.body.cause).toMatch(/Coffre/);
  });

  it("refuse une référence de coffre réservée à la plateforme", async () => {
    const r = await call("POST", "connect", {
      address: `http://127.0.0.1:${simPort}`,
      code: "pve-essai-4",
      tlsMode: "verify",
      tokenRef: "stripe.secret_key",
    });
    expect(r.status).toBe(422);
    expect(r.body.error).toBe("secret_scope");
  });

  it("refuse l'épinglage sans empreinte et une cible interdite", async () => {
    const noPrint = await call("POST", "connect", {
      address: `http://127.0.0.1:${simPort}`,
      code: "pve-essai-5",
      tlsMode: "pinned",
      tokenRef: "proxmox.pve-essai-5",
    });
    expect(noPrint.status).toBe(422);
    const ssrf = await call("POST", "connect", {
      address: "169.254.169.254",
      code: "pve-essai-6",
      tlsMode: "verify",
      tokenRef: "proxmox.pve-essai-6",
    });
    expect(ssrf.body.error).toBe("url_blocked");
  });
});

describe("validation puis préparation des gabarits", () => {
  it("relit le serveur à la demande (découverte avec choix de l'opérateur)", async () => {
    const r = await call("POST", `servers/${serverId}/discover`, {
      bridge: "vmbr0",
    });
    expect(r.status).toBe(200);
    expect(r.body.discovery.bridge).toBe("vmbr0");
  });

  it("refuse un bloc d'adresses incohérent, avec les raisons", async () => {
    const r = await call("POST", `servers/${serverId}/setup`, {
      ...PLAN,
      network: { ...NETWORK, gateway: "10.9.9.9" },
    });
    expect(r.status).toBe(422);
    expect(r.body.error).toBe("invalid_network");
    expect(JSON.stringify(r.body.details)).toMatch(/passerelle/);
  });

  it("refuse un corps hors schéma (champ inconnu) et un système inconnu", async () => {
    expect(
      (await call("POST", `servers/${serverId}/setup`, { ...PLAN, x: 1 }))
        .status,
    ).toBe(422);
    expect(
      (
        await call("POST", `servers/${serverId}/setup`, {
          ...PLAN,
          templates: ["windows-95"],
        })
      ).status,
    ).toBe(422);
  });

  it("met le branchement en file : 202, étapes en attente, le serveur n'est pas prêt", async () => {
    const r = await call("POST", `servers/${serverId}/setup`, PLAN);
    expect(r.status).toBe(202);
    expect(r.body.setup.status).toBe("pending");
    expect(r.body.setup.steps.map((s: { id: string }) => s.id)).toEqual([
      "connexion",
      "image:debian-12-ci",
      "gabarit:debian-12-ci",
      "verification",
    ]);
    expect(r.body.server.state).toBe("draft");
    const again = await call("POST", `servers/${serverId}/setup`, PLAN);
    expect(again.body.setup.runId).toBe(r.body.setup.runId);
    const queued = (
      await t.db.select().from(jobs).where(eq(jobs.type, "vps.server_setup"))
    ).filter((j) => (j.payload as { serverId: string }).serverId === serverId);
    expect(queued).toHaveLength(1);
  });

  it("l'état se lit à tout moment, puis le worker rend le serveur prêt", async () => {
    const before = await call("GET", `servers/${serverId}/setup`);
    expect(before.body.setup.status).toBe("pending");
    const guest = createSimRunner(sim);
    const d = {
      ...engineDeps(t.db, guest.runner),
      fetchText: async () => `${SUM}  ${DEBIAN?.remoteName}\n`,
    };
    await runSetup(d, serverId, before.body.setup.runId);
    const after = await call("GET", `servers/${serverId}/setup`);
    expect(after.body.setup.status).toBe("succeeded");
    expect(after.body.server.state).toBe("ready");
    expect(
      (
        await t.db
          .select()
          .from(osTemplates)
          .where(eq(osTemplates.serverId, serverId))
      ).map((x) => x.state),
    ).toEqual(["ready"]);
  });
});

describe("prérequis manquants dits clairement", () => {
  it("sans le type Import : 422 prerequisites avec l'action à faire", async () => {
    const bare = new ProxmoxSimulator({ token: SIM_TOKEN, templates: [] });
    const s = await bare.start();
    try {
      const c = await call("POST", "connect", {
        address: `http://127.0.0.1:${s.port}`,
        code: "pve-neuf",
        tlsMode: "verify",
        tokenRef: "proxmox.pve-neuf",
      });
      expect(c.status).toBe(201);
      expect(
        c.body.discovery.problems.map((p: { id: string }) => p.id),
      ).toContain("import-storage");
      expect(c.body.server.lastCheckOk).toBe(false);
      const r = await call("POST", `servers/${c.body.server.id}/setup`, PLAN);
      expect(r.status).toBe(422);
      expect(r.body.error).toBe("prerequisites");
      expect(JSON.stringify(r.body.problems)).toContain("Import");
    } finally {
      await s.close();
    }
  });
});
