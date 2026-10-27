import { eq, proxmoxServers } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../servers.ts";
import { SIM_POOL } from "../testing.ts";
import { availableServerCode } from "./connect.ts";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

const add = (code: string, host: string, port = 8006) =>
  createServer(t.db, {
    code,
    name: code,
    host,
    port,
    node: "pve",
    capacity: { vcpu: 1, ramMb: 1, diskGb: 1 },
    ipPool: SIM_POOL,
  });

describe("identifiant proposé, sans collision", () => {
  it("serveur inconnu : l'identifiant tiré de l'adresse", async () => {
    expect(await availableServerCode(t.db, "pve.exemple.ca", 8006)).toBe(
      "pve-exemple-ca",
    );
  });

  it("même adresse et même port qu'un serveur connu : son identifiant, pour que « Connecter » rejoué retombe sur la même fiche", async () => {
    await add("mon-serveur", "10.1.1.1", 8006);
    expect(await availableServerCode(t.db, "10.1.1.1", 8006)).toBe(
      "mon-serveur",
    );
  });

  it("identifiant pris par un autre serveur (autre port) : suffixe numérique", async () => {
    await add("pve-10-2-2-2", "10.2.2.2", 8006);
    expect(await availableServerCode(t.db, "10.2.2.2", 9006)).toBe(
      "pve-10-2-2-2-2",
    );
    await add("pve-10-2-2-2-2", "10.2.2.2", 9006);
    expect(await availableServerCode(t.db, "10.2.2.2", 9007)).toBe(
      "pve-10-2-2-2-3",
    );
  });

  it("reste valide même quand le début est long", async () => {
    const long = "a".repeat(60);
    const code = await availableServerCode(t.db, `${long}.exemple.ca`, 8006);
    await add(code, "9.9.9.9");
    const next = await availableServerCode(t.db, `${long}.exemple.ca`, 1234);
    expect(next).toMatch(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/);
    expect(next).not.toBe(code);
    expect(
      await t.db
        .select()
        .from(proxmoxServers)
        .where(eq(proxmoxServers.code, next)),
    ).toHaveLength(0);
  });
});
