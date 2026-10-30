import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  codeDeviceCodes,
  codeWorkspaces,
  organizations,
  users,
} from "./schema.ts";
import { createTestDatabase, type TestDatabase } from "./testing.ts";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

const hex = (n = 8) => randomBytes(n).toString("hex");

async function person() {
  const org = `org_${hex(6)}`;
  const user = `usr_${hex(6)}`;
  await t.db.insert(organizations).values({ id: org, name: org, slug: org });
  await t.db
    .insert(users)
    .values({ id: user, name: "Marie", email: `${user}@example.com` });
  return { org, user };
}

const workspaceRow = (p: { org: string; user: string }, port: number) => ({
  organizationId: p.org,
  userId: p.user,
  proxyId: hex(16),
  containerName: `code-${hex(6)}`,
  volumeName: `code-vol-${hex(6)}`,
  port,
});

describe("migration 0029 : codes d'appareil", () => {
  it("le hachage du code d'appareil et celui du code d'utilisateur sont uniques", async () => {
    const base = {
      deviceName: "poste-de-marie",
      client: "nexora-code",
      expiresAt: new Date(Date.now() + 600_000),
    };
    const deviceCodeHash = hex(32);
    const userCodeHash = hex(32);
    await t.db
      .insert(codeDeviceCodes)
      .values({ ...base, deviceCodeHash, userCodeHash });
    await expect(
      t.db
        .insert(codeDeviceCodes)
        .values({ ...base, deviceCodeHash, userCodeHash: hex(32) }),
    ).rejects.toThrow();
    await expect(
      t.db
        .insert(codeDeviceCodes)
        .values({ ...base, deviceCodeHash: hex(32), userCodeHash }),
    ).rejects.toThrow();
  });

  it("un code naît en attente, sans clé ni personne", async () => {
    const [row] = await t.db
      .insert(codeDeviceCodes)
      .values({
        deviceName: "x",
        client: "nexora-code",
        deviceCodeHash: hex(32),
        userCodeHash: hex(32),
        expiresAt: new Date(Date.now() + 1000),
      })
      .returning();
    expect(row?.status).toBe("pending");
    expect(row?.approvedUserId).toBeNull();
    expect(row?.apiKeyId).toBeNull();
    expect(row?.deliveredAt).toBeNull();
  });

  it("refuse un état inconnu", async () => {
    await expect(
      t.db.insert(codeDeviceCodes).values({
        deviceName: "x",
        client: "nexora-code",
        deviceCodeHash: hex(32),
        userCodeHash: hex(32),
        expiresAt: new Date(),
        status: "bizarre",
      }),
    ).rejects.toThrow();
  });
});

describe("migration 0029 : environnements hébergés", () => {
  it("un seul environnement par personne et par organisation", async () => {
    const p = await person();
    await t.db.insert(codeWorkspaces).values(workspaceRow(p, 20_001));
    await expect(
      t.db.insert(codeWorkspaces).values(workspaceRow(p, 20_002)),
    ).rejects.toThrow();
  });

  it("le port, le nom du conteneur et le volume sont uniques", async () => {
    const a = await person();
    const b = await person();
    await t.db.insert(codeWorkspaces).values(workspaceRow(a, 20_010));
    await expect(
      t.db.insert(codeWorkspaces).values(workspaceRow(b, 20_010)),
    ).rejects.toThrow();
  });

  it("naît arrêté, sans octet compté, et refuse un état ou un volume négatif", async () => {
    const p = await person();
    const [row] = await t.db
      .insert(codeWorkspaces)
      .values(workspaceRow(p, 20_020))
      .returning();
    expect(row?.desiredStatus).toBe("stopped");
    expect(row?.accountedBytes).toBe(0n);
    expect(row?.quotaBlocked).toBe(false);
    const q = await person();
    await expect(
      t.db
        .insert(codeWorkspaces)
        .values({ ...workspaceRow(q, 20_021), accountedBytes: -1n }),
    ).rejects.toThrow();
    const r = await person();
    await expect(
      t.db
        .insert(codeWorkspaces)
        .values({ ...workspaceRow(r, 20_022), desiredStatus: "ailleurs" }),
    ).rejects.toThrow();
  });
});
