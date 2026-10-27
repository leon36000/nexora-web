import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getMethodDef, validateReturns } from "./apidoc.ts";
import { ProxmoxClient, ProxmoxError } from "./client.ts";
import { ProxmoxSimulator } from "./simulator.ts";

/**
 * Test de contrat du client Proxmox. La même suite tourne :
 *  - toujours, contre le simulateur (dérivé du schéma officiel) ;
 *  - contre un VRAI Proxmox quand PROXMOX_CONTRACT_URL est défini (sinon ignoré, avec un avertissement).
 *
 * Variables (serveur réel) : PROXMOX_CONTRACT_URL (https://hôte:8006), PROXMOX_CONTRACT_TOKEN
 * (USER@REALM!TOKENID=UUID), PROXMOX_CONTRACT_NODE, PROXMOX_CONTRACT_FINGERPRINT (SHA-256 du
 * certificat, si auto-signé), PROXMOX_CONTRACT_TEMPLATE_VMID et PROXMOX_CONTRACT_MUTATE=1 pour
 * exécuter aussi le cycle de vie (clone, démarrage, instantané, suppression d'une VM `nexora-contract-*`).
 * Les lectures seules tournent sans MUTATE.
 */
const TOKEN = "nexora@pve!provision=11111111-2222-3333-4444-555555555555";
const KEY =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl test@nexora";

type Env = {
  client: ProxmoxClient;
  node: string;
  templateVmid?: number;
  mutate: boolean;
};

function conformant(template: string, method: string, data: unknown) {
  const def = getMethodDef(template, method);
  expect(def, `${method} ${template} absent du schéma`).toBeDefined();
  expect(validateReturns(def?.returns, data)).toEqual([]);
}

function contractSuite(getEnv: () => Env) {
  it("lit la version, les nœuds et l'état du nœud (réponses conformes au schéma)", async () => {
    const { client, node } = getEnv();
    const version = await client.version();
    conformant("/version", "GET", version);
    expect(version.version).toMatch(/^\d+\.\d+/);
    const nodes = await client.nodes();
    conformant("/nodes", "GET", nodes);
    expect(nodes.map((n) => n.node)).toContain(node);
    conformant("/nodes/{node}/status", "GET", await client.nodeStatus(node));
    const id = await client.nextId();
    expect(Number.isInteger(id)).toBe(true);
    expect(id).toBeGreaterThanOrEqual(100);
    conformant("/nodes/{node}/qemu", "GET", await client.listVms(node));
  });

  it("une VM inexistante se reconnaît (findConfig → null)", async () => {
    const { client, node } = getEnv();
    expect(await client.findConfig(node, 999_999_990)).toBeNull();
  });

  it("le gabarit est lisible et marqué `template`", async () => {
    const { client, node, templateVmid } = getEnv();
    if (templateVmid === undefined) return;
    const cfg = await client.getConfig(node, templateVmid);
    expect(Number(cfg.template)).toBe(1);
  });

  it("cycle de vie complet : clone, cloud-init, démarrage, adresse de l'agent, instantané, arrêt, suppression", async () => {
    const { client, node, templateVmid, mutate } = getEnv();
    if (!mutate || templateVmid === undefined) return;
    const vmid = await client.nextId();
    const name = `nexora-contract-${Date.now().toString(36)}`;
    try {
      const clone = await client.cloneVm(node, templateVmid, {
        newid: vmid,
        name,
        full: true,
      });
      expect(clone).toMatch(/^UPID:/);
      await client.waitTask(clone, { timeoutMs: 600_000, pollMs: 2_000 });
      expect((await client.findConfig(node, vmid))?.name).toBe(name);
      await client.setConfig(node, vmid, {
        ciuser: "debian",
        sshkeys: encodeURIComponent(KEY),
        ipconfig0: "ip=dhcp",
        agent: "enabled=1",
      });
      await client.waitTask(await client.startVm(node, vmid), {
        pollMs: 2_000,
      });
      expect((await client.vmStatus(node, vmid)).status).toBe("running");
      const snap = await client.createSnapshot(node, vmid, "avant_contrat");
      await client.waitTask(snap, { pollMs: 2_000 });
      expect(
        (await client.listSnapshots(node, vmid)).map((s) => s.name),
      ).toContain("avant_contrat");
      await client.waitTask(await client.stopVm(node, vmid), { pollMs: 2_000 });
    } finally {
      const cfg = await client.findConfig(node, vmid);
      if (cfg?.name === name) {
        try {
          await client.waitTask(await client.stopVm(node, vmid), {
            pollMs: 2_000,
          });
        } catch {
          // déjà arrêtée
        }
        await client.waitTask(await client.deleteVm(node, vmid), {
          pollMs: 2_000,
        });
      }
    }
  });
}

describe("contrat : simulateur Proxmox", () => {
  const sim = new ProxmoxSimulator({
    node: "pve1",
    token: TOKEN,
    taskPolls: 2,
    agentPolls: 2,
  });
  let stop: () => Promise<void>;
  let env: Env;
  let simPort = 0;
  beforeAll(async () => {
    const s = await sim.start();
    stop = s.close;
    simPort = s.port;
    env = {
      client: new ProxmoxClient({
        host: s.host,
        port: s.port,
        protocol: "http",
        token: TOKEN,
        tls: { mode: "verify" },
        sleep: async () => {},
      }),
      node: "pve1",
      templateVmid: 9000,
      mutate: true,
    };
  });
  afterAll(async () => stop());

  contractSuite(() => env);

  it("cycle de vie : l'adresse arrive par l'agent après quelques essais, les ordres invalides sont refusés comme par Proxmox", async () => {
    const { client, node } = env;
    const vmid = 10_001;
    const upid = await client.cloneVm(node, 9000, {
      newid: vmid,
      name: "vps-a",
    });
    // Verrou de clonage : la configuration est refusée tant que la tâche n'est pas finie.
    await expect(
      client.setConfig(node, vmid, { cores: 2 }),
    ).rejects.toMatchObject({
      code: "server_error",
      message: expect.stringContaining("locked (clone)"),
    });
    await client.waitTask(upid);
    await client.setConfig(node, vmid, {
      ciuser: "debian",
      sshkeys: encodeURIComponent(KEY),
      ipconfig0: "ip=10.20.0.15/24,gw=10.20.0.1",
      nameserver: "10.20.0.2",
      cores: 2,
      memory: 4096,
    });
    const cfg = await client.getConfig(node, vmid);
    expect(cfg.ciuser).toBe("debian");
    expect(String(cfg.sshkeys)).toContain("ssh-ed25519");
    await client.resizeDisk(node, vmid, "scsi0", "40G");
    expect(String((await client.getConfig(node, vmid)).scsi0)).toContain(
      "size=40G",
    );
    await client.waitTask(await client.startVm(node, vmid));
    expect(await client.guestIpv4(node, vmid)).toEqual([]);
    expect(await client.guestIpv4(node, vmid)).toEqual([]);
    expect(await client.guestIpv4(node, vmid)).toEqual(["10.20.0.15"]);
    // Démarrer une VM déjà démarrée est une erreur de Proxmox.
    await expect(client.startVm(node, vmid)).rejects.toMatchObject({
      code: "server_error",
    });
    // Un paramètre hors schéma est refusé (400), comme par le vrai serveur.
    await expect(
      client.setConfig(node, vmid, { cores: 0 }),
    ).rejects.toMatchObject({ code: "invalid_request", status: 400 });
    await expect(
      client.setConfig(node, vmid, { sshkeys: "pas-une-cle" }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    // Suppression : refusée tant que la VM tourne.
    await expect(client.deleteVm(node, vmid)).rejects.toThrow(/running/);
    await client.waitTask(await client.stopVm(node, vmid));
    await client.waitTask(await client.deleteVm(node, vmid));
    expect(await client.findConfig(node, vmid)).toBeNull();
  });

  it("refuse un jeton incorrect sans révéler le jeton attendu", async () => {
    const bad = new ProxmoxClient({
      host: "127.0.0.1",
      port: simPort,
      protocol: "http",
      token: "nexora@pve!autre=99999999-2222-3333-4444-555555555555",
      tls: { mode: "verify" },
    });
    const error = await bad.version().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProxmoxError);
    expect(error).toMatchObject({ code: "unauthorized", status: 401 });
    expect(String((error as Error).message)).not.toContain("11111111");
    expect(String((error as Error).message)).not.toContain("99999999");
  });

  it("une tâche en échec lève task_failed avec le message court de Proxmox", async () => {
    const { client, node } = env;
    sim.failTask("qmclone", "storage 'local-lvm' is not online");
    const upid = await client.cloneVm(node, 9000, {
      newid: 10_002,
      name: "vps-b",
    });
    await expect(client.waitTask(upid)).rejects.toMatchObject({
      code: "task_failed",
      message: expect.stringContaining("not online"),
    });
    sim.clearFailures();
  });
});

const url = process.env.PROXMOX_CONTRACT_URL;
if (!url)
  console.warn(
    "[contrat Proxmox] IGNORÉ : PROXMOX_CONTRACT_URL n'est pas défini (aucun accès à un vrai Proxmox). Voir docs/infra.md, section VPS.",
  );

describe.skipIf(!url)(
  "contrat : serveur Proxmox réel (PROXMOX_CONTRACT_URL)",
  () => {
    let env: Env;
    beforeAll(() => {
      const u = new URL(url as string);
      const token = process.env.PROXMOX_CONTRACT_TOKEN;
      const node = process.env.PROXMOX_CONTRACT_NODE;
      if (!token || !node)
        throw new Error(
          "PROXMOX_CONTRACT_TOKEN et PROXMOX_CONTRACT_NODE sont requis avec PROXMOX_CONTRACT_URL",
        );
      const fp = process.env.PROXMOX_CONTRACT_FINGERPRINT;
      env = {
        client: new ProxmoxClient({
          host: u.hostname,
          port: Number(u.port || 8006),
          protocol: u.protocol === "http:" ? "http" : "https",
          token,
          tls: fp ? { mode: "pinned", fingerprint: fp } : { mode: "verify" },
        }),
        node,
        templateVmid: process.env.PROXMOX_CONTRACT_TEMPLATE_VMID
          ? Number(process.env.PROXMOX_CONTRACT_TEMPLATE_VMID)
          : undefined,
        mutate: process.env.PROXMOX_CONTRACT_MUTATE === "1",
      };
    });
    contractSuite(() => env);
  },
);
