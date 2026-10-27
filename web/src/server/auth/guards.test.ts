import { randomBytes } from "node:crypto";
import { members, organizations, users } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OrgAccessError, requireOrgMember, resolveOrgContext } from "./guards";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

const id = () => randomBytes(8).toString("hex");

async function account(role: "owner" | "member" = "owner") {
  const userId = id();
  const orgId = id();
  await t.db.insert(users).values({
    id: userId,
    name: "N",
    email: `${userId}@example.com`,
  });
  await t.db
    .insert(organizations)
    .values({ id: orgId, name: orgId, slug: orgId });
  await t.db
    .insert(members)
    .values({ id: id(), organizationId: orgId, userId, role });
  return { userId, orgId };
}

describe("requireOrgMember", () => {
  it("accepte un membre de l'organisation et renvoie son rôle", async () => {
    const a = await account("owner");
    expect(await requireOrgMember(t.db, a.userId, a.orgId)).toEqual({
      role: "owner",
    });
  });

  it("refuse un utilisateur qui n'est pas membre de cette organisation", async () => {
    const a = await account();
    const b = await account();
    await expect(
      requireOrgMember(t.db, b.userId, a.orgId),
    ).rejects.toMatchObject({
      name: "OrgAccessError",
      code: "forbidden",
    });
  });

  it("refuse un identifiant d'organisation inexistant ou vide", async () => {
    const a = await account();
    for (const bad of ["", "org_inexistante", "' OR 1=1 --"])
      await expect(
        requireOrgMember(t.db, a.userId, bad),
      ).rejects.toBeInstanceOf(OrgAccessError);
  });

  it("exige le rôle demandé : un membre n'est pas propriétaire", async () => {
    const owner = await account("owner");
    const memberUser = id();
    await t.db.insert(users).values({
      id: memberUser,
      name: "M",
      email: `${memberUser}@example.com`,
    });
    await t.db.insert(members).values({
      id: id(),
      organizationId: owner.orgId,
      userId: memberUser,
      role: "member",
    });
    expect(await requireOrgMember(t.db, memberUser, owner.orgId)).toEqual({
      role: "member",
    });
    await expect(
      requireOrgMember(t.db, memberUser, owner.orgId, ["owner"]),
    ).rejects.toMatchObject({ code: "insufficient_role" });
    await expect(
      requireOrgMember(t.db, owner.userId, owner.orgId, ["owner"]),
    ).resolves.toEqual({ role: "owner" });
  });

  it("refuse un rôle inconnu en base (échoue fermé)", async () => {
    const a = await account();
    const userId = id();
    await t.db
      .insert(users)
      .values({ id: userId, name: "X", email: `${userId}@example.com` });
    await t.db.insert(members).values({
      id: id(),
      organizationId: a.orgId,
      userId,
      role: "superadmin",
    });
    await expect(requireOrgMember(t.db, userId, a.orgId)).rejects.toMatchObject(
      { code: "forbidden" },
    );
  });
});

describe("resolveOrgContext", () => {
  it("garde l'organisation active de la session quand l'utilisateur en est membre", async () => {
    const a = await account();
    expect(await resolveOrgContext(t.db, a.userId, a.orgId)).toEqual({
      organizationId: a.orgId,
      role: "owner",
    });
  });

  it("ignore une organisation active dont l'utilisateur n'est pas membre et retombe sur la sienne", async () => {
    const a = await account();
    const b = await account();
    expect(await resolveOrgContext(t.db, b.userId, a.orgId)).toEqual({
      organizationId: b.orgId,
      role: "owner",
    });
  });

  it("renvoie null si l'utilisateur n'a aucune organisation", async () => {
    const userId = id();
    await t.db
      .insert(users)
      .values({ id: userId, name: "Seul", email: `${userId}@example.com` });
    expect(await resolveOrgContext(t.db, userId, null)).toBeNull();
  });
});
