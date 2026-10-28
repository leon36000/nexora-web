import type { proxmoxServers } from "@nexora/db";
import { describe, expect, it } from "vitest";
import { ConnectError, connectServer } from "./connect/connect.ts";
import { ProxmoxError } from "./proxmox/client.ts";
import { proxmoxClientFactory } from "./servers.ts";

type Server = typeof proxmoxServers.$inferSelect;
const server = (host: string) =>
  ({
    host,
    port: 8006,
    tokenRef: "proxmox.pve1",
    tlsMode: "verify",
    tlsFingerprint: null,
  }) as Server;

describe("jeton Proxmox : hôte contrôlé avant toute lecture du coffre (R9)", () => {
  it("le client n'est pas créé et le jeton n'est pas lu quand l'hôte n'est pas autorisé", async () => {
    const reads: string[] = [];
    const factory = proxmoxClientFactory({
      getSecret: async (ref) => {
        reads.push(ref);
        return "nexora@pve!x=00000000-0000-0000-0000-000000000000";
      },
      checkHost: (host) =>
        host === "pve1.lan" ? null : `hôte « ${host} » refusé`,
    });
    await expect(
      factory(server("collecte.pirate.example")),
    ).rejects.toMatchObject({ name: "ProxmoxError", code: "host_not_allowed" });
    expect(reads).toEqual([]);
    await expect(factory(server("https://pve1.lan"))).resolves.toBeDefined();
    expect(reads).toEqual(["proxmox.pve1"]);
    expect(ProxmoxError).toBeDefined();
  });

  it("« Connecter » refuse l'hôte avant de lire le jeton et l'explique", async () => {
    const reads: string[] = [];
    const attempt = connectServer(
      undefined as never,
      {
        getSecret: async (ref) => {
          reads.push(ref);
          return "x";
        },
        checkHost: (host) => `hôte « ${host} » refusé`,
      },
      {
        code: "pve-r9",
        host: "collecte.pirate.example",
        tokenRef: "proxmox.pve-r9",
        tlsMode: "verify",
        tlsFingerprint: null,
      },
    );
    await expect(attempt).rejects.toBeInstanceOf(ConnectError);
    await expect(attempt).rejects.toThrow(/collecte\.pirate\.example/);
    expect(reads).toEqual([]);
  });
});
