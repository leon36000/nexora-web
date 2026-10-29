import { randomBytes } from "node:crypto";
import { type Database, organizations } from "@nexora/db";

/** Organisation jetable pour les essais du paquet. */
export async function newOrganization(db: Database): Promise<string> {
  const id = `org_${randomBytes(6).toString("hex")}`;
  await db.insert(organizations).values({ id, name: id, slug: id });
  return id;
}
