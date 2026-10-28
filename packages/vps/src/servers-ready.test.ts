import { eq, proxmoxServers } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProxmoxSimulator } from "./proxmox/simulator.ts";
import {
  createServer,
  createTemplate,
  proxmoxClientFactory,
  testServerConnection,
} from "./servers.ts";
import { SIM_POOL, SIM_TOKEN } from "./testing.ts";

let t: TestDatabase;
let sim: ProxmoxSimulator;
let port = 0;
let stop: () => Promise<void>;
beforeAll(async () => {
  t = await createTestDatabase();
  sim = new ProxmoxSimulator({ token: SIM_TOKEN });
  const s = await sim.start();
  port = s.port;
  stop = s.close;
});
afterAll(async () => {
  await stop();
  await t.drop();
});

const client = proxmoxClientFactory({
  getSecret: async () => SIM_TOKEN,
  checkHost: () => null,
});
let n = 0;
async function server(over: Partial<Parameters<typeof createServer>[1]> = {}) {
  return createServer(t.db, {
    code: `prete-${++n}`,
    name: "x",
    host: "http://127.0.0.1",
    port,
    node: "pve1",
    capacity: { vcpu: 4, ramMb: 4096, diskGb: 100 },
    ipPool: SIM_POOL,
    tokenRef: "proxmox.t",
    ...over,
  });
}

describe("« prêt » seulement si tout est vérifié", () => {
  it("Proxmox répond mais aucun gabarit n'est prêt : le test réussit, le serveur reste en brouillon", async () => {
    const s = await server();
    const r = await testServerConnection(t.db, s.id, { client });
    expect(r.ok).toBe(true);
    expect(r.server.state).toBe("draft");
    expect(r.detail).toMatch(/aucun gabarit/i);
  });

  it("un gabarit prêt sur le nœud : le serveur passe prêt", async () => {
    const s = await server();
    await createTemplate(t.db, {
      serverId: s.id,
      code: "debian-12-ci",
      name: "Debian",
      os: "debian",
      osVersion: "12",
      vmid: 9000,
    });
    const r = await testServerConnection(t.db, s.id, { client });
    expect(r.server.state).toBe("ready");
  });

  it("bloc d'adresses vide (fiche créée par « Connecter » et pas encore complétée) : jamais prêt", async () => {
    const s = await server();
    await createTemplate(t.db, {
      serverId: s.id,
      code: "debian-12-ci",
      name: "Debian",
      os: "debian",
      osVersion: "12",
      vmid: 9000,
    });
    await t.db
      .update(proxmoxServers)
      .set({ ipPool: { ...SIM_POOL, ranges: [] } })
      .where(eq(proxmoxServers.id, s.id));
    const r = await testServerConnection(t.db, s.id, { client });
    expect(r.server.state).toBe("draft");
    expect(r.detail).toMatch(/adresses/i);
  });
});
