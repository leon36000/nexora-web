import { randomBytes } from "node:crypto";
import * as schema from "@nexora/db";
import { getAuthTables } from "better-auth/db";
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createAuth } from "./index";
import { createMemoryMailer } from "./mailer";

// Les tables Drizzle écrites à la main (packages/db/src/schema-auth.ts) doivent suivre exactement
// ce que Better Auth attend, y compris après une mise à jour du paquet : ce test échoue sur toute dérive.
describe("tables d'authentification vs schéma attendu par Better Auth", () => {
  const auth = createAuth({
    db: {} as never,
    secret: randomBytes(32).toString("hex"),
    baseURL: "http://localhost:3500",
    mailer: createMemoryMailer(),
  });
  const expected = getAuthTables(auth.options);
  const drizzleTables = {
    user: schema.users,
    session: schema.sessions,
    account: schema.accounts,
    verification: schema.verifications,
    organization: schema.organizations,
    member: schema.members,
    invitation: schema.invitations,
    rateLimit: schema.authRateLimits,
  } as const;

  it("couvre tous les modèles attendus", () => {
    expect(Object.keys(expected).sort()).toEqual(
      Object.keys(drizzleTables).sort(),
    );
  });

  for (const [model, table] of Object.entries(drizzleTables)) {
    it(`${model} : chaque champ attendu existe, avec la bonne obligation`, () => {
      const columns = getTableColumns(table) as Record<
        string,
        { notNull: boolean }
      >;
      const fields = expected[model]?.fields as Record<
        string,
        { required?: boolean }
      >;
      for (const [name, field] of Object.entries(fields)) {
        const column = columns[name];
        expect(column, `${model}.${name}`).toBeDefined();
        // Un champ requis par Better Auth ne peut pas être nullable en base.
        if (field.required !== false)
          expect(column?.notNull, `${model}.${name} doit être NOT NULL`).toBe(
            true,
          );
      }
    });
  }
});
