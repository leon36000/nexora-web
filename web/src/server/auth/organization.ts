import { randomBytes } from "node:crypto";
import {
  creditAccounts,
  type Database,
  eq,
  members,
  organizations,
  users,
} from "@nexora/db";

/**
 * Une organisation par compte, créée à l'inscription (le propriétaire est le créateur). Idempotent
 * et sérialisé par utilisateur (verrou de ligne) : rejoué par l'hameçon d'inscription ET à la
 * création de session, il ne crée jamais deux organisations.
 */
export async function ensureUserOrganization(
  db: Database,
  userId: string,
): Promise<{ id: string; name: string }> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!user) throw new Error("utilisateur introuvable");

    const [existing] = await tx
      .select({ id: organizations.id, name: organizations.name })
      .from(members)
      .innerJoin(organizations, eq(organizations.id, members.organizationId))
      .where(eq(members.userId, userId))
      .orderBy(members.createdAt)
      .limit(1);
    if (existing) return existing;

    const name =
      user.company?.trim() ||
      (user.locale === "en"
        ? `${user.name}’s organization`
        : `Organisation de ${user.name}`);
    const id = randomBytes(16).toString("hex");
    const [org] = await tx
      .insert(organizations)
      .values({ id, name, slug: slugify(name, id) })
      .returning({ id: organizations.id, name: organizations.name });
    if (!org) throw new Error("organisation non créée");
    await tx.insert(members).values({
      id: randomBytes(16).toString("hex"),
      organizationId: org.id,
      userId,
      role: "owner",
    });
    await tx
      .insert(creditAccounts)
      .values({ organizationId: org.id })
      .onConflictDoNothing();
    return org;
  });
}

function slugify(name: string, id: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "org"}-${id.slice(0, 8)}`;
}
