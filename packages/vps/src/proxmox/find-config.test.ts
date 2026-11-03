import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProxmoxClient, ProxmoxError } from "./client.ts";
import { ProxmoxSimulator } from "./simulator.ts";

/**
 * Observé sur Proxmox VE 9.2 réel (jeton limité à un pool) : une VM hors du pool ou inexistante répond
 * 403 « Permission check failed (/vms/<id>, VM.Audit) », pas 404 ni « does not exist » (réponse de root).
 */
const TOKEN = "nexora@pve!provision=11111111-2222-3333-4444-555555555555";
describe("findConfig avec un jeton limité à un pool", () => {
  const sim = new ProxmoxSimulator({
    token: TOKEN,
    templates: [{ vmid: 9001, name: "nexora-tpl" }],
  });
  let stop: () => Promise<void> = async () => {};
  let client!: ProxmoxClient;
  beforeAll(async () => {
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
  });
  afterAll(() => stop());

  it("une VM inexistante (403 pour un jeton de pool) se reconnaît : null", async () => {
    expect(await client.findConfig("pve1", 10_000)).toBeNull();
  });
  it("une VM existante renvoie sa configuration", async () => {
    expect((await client.findConfig("pve1", 9001))?.name).toBe("nexora-tpl");
  });
  it("un 403 sur autre chose qu'une lecture de VM reste une erreur", async () => {
    await expect(client.getConfig("pve1", 10_000)).rejects.toBeInstanceOf(
      ProxmoxError,
    );
  });
});

describe("suppression d'une VM avec un jeton qui n'est pas root", () => {
  it("n'envoie jamais skiplock (réservé à root@pam) et libère la VM", async () => {
    const sim = new ProxmoxSimulator({
      token: TOKEN,
      templates: [{ vmid: 9001, name: "nexora-tpl" }],
    });
    const s = await sim.start();
    try {
      const client = new ProxmoxClient({
        host: s.host,
        port: s.port,
        protocol: "http",
        token: TOKEN,
        tls: { mode: "verify" },
        sleep: async () => {},
      });
      await client.waitTask(await client.deleteVm("pve1", 9001), {
        timeoutMs: 5_000,
        pollMs: 1,
      });
      expect(await client.findConfig("pve1", 9001)).toBeNull();
      expect(
        sim
          .callsTo("DELETE", "/qemu/9001")
          .every((c) => !JSON.stringify(c).includes("skiplock")),
      ).toBe(true);
    } finally {
      await s.close();
    }
  });
});

describe("booléens dans la chaîne de requête", () => {
  it("DELETE envoie purge=1 et destroy-unreferenced-disks=1 (Proxmox refuse « true »)", async () => {
    const paths: string[] = [];
    const client = new ProxmoxClient({
      host: "pve.test",
      port: 8006,
      token: TOKEN,
      tls: { mode: "verify" },
      transport: async (req) => {
        paths.push(req.path);
        return {
          status: 200,
          body: '{"data":"UPID:pve:1:2:3:qmdestroy:1:u:"}',
        };
      },
    });
    await client.deleteVm("pve", 10_000);
    expect(paths[0]).toContain("purge=1");
    expect(paths[0]).toContain("destroy-unreferenced-disks=1");
    expect(paths[0]).not.toContain("true");
  });
});
