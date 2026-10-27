import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getMethodDef, validateReturns } from "./apidoc.ts";
import { ProxmoxClient, ProxmoxError } from "./client.ts";
import { ProxmoxSimulator } from "./simulator.ts";

/**
 * Appels de découverte et de préparation de gabarit (branchement d'un serveur). Chaque réponse du
 * simulateur est validée contre le schéma OFFICIEL de l'API (apidoc.js) : forme identique à Proxmox.
 */
const TOKEN = "nexora@pve!provision=11111111-2222-3333-4444-555555555555";
const URL_OK = "https://cloud.debian.org/images/cloud/bookworm/latest/img.qcow2";
const SUM = "a".repeat(128);

function conformant(template: string, method: string, data: unknown) {
  const def = getMethodDef(template, method);
  expect(def, `${method} ${template} absent du schéma`).toBeDefined();
  expect(validateReturns(def?.returns, data)).toEqual([]);
}

function setup(options: ConstructorParameters<typeof ProxmoxSimulator>[0]) {
  const sim = new ProxmoxSimulator(options);
  let stop: () => Promise<void> = async () => {};
  let client!: ProxmoxClient;
  return {
    sim,
    get client() {
      return client;
    },
    async start() {
      const s = await sim.start();
      stop = s.close;
      client = new ProxmoxClient({
        host: s.host,
        port: s.port,
        protocol: "http",
        token: TOKEN,
        tls: { mode: "verify" },
        sleep: async () => {},
      });
    },
    stop: () => stop(),
  };
}

describe("lectures de découverte (conformes au schéma officiel)", () => {
  const env = setup({ token: TOKEN, templates: [] });
  beforeAll(() => env.start());
  afterAll(() => env.stop());

  it("liste les stockages avec leurs types de contenu", async () => {
    const storages = await env.client.storages("pve1");
    conformant("/nodes/{node}/storage", "GET", storages);
    const local = storages.find((s) => s.storage === "local");
    expect(local?.content).toContain("iso");
    expect(local?.content).not.toContain("import");
    expect(
      storages.find((s) => s.storage === "local-lvm")?.content,
    ).toContain("images");
  });

  it("filtre les stockages par type de contenu", async () => {
    const storages = await env.client.storages("pve1", { content: "images" });
    expect(storages.map((s) => s.storage)).toEqual(["local-lvm"]);
  });

  it("liste les ponts réseau avec adresse et passerelle", async () => {
    const nets = await env.client.networks("pve1", "any_bridge");
    conformant("/nodes/{node}/network", "GET", nets);
    expect(nets).toHaveLength(1);
    expect(nets[0]).toMatchObject({
      iface: "vmbr0",
      type: "bridge",
      cidr: "192.168.1.10/24",
      gateway: "192.168.1.1",
    });
  });

  it("lit les serveurs DNS du nœud", async () => {
    const dns = await env.client.nodeDns("pve1");
    conformant("/nodes/{node}/dns", "GET", dns);
    expect(dns.dns1).toBe("192.168.1.1");
  });

  it("lit les droits effectifs du jeton sur un chemin", async () => {
    const perms = await env.client.permissions("/storage/local");
    conformant("/access/permissions", "GET", perms);
    expect(perms["/storage/local"]?.["Datastore.AllocateTemplate"]).toBe(1);
  });
});

describe("droits du jeton limités", () => {
  const env = setup({
    token: TOKEN,
    templates: [],
    acl: [
      {
        path: "/storage/local",
        privileges: ["Datastore.Audit"],
        propagate: true,
      },
    ],
  });
  beforeAll(() => env.start());
  afterAll(() => env.stop());

  it("refuse avec le message de Proxmox (Permission check failed) quand un droit manque", async () => {
    await expect(
      env.client.downloadUrl("pve1", "local", {
        url: URL_OK,
        content: "import",
        filename: "img.qcow2",
      }),
    ).rejects.toMatchObject({
      code: "forbidden",
      message: expect.stringContaining("Permission check failed"),
    });
  });

  it("n'accorde pas hors de la branche de l'ACL, et propage dans la branche", async () => {
    const perms = await env.client.permissions("/storage/local/sous-chemin");
    expect(perms["/storage/local/sous-chemin"]?.["Datastore.Audit"]).toBe(1);
    const other = await env.client.permissions("/nodes/pve1");
    expect(other["/nodes/pve1"]?.["Sys.Audit"] ?? 0).toBe(0);
  });
});

describe("téléchargement, création de la VM et conversion en gabarit", () => {
  const env = setup({
    token: TOKEN,
    templates: [],
    taskPolls: 2,
    storages: [
      {
        storage: "local",
        type: "dir",
        content: "iso,vztmpl,backup,import",
      },
      { storage: "local-lvm", type: "lvmthin", content: "images,rootdir" },
    ],
    remoteFiles: {
      [URL_OK]: { sha512: SUM, size: 3 * 1024 ** 3 },
    },
    pools: ["nexora"],
  });
  beforeAll(() => env.start());
  afterAll(() => env.stop());

  it("télécharge l'image en vérifiant la somme publiée, puis la liste dans le stockage", async () => {
    const upid = await env.client.downloadUrl("pve1", "local", {
      url: URL_OK,
      content: "import",
      filename: "debian-12.qcow2",
      checksum: SUM,
      checksumAlgorithm: "sha512",
    });
    expect(upid).toMatch(/^UPID:pve1:/);
    await env.client.waitTask(upid);
    const content = await env.client.storageContent("pve1", "local", "import");
    conformant("/nodes/{node}/storage/{storage}/content", "GET", content);
    expect(content.map((v) => v.volid)).toContain("local:import/debian-12.qcow2");
  });

  it("une somme différente de celle publiée fait échouer la tâche, sans laisser de fichier", async () => {
    const upid = await env.client.downloadUrl("pve1", "local", {
      url: URL_OK,
      content: "import",
      filename: "mauvais.qcow2",
      checksum: "b".repeat(128),
      checksumAlgorithm: "sha512",
    });
    await expect(env.client.waitTask(upid)).rejects.toMatchObject({
      code: "task_failed",
      message: expect.stringMatching(/checksum/i),
    });
    const content = await env.client.storageContent("pve1", "local", "import");
    expect(content.map((v) => v.volid)).not.toContain(
      "local:import/mauvais.qcow2",
    );
  });

  it("refuse un nom de fichier sans extension d'image pour le contenu import", async () => {
    await expect(
      env.client.downloadUrl("pve1", "local", {
        url: URL_OK,
        content: "import",
        filename: "image.img",
      }),
    ).rejects.toMatchObject({
      code: "server_error",
      message: expect.stringMatching(/filename|extension/),
    });
  });

  it("refuse le type import sur un stockage qui ne l'a pas activé", async () => {
    await expect(
      env.client.downloadUrl("pve1", "local-lvm", {
        url: URL_OK,
        content: "import",
        filename: "x.qcow2",
      }),
    ).rejects.toBeInstanceOf(ProxmoxError);
  });

  it("crée la VM en important le disque, ajoute le lecteur cloud-init, puis la convertit en gabarit", async () => {
    const vmid = 9100;
    const create = await env.client.createVm("pve1", {
      vmid,
      name: "nexora-tpl-debian-12",
      memory: 2048,
      cores: 2,
      cpu: "host",
      agent: "enabled=1",
      ostype: "l26",
      scsihw: "virtio-scsi-pci",
      scsi0: "local-lvm:0,import-from=local:import/debian-12.qcow2,discard=on",
      ide2: "local-lvm:cloudinit",
      boot: "order=scsi0",
      net0: "virtio,bridge=vmbr0,firewall=1",
      serial0: "socket",
      vga: "serial0",
      tags: "nexora-template",
      pool: "nexora",
    });
    conformant("/nodes/{node}/qemu", "POST", create);
    await env.client.waitTask(create);

    const cfg = await env.client.getConfig("pve1", vmid);
    expect(String(cfg.scsi0)).toMatch(/^local-lvm:vm-9100-disk-0,.*size=3G/);
    expect(String(cfg.ide2)).toContain("vm-9100-cloudinit");
    expect(cfg.cpu).toBe("host");
    expect(cfg.lock).toBeUndefined();

    const tpl = await env.client.convertToTemplate("pve1", vmid);
    conformant("/nodes/{node}/qemu/{vmid}/template", "POST", tpl);
    await env.client.waitTask(tpl);
    const after = await env.client.getConfig("pve1", vmid);
    expect(Number(after.template)).toBe(1);
    expect(String(after.scsi0)).toContain("base-9100-disk-0");

    // Deux conversions: refus net.
    await expect(
      env.client.convertToTemplate("pve1", vmid),
    ).rejects.toBeInstanceOf(ProxmoxError);
  });

  it("refuse de créer une VM dont le disque source n'existe pas, ou un vmid déjà pris", async () => {
    await expect(
      env.client.createVm("pve1", {
        vmid: 9101,
        scsi0: "local-lvm:0,import-from=local:import/absent.qcow2",
      }),
    ).rejects.toMatchObject({ code: "server_error" });
    await expect(
      env.client.createVm("pve1", { vmid: 9100, name: "doublon" }),
    ).rejects.toMatchObject({ code: "server_error" });
  });

  it("refuse un pool inexistant", async () => {
    await expect(
      env.client.createVm("pve1", { vmid: 9102, pool: "fantome" }),
    ).rejects.toMatchObject({ code: "server_error" });
  });

  it("refuse une propriété hors schéma, comme Proxmox (400)", async () => {
    await expect(
      env.client.createVm("pve1", { vmid: 9103, nimporte: "quoi" }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });
});
