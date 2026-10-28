import { createHash } from "node:crypto";
import { eq, jobs, ne, osTemplates, proxmoxServers } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { provisionOrder } from "../provision.ts";
import { ProxmoxSimulator } from "../proxmox/simulator.ts";
import {
  createSimRunner,
  engineDeps,
  paidOrder,
  SIM_TOKEN,
  seedFixture,
} from "../testing.ts";
import { connectServer } from "./connect.ts";
import { CLOUD_IMAGES } from "./images.ts";
import {
  getSetup,
  runSetup,
  SetupError,
  type SetupInput,
  startSetup,
} from "./setup.ts";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

const [DEBIAN, UBUNTU] = CLOUD_IMAGES;
const SUM_DEBIAN = "d".repeat(128);
const SUM_UBUNTU = "e".repeat(64);
const SUMS: Record<string, string> = {
  [DEBIAN?.checksumUrl as string]: `${SUM_DEBIAN}  ${DEBIAN?.remoteName}\n`,
  [UBUNTU?.checksumUrl as string]: `${SUM_UBUNTU} *${UBUNTU?.remoteName}\n`,
};
const fetchText = async (url: string) => {
  const body = SUMS[url];
  if (!body) throw new Error(`adresse inattendue : ${url}`);
  return body;
};

const STORAGES = [
  { storage: "local", type: "dir", content: "iso,vztmpl,backup,import" },
  { storage: "local-lvm", type: "lvmthin", content: "images,rootdir" },
];

function newSim(
  over: Partial<ConstructorParameters<typeof ProxmoxSimulator>[0]> = {},
) {
  return new ProxmoxSimulator({
    token: SIM_TOKEN,
    templates: [],
    taskPolls: 2,
    agentPolls: 2,
    storages: STORAGES,
    remoteFiles: {
      [DEBIAN?.imageUrl as string]: { sha512: SUM_DEBIAN, size: 3 * 1024 ** 3 },
      [UBUNTU?.imageUrl as string]: { sha256: SUM_UBUNTU, size: 4 * 1024 ** 3 },
    },
    ...over,
  });
}

const NETWORK = {
  ranges: [{ from: "192.168.1.100", to: "192.168.1.120" }],
  prefix: 24,
  gateway: "192.168.1.1",
  dns: ["192.168.1.1"],
  bridge: "vmbr0",
};
const input = (over: Partial<SetupInput> = {}): SetupInput => ({
  name: "Serveur de Québec",
  node: "pve1",
  region: "quebec",
  vmStorage: "local-lvm",
  importStorage: "local",
  pool: null,
  capacity: { vcpu: 16, ramMb: 65_536, diskGb: 1_000 },
  network: NETWORK,
  templates: ["debian-12-ci"],
  ...over,
});

let counter = 0;
async function connected(sim: ProxmoxSimulator, port: number) {
  const code = `pve-essai-${++counter}`;
  const r = await connectServer(
    t.db,
    { getSecret: async () => SIM_TOKEN, checkHost: () => null },
    {
      code,
      host: "http://127.0.0.1",
      port,
      tokenRef: `proxmox.${code}`,
      tlsMode: "verify",
      tlsFingerprint: null,
    },
  );
  return { ...r, sim };
}
const deps = (
  runner: ReturnType<typeof createSimRunner>["runner"],
  over = {},
) =>
  ({
    ...engineDeps(t.db, runner, {
      settings: { agentTimeoutMs: 2_000, installTimeoutMs: 2_000 },
    }),
    fetchText,
    ...over,
  }) as ReturnType<typeof engineDeps> & { fetchText: typeof fetchText };
const stepsOf = async (serverId: string) =>
  Object.fromEntries(
    ((await getSetup(t.db, serverId))?.steps ?? []).map((s) => [s.id, s]),
  );

describe("branchement guidé : de l'adresse au serveur prêt", () => {
  it("découvre, prépare le gabarit Debian par l'API seule, et ne rend le serveur prêt qu'à la fin", async () => {
    const sim = newSim();
    const s = await sim.start();
    try {
      const c = await connected(sim, s.port);
      expect(c.server.state).toBe("draft");
      expect(c.discovery.vmStorage).toBe("local-lvm");
      expect(
        c.discovery.problems.filter((p) => p.severity === "blocking"),
      ).toEqual([]);

      const started = await startSetup(t.db, c.server.id, input(), {
        client: deps(createSimRunner(sim).runner).proxmox,
      });
      expect(started.setup.status).toBe("pending");
      expect(started.setup.steps.every((x) => x.status === "pending")).toBe(
        true,
      );
      // Le serveur n'est PAS prêt avant la fin des vérifications.
      expect(
        (
          await t.db
            .select()
            .from(proxmoxServers)
            .where(eq(proxmoxServers.id, c.server.id))
        )[0]?.state,
      ).toBe("draft");
      // Les choix validés sont enregistrés sur la fiche.
      const saved = (
        await t.db
          .select()
          .from(proxmoxServers)
          .where(eq(proxmoxServers.id, c.server.id))
      )[0];
      expect(saved).toMatchObject({
        name: "Serveur de Québec",
        node: "pve1",
        storage: "local-lvm",
        capacity: { vcpu: 16, ramMb: 65_536, diskGb: 1_000 },
      });
      expect(saved?.ipPool.ranges).toEqual(NETWORK.ranges);
      // Une tâche, une seule, est créée pour le worker.
      const queued = await t.db
        .select()
        .from(jobs)
        .where(eq(jobs.type, "vps.server_setup"));
      expect(
        queued.filter(
          (j) => (j.payload as { serverId: string }).serverId === c.server.id,
        ),
      ).toHaveLength(1);

      const guest = createSimRunner(sim);
      const done = await runSetup(
        deps(guest.runner),
        c.server.id,
        started.setup.runId,
      );
      expect(done.status).toBe("succeeded");
      expect(done.steps.map((x) => `${x.id}:${x.status}`)).toEqual([
        "connexion:ok",
        "image:debian-12-ci:ok",
        "gabarit:debian-12-ci:ok",
        "verification:ok",
      ]);

      // L'image a été téléchargée par le nœud avec la somme PUBLIÉE, algorithme sha512.
      const dl = sim.callsTo("POST", "/download-url");
      expect(dl).toHaveLength(1);
      expect(dl[0]?.params).toMatchObject({
        url: DEBIAN?.imageUrl,
        content: "import",
        checksum: SUM_DEBIAN,
        "checksum-algorithm": "sha512",
        "verify-certificates": true,
      });
      // Le gabarit : CPU host, agent, lecteur cloud-init, aucun reste de la préparation.
      const tpl = [...sim.vms.values()].find((v) => v.template);
      expect(tpl?.vmid).toBe(9000);
      expect(tpl?.config).toMatchObject({
        name: "nexora-tpl-debian-12-ci",
        cpu: "host",
        agent: "enabled=1",
        template: 1,
        tags: "nexora-template",
        scsihw: "virtio-scsi-pci",
      });
      expect(String(tpl?.config.ide2)).toContain("cloudinit");
      expect(String(tpl?.config.scsi0)).toContain("base-9000-disk-0");
      for (const k of ["sshkeys", "ipconfig0", "ciuser", "nameserver"])
        expect(tpl?.config[k]).toBeUndefined();
      expect(tpl?.agentInstalled).toBe(true);
      // La préparation dans la VM : via SSH, avec la clé du worker, sur une adresse du bloc, script borné.
      expect(guest.installs).toHaveLength(1);
      expect(guest.installs[0]?.user).toBe("debian");
      expect(guest.installs[0]?.host).toMatch(/^192\.168\.1\.1[0-2]\d$/);
      // La ligne de gabarit est « prête » et le serveur l'est aussi.
      const rows = await t.db
        .select()
        .from(osTemplates)
        .where(eq(osTemplates.serverId, c.server.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        code: "debian-12-ci",
        vmid: 9000,
        ciUser: "debian",
        state: "ready",
        os: "debian",
        osVersion: "12",
      });
      const after = (
        await t.db
          .select()
          .from(proxmoxServers)
          .where(eq(proxmoxServers.id, c.server.id))
      )[0];
      expect(after).toMatchObject({
        state: "ready",
        lastCheckOk: true,
        pveVersion: "9.0.3",
      });
    } finally {
      await s.close();
    }
  });

  it("le gabarit fabriqué sert vraiment : une commande payée devient un VPS actif sur ce serveur", async () => {
    const sim = newSim();
    const s = await sim.start();
    try {
      const c = await connected(sim, s.port);
      const guest = createSimRunner(sim);
      const d = deps(guest.runner);
      const started = await startSetup(t.db, c.server.id, input(), {
        client: d.proxmox,
      });
      await runSetup(d, c.server.id, started.setup.runId);
      // Les serveurs des autres essais (simulateurs déjà arrêtés) ne doivent pas être choisis.
      await t.db
        .update(proxmoxServers)
        .set({ state: "maintenance" })
        .where(ne(proxmoxServers.id, c.server.id));
      const fx = await seedFixture(t.db, {
        simPort: s.port,
        serverId: c.server.id,
      });
      const orderId = await paidOrder(t.db, fx);
      const out = await provisionOrder(d, orderId);
      expect(out).toEqual({ outcome: "done" });
      expect(sim.guests()).toHaveLength(1);
      expect(sim.guests()[0]?.status).toBe("running");
    } finally {
      await s.close();
    }
  });

  it("rejouer ne crée aucun doublon : ni téléchargement, ni VM, ni ligne de gabarit", async () => {
    const sim = newSim();
    const s = await sim.start();
    try {
      const c = await connected(sim, s.port);
      const guest = createSimRunner(sim);
      const d = deps(guest.runner);
      const first = await startSetup(t.db, c.server.id, input(), {
        client: d.proxmox,
      });
      await runSetup(d, c.server.id, first.setup.runId);
      const creates = sim
        .callsTo("POST", "/qemu")
        .filter((x) => x.path.endsWith("/qemu")).length;

      const second = await startSetup(t.db, c.server.id, input(), {
        client: d.proxmox,
      });
      expect(second.setup.runId).not.toBe(first.setup.runId);
      const again = await runSetup(d, c.server.id, second.setup.runId);
      expect(again.status).toBe("succeeded");
      expect(sim.callsTo("POST", "/download-url")).toHaveLength(1);
      expect(
        sim.callsTo("POST", "/qemu").filter((x) => x.path.endsWith("/qemu"))
          .length,
      ).toBe(creates);
      expect(guest.installs).toHaveLength(1);
      expect(sim.vms.size).toBe(1);
      const rows = await t.db
        .select()
        .from(osTemplates)
        .where(eq(osTemplates.serverId, c.server.id));
      expect(rows).toHaveLength(1);
      const steps = await stepsOf(c.server.id);
      expect(steps["gabarit:debian-12-ci"]?.status).toBe("skipped");
      expect(steps["image:debian-12-ci"]?.status).toBe("skipped");
    } finally {
      await s.close();
    }
  });

  it("demander deux fois pendant qu'un branchement est en cours renvoie le même, sans second travail", async () => {
    const sim = newSim();
    const s = await sim.start();
    try {
      const c = await connected(sim, s.port);
      const d = deps(createSimRunner(sim).runner);
      const [a, b] = await Promise.all([
        startSetup(t.db, c.server.id, input(), { client: d.proxmox }),
        startSetup(t.db, c.server.id, input(), { client: d.proxmox }),
      ]);
      expect(b.setup.runId).toBe(a.setup.runId);
      const queued = (
        await t.db.select().from(jobs).where(eq(jobs.type, "vps.server_setup"))
      ).filter(
        (j) => (j.payload as { serverId: string }).serverId === c.server.id,
      );
      expect(queued).toHaveLength(1);
    } finally {
      await s.close();
    }
  });

  it("deux gabarits : Debian puis Ubuntu, chacun avec sa propre somme publiée", async () => {
    const sim = newSim();
    const s = await sim.start();
    try {
      const c = await connected(sim, s.port);
      const guest = createSimRunner(sim);
      const d = deps(guest.runner);
      const st = await startSetup(
        t.db,
        c.server.id,
        input({ templates: ["debian-12-ci", "ubuntu-24-04-ci"] }),
        { client: d.proxmox },
      );
      const done = await runSetup(d, c.server.id, st.setup.runId);
      expect(done.status).toBe("succeeded");
      const dls = sim.callsTo("POST", "/download-url").map((x) => x.params);
      expect(dls.map((x) => x["checksum-algorithm"])).toEqual([
        "sha512",
        "sha256",
      ]);
      expect(dls[1]?.checksum).toBe(SUM_UBUNTU);
      const rows = await t.db
        .select()
        .from(osTemplates)
        .where(eq(osTemplates.serverId, c.server.id));
      expect(rows.map((r) => r.code).sort()).toEqual([
        "debian-12-ci",
        "ubuntu-24-04-ci",
      ]);
      expect(rows.find((r) => r.code === "ubuntu-24-04-ci")?.ciUser).toBe(
        "ubuntu",
      );
      expect(
        [...sim.vms.values()]
          .filter((v) => v.template)
          .map((v) => v.vmid)
          .sort(),
      ).toEqual([9000, 9001]);
      expect(guest.installs.map((i) => i.user)).toEqual(["debian", "ubuntu"]);
    } finally {
      await s.close();
    }
  });
});

describe("échecs honnêtes : cause lisible, action à faire, jamais « prêt »", () => {
  it("prérequis manquant (type Import absent) : refus net avant tout travail", async () => {
    const sim = newSim({ storages: undefined });
    const s = await sim.start();
    try {
      const c = await connected(sim, s.port);
      expect(c.discovery.problems.map((p) => p.id)).toContain("import-storage");
      const err = await startSetup(
        t.db,
        c.server.id,
        input({ importStorage: "local" }),
        {
          client: deps(createSimRunner(sim).runner).proxmox,
        },
      ).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SetupError);
      expect((err as SetupError).code).toBe("prerequisites");
      expect(JSON.stringify((err as SetupError).details)).toContain("Import");
      expect(await getSetup(t.db, c.server.id)).toBeNull();
      expect(
        (
          await t.db
            .select()
            .from(jobs)
            .where(eq(jobs.type, "vps.server_setup"))
        ).filter(
          (j) => (j.payload as { serverId: string }).serverId === c.server.id,
        ),
      ).toHaveLength(0);
    } finally {
      await s.close();
    }
  });

  it("bloc d'adresses incohérent : refusé avec les raisons, rien n'est enregistré", async () => {
    const sim = newSim();
    const s = await sim.start();
    try {
      const c = await connected(sim, s.port);
      const err = await startSetup(
        t.db,
        c.server.id,
        input({ network: { ...NETWORK, gateway: "10.9.9.9" } }),
        { client: deps(createSimRunner(sim).runner).proxmox },
      ).catch((e: unknown) => e);
      expect((err as SetupError).code).toBe("invalid_network");
      expect(JSON.stringify((err as SetupError).details)).toMatch(/passerelle/);
      expect(await getSetup(t.db, c.server.id)).toBeNull();
    } finally {
      await s.close();
    }
  });

  it("le téléchargement échoue (somme différente) : l'étape dit pourquoi et que faire, le serveur reste en brouillon", async () => {
    const sim = newSim({
      remoteFiles: {
        [DEBIAN?.imageUrl as string]: {
          sha512: "0".repeat(128),
          size: 3 * 1024 ** 3,
        },
      },
    });
    const s = await sim.start();
    try {
      const c = await connected(sim, s.port);
      const d = deps(createSimRunner(sim).runner);
      const st = await startSetup(t.db, c.server.id, input(), {
        client: d.proxmox,
      });
      const done = await runSetup(d, c.server.id, st.setup.runId);
      expect(done.status).toBe("failed");
      const step = done.steps.find((x) => x.id === "image:debian-12-ci");
      expect(step?.status).toBe("failed");
      expect(step?.cause).toMatch(/somme|checksum/i);
      expect(step?.action).toBeTruthy();
      expect(done.steps.find((x) => x.id === "verification")?.status).toBe(
        "pending",
      );
      expect(
        (
          await t.db
            .select()
            .from(proxmoxServers)
            .where(eq(proxmoxServers.id, c.server.id))
        )[0]?.state,
      ).toBe("draft");
      expect(
        await t.db
          .select()
          .from(osTemplates)
          .where(eq(osTemplates.serverId, c.server.id)),
      ).toHaveLength(0);
    } finally {
      await s.close();
    }
  });

  it("reprise après un échec de conversion : la VM à moitié construite (la nôtre) est refaite, sans doublon", async () => {
    const sim = newSim();
    const s = await sim.start();
    try {
      const c = await connected(sim, s.port);
      const guest = createSimRunner(sim);
      const d = deps(guest.runner);
      sim.failTask("qmtemplate", "storage error");
      const st = await startSetup(t.db, c.server.id, input(), {
        client: d.proxmox,
      });
      const failed = await runSetup(d, c.server.id, st.setup.runId);
      expect(failed.status).toBe("failed");
      expect(
        failed.steps.find((x) => x.id === "gabarit:debian-12-ci")?.cause,
      ).toMatch(/storage error/);
      sim.clearFailures();
      const again = await startSetup(t.db, c.server.id, input(), {
        client: d.proxmox,
      });
      const ok = await runSetup(d, c.server.id, again.setup.runId);
      expect(ok.status).toBe("succeeded");
      const named = [...sim.vms.values()].filter(
        (v) => v.name === "nexora-tpl-debian-12-ci",
      );
      expect(named).toHaveLength(1);
      expect(named[0]?.template).toBe(true);
      expect(sim.callsTo("POST", "/download-url")).toHaveLength(1);
    } finally {
      await s.close();
    }
  });

  it("une VM étrangère qui porte le nom du gabarit n'est JAMAIS supprimée", async () => {
    const sim = newSim({
      templates: [{ vmid: 9000, name: "nexora-tpl-debian-12-ci" }],
    });
    // Une VM d'un autre propriétaire (sans l'étiquette de Nexora), qui n'est pas un gabarit.
    const foreign = sim.vms.get(9000);
    if (foreign) {
      foreign.template = false;
      delete foreign.config.template;
    }
    const s = await sim.start();
    try {
      const c = await connected(sim, s.port);
      const d = deps(createSimRunner(sim).runner);
      const st = await startSetup(t.db, c.server.id, input(), {
        client: d.proxmox,
      });
      const done = await runSetup(d, c.server.id, st.setup.runId);
      expect(done.status).toBe("failed");
      const step = done.steps.find((x) => x.id === "gabarit:debian-12-ci");
      expect(step?.cause).toMatch(/n.a pas été créée par Nexora/);
      expect(sim.vms.has(9000)).toBe(true);
      expect(sim.callsTo("DELETE", "/qemu/9000")).toHaveLength(0);
    } finally {
      await s.close();
    }
  });

  it("clé du worker absente : échec explicite, rien n'est créé sur Proxmox", async () => {
    const sim = newSim();
    const s = await sim.start();
    try {
      const c = await connected(sim, s.port);
      const d = engineDeps(t.db, createSimRunner(sim).runner, {
        settings: { workerSshPublicKey: null },
      });
      const dd = { ...d, fetchText };
      const st = await startSetup(t.db, c.server.id, input(), {
        client: d.proxmox,
      });
      const done = await runSetup(dd, c.server.id, st.setup.runId);
      expect(done.status).toBe("failed");
      const step = done.steps.find((x) => x.id === "connexion");
      expect(step?.action).toMatch(/VPS_WORKER_SSH_PUBLIC_KEY/);
      expect(sim.callsTo("POST", "/qemu")).toHaveLength(0);
    } finally {
      await s.close();
    }
  });

  it("la VM de préparation est injoignable en SSH : échec lisible, VM temporaire nettoyée, adresse libérée", async () => {
    const sim = newSim();
    const s = await sim.start();
    try {
      const c = await connected(sim, s.port);
      const guest = createSimRunner(sim);
      guest.state.failNext = 0;
      const refuse = {
        ...guest.runner,
        run: async () => ({
          ok: false,
          exitCode: 255,
          tail: "ssh : connexion refusée",
        }),
      };
      const d = deps(refuse, {
        settings: {
          ...engineDeps(t.db, refuse).settings,
          installTimeoutMs: 60,
          agentPollMs: 5,
        },
        sleep: async () => new Promise((r) => setTimeout(r, 5)),
      });
      const st = await startSetup(t.db, c.server.id, input(), {
        client: d.proxmox,
      });
      const done = await runSetup(d, c.server.id, st.setup.runId);
      expect(done.status).toBe("failed");
      const step = done.steps.find((x) => x.id === "gabarit:debian-12-ci");
      expect(step?.cause).toMatch(/SSH|joignable/);
      expect(step?.action).toMatch(/accès|réseau|pare-feu|adresse/i);
      expect(sim.guests()).toHaveLength(0);
    } finally {
      await s.close();
    }
  });

  it("une tâche obsolète (autre branchement lancé depuis) s'arrête sans rien faire", async () => {
    const sim = newSim();
    const s = await sim.start();
    try {
      const c = await connected(sim, s.port);
      const d = deps(createSimRunner(sim).runner);
      const first = await startSetup(t.db, c.server.id, input(), {
        client: d.proxmox,
      });
      // L'opérateur abandonne le premier (par exemple après un plantage) et en relance un autre.
      await t.db
        .update(proxmoxServers)
        .set({ setup: { ...first.setup, status: "failed" } })
        .where(eq(proxmoxServers.id, c.server.id));
      const second = await startSetup(t.db, c.server.id, input(), {
        client: d.proxmox,
      });
      await runSetup(d, c.server.id, first.setup.runId);
      expect(sim.calls.filter((x) => x.method === "POST")).toHaveLength(0);
      expect((await getSetup(t.db, c.server.id))?.runId).toBe(
        second.setup.runId,
      );
    } finally {
      await s.close();
    }
  });
});

describe("empreinte et somme : jamais de raccourci", () => {
  it("ne calcule jamais lui-même la somme : celle envoyée à Proxmox est celle du fichier publié", async () => {
    const sim = newSim();
    const s = await sim.start();
    try {
      const c = await connected(sim, s.port);
      const d = deps(createSimRunner(sim).runner);
      const st = await startSetup(t.db, c.server.id, input(), {
        client: d.proxmox,
      });
      await runSetup(d, c.server.id, st.setup.runId);
      const sent = sim.callsTo("POST", "/download-url")[0]?.params.checksum;
      expect(sent).toBe(SUM_DEBIAN);
      expect(sent).not.toBe(createHash("sha512").update("x").digest("hex"));
    } finally {
      await s.close();
    }
  });
});
