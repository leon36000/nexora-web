import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProxmoxClient, ProxmoxError } from "../proxmox/client.ts";
import { ProxmoxSimulator } from "../proxmox/simulator.ts";
import {
  discoverServer,
  explainProxmoxError,
  PROVISION_ROLE_PRIVILEGES,
} from "./discover.ts";

const TOKEN = "nexora@pve!provision=11111111-2222-3333-4444-555555555555";
const STORAGES = [
  { storage: "local", type: "dir", content: "iso,vztmpl,backup,import" },
  { storage: "local-lvm", type: "lvmthin", content: "images,rootdir" },
];

async function withSim<T>(
  options: Partial<ConstructorParameters<typeof ProxmoxSimulator>[0]>,
  fn: (client: ProxmoxClient, sim: ProxmoxSimulator) => Promise<T>,
): Promise<T> {
  const sim = new ProxmoxSimulator({ token: TOKEN, templates: [], ...options });
  const s = await sim.start();
  try {
    return await fn(
      new ProxmoxClient({
        host: s.host,
        port: s.port,
        protocol: "http",
        token: TOKEN,
        tls: { mode: "verify" },
        sleep: async () => {},
      }),
      sim,
    );
  } finally {
    await s.close();
  }
}

describe("découverte d'un serveur sain", () => {
  let result: Awaited<ReturnType<typeof discoverServer>>;
  beforeAll(async () => {
    result = await withSim({ storages: STORAGES }, (c) => discoverServer(c));
  });

  it("propose le nœud, la version, la capacité, les stockages et le pont sans rien demander", () => {
    expect(result.version).toBe("9.0.3");
    expect(result.versionOk).toBe(true);
    expect(result.node).toBe("pve1");
    expect(result.vmStorage).toBe("local-lvm");
    expect(result.importStorage).toBe("local");
    expect(result.bridge).toBe("vmbr0");
    expect(result.pool).toBeNull();
    expect(result.capacity.vcpu).toBe(32);
    // 85 % de la mémoire du nœud (131 072 Mo), 90 % de l'espace libre du stockage des disques.
    expect(result.capacity.ramMb).toBe(Math.floor(131_072 * 0.85));
    expect(result.capacity.diskGb).toBe(
      Math.floor((1_900_000_000_000 / 1024 ** 3) * 0.9),
    );
  });

  it("préremplit le réseau depuis le pont et le DNS du nœud", () => {
    expect(result.network).toEqual({
      prefix: 24,
      gateway: "192.168.1.1",
      dns: ["192.168.1.1"],
    });
    expect(result.bridges).toEqual([
      expect.objectContaining({ name: "vmbr0", cidr: "192.168.1.10/24" }),
    ]);
  });

  it("n'a aucun problème bloquant et confirme les droits du jeton", () => {
    expect(result.problems.filter((p) => p.severity === "blocking")).toEqual(
      [],
    );
    expect(result.privileges).toEqual({ ok: true, missing: [] });
  });

  it("indique, pour chaque stockage, à quoi il peut servir", () => {
    expect(result.storages).toEqual([
      expect.objectContaining({
        storage: "local",
        usableForImport: true,
        usableForDisks: false,
      }),
      expect.objectContaining({
        storage: "local-lvm",
        usableForImport: false,
        usableForDisks: true,
      }),
    ]);
  });
});

describe("prérequis manquants, dits clairement", () => {
  it("installation neuve : le type « Import » n'est pas activé sur local → bloquant, avec l'action et le stockage candidat", async () => {
    const d = await withSim({}, (c) => discoverServer(c));
    const p = d.problems.find((x) => x.id === "import-storage");
    expect(p).toMatchObject({ severity: "blocking" });
    expect(p?.message).toMatch(/Import/);
    expect(p?.action).toMatch(/local/);
    expect(p?.action).toMatch(/Contenu/);
    expect(d.importStorage).toBeNull();
    expect(d.importCandidate).toBe("local");
  });

  it("Proxmox 8 : version insuffisante → bloquant", async () => {
    const d = await withSim({ version: "8.4.1", storages: STORAGES }, (c) =>
      discoverServer(c),
    );
    expect(d.versionOk).toBe(false);
    expect(d.problems.find((x) => x.id === "version")).toMatchObject({
      severity: "blocking",
    });
  });

  it("aucun pont réseau → bloquant", async () => {
    const d = await withSim({ storages: STORAGES, bridges: [] }, (c) =>
      discoverServer(c),
    );
    expect(d.bridge).toBeNull();
    expect(d.problems.find((x) => x.id === "bridge")).toMatchObject({
      severity: "blocking",
    });
  });

  it("nœud demandé inexistant → bloquant, avec les nœuds disponibles", async () => {
    const d = await withSim({ storages: STORAGES }, (c) =>
      discoverServer(c, { node: "fantome" }),
    );
    const p = d.problems.find((x) => x.id === "node");
    expect(p?.severity).toBe("blocking");
    expect(p?.message).toContain("pve1");
  });

  it("droits insuffisants : liste exactement les privilèges manquants par chemin", async () => {
    const d = await withSim(
      {
        storages: STORAGES,
        acl: [
          { path: "/vms", privileges: ["VM.Audit"], propagate: true },
          {
            path: "/storage/local-lvm",
            privileges: ["Datastore.Audit"],
            propagate: true,
          },
          {
            path: "/storage/local",
            privileges: ["Datastore.Audit"],
            propagate: true,
          },
          {
            path: "/nodes/pve1",
            privileges: ["Sys.Audit"],
            propagate: true,
          },
        ],
      },
      (c) => discoverServer(c),
    );
    expect(d.privileges.ok).toBe(false);
    const flat = d.privileges.missing.map((m) => `${m.path} ${m.privilege}`);
    expect(flat).toContain("/vms VM.Allocate");
    expect(flat).toContain("/storage/local-lvm Datastore.AllocateSpace");
    expect(flat).toContain("/storage/local Datastore.AllocateTemplate");
    expect(flat).toContain("/nodes/pve1 Sys.AccessNetwork");
    expect(flat).toContain("/sdn/zones/localnetwork/vmbr0 SDN.Use");
    expect(flat).not.toContain("/vms VM.Audit");
    const p = d.problems.find((x) => x.id === "privileges");
    expect(p?.severity).toBe("blocking");
    expect(p?.action).toContain("NexoraProvision");
  });

  it("détecte le pool dédié quand les droits VM sont donnés sur /pool/<nom> seulement", async () => {
    const vmPrivs = PROVISION_ROLE_PRIVILEGES.filter((x) =>
      x.startsWith("VM."),
    );
    const d = await withSim(
      {
        storages: STORAGES,
        pools: ["nexora"],
        acl: [
          { path: "/pool/nexora", privileges: vmPrivs, propagate: true },
          {
            path: "/storage",
            privileges: [...PROVISION_ROLE_PRIVILEGES],
            propagate: true,
          },
          {
            path: "/nodes/pve1",
            privileges: [...PROVISION_ROLE_PRIVILEGES],
            propagate: true,
          },
          {
            path: "/sdn/zones/localnetwork",
            privileges: ["SDN.Use"],
            propagate: true,
          },
        ],
      },
      (c) => discoverServer(c),
    );
    expect(d.pool).toBe("nexora");
    expect(d.privileges).toEqual({ ok: true, missing: [] });
  });
});

describe("causes lisibles des erreurs de Proxmox", () => {
  const cases: [string, ConstructorParameters<typeof ProxmoxError>, RegExp][] =
    [
      ["jeton refusé", ["unauthorized", "x", 401], /jeton/i],
      [
        "droit manquant",
        ["forbidden", "Permission check failed (/vms, VM.Audit)", 403],
        /VM\.Audit/,
      ],
      ["TLS", ["tls", "x"], /empreinte|certificat/i],
      ["réseau", ["network", "x"], /8006|joignable|pare-feu/i],
      ["délai", ["timeout", "x"], /délai|répond/i],
    ];
  for (const [name, args, re] of cases)
    it(`${name} : cause et action`, () => {
      const e = explainProxmoxError(new ProxmoxError(...args));
      expect(`${e.cause} ${e.action}`).toMatch(re);
      expect(e.cause.length).toBeGreaterThan(10);
      expect(e.action.length).toBeGreaterThan(10);
    });

  it("jamais le jeton ni le corps de la réponse dans le texte", () => {
    const e = explainProxmoxError(
      new ProxmoxError("unauthorized", "Proxmox 401 sur GET /version : SECRET"),
    );
    expect(JSON.stringify(e)).not.toContain("SECRET");
  });
});

afterAll(() => {});
