import { randomBytes } from "node:crypto";
import * as schema from "@nexora/db";
import { getAuthTables } from "better-auth/db";
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createAuth } from "./index";
import { createMemoryMailer } from "./mailer";
import { resolveWorkstudioOidc } from "./workstudio-oidc";

// Les tables Drizzle écrites à la main (packages/db/src/schema-auth.ts) doivent suivre exactement
// ce que Better Auth attend, y compris après une mise à jour du paquet : ce test échoue sur toute dérive.
const BASE_MODELS = {
  user: schema.users,
  session: schema.sessions,
  account: schema.accounts,
  verification: schema.verifications,
  organization: schema.organizations,
  member: schema.members,
  invitation: schema.invitations,
  rateLimit: schema.authRateLimits,
  twoFactor: schema.twoFactors,
} as const;

// Fournisseur OIDC de WorkStudio (plugins `jwt` et `@better-auth/oauth-provider`) : présentes seulement s'il est actif.
const OIDC_MODELS = {
  jwks: schema.jwks,
  oauthClient: schema.oauthClients,
  oauthResource: schema.oauthResources,
  oauthClientResource: schema.oauthClientResources,
  oauthRefreshToken: schema.oauthRefreshTokens,
  oauthAccessToken: schema.oauthAccessTokens,
  oauthConsent: schema.oauthConsents,
  oauthClientAssertion: schema.oauthClientAssertions,
} as const;

const DATA_TYPES: Record<string, string> = {
  string: "string",
  number: "number",
  boolean: "boolean",
  date: "date",
  json: "json",
  "string[]": "array",
};

function makeAuth(withOidc: boolean) {
  const workstudio = withOidc
    ? resolveWorkstudioOidc(
        {
          WORKSTUDIO_OIDC_CLIENT_ID: "workstudio-schema-test",
          WORKSTUDIO_OIDC_CLIENT_SECRET: "x".repeat(40),
          WORKSTUDIO_PUBLIC_URL: "https://studio.example.test",
        },
        {},
      ).config
    : null;
  return createAuth({
    db: {} as never,
    secret: randomBytes(32).toString("hex"),
    baseURL: "http://localhost:3500",
    mailer: createMemoryMailer(),
    workstudio,
  });
}

// Les tables Drizzle écrites à la main (packages/db/src/schema-*.ts) doivent suivre exactement
// ce que Better Auth attend, y compris après une mise à jour du paquet : ce test échoue sur toute dérive.
for (const withOidc of [false, true]) {
  describe(`tables d'authentification vs schéma attendu par Better Auth (fournisseur OIDC ${withOidc ? "actif" : "inactif"})`, () => {
    const auth = makeAuth(withOidc);
    const expected = getAuthTables(auth.options);
    const drizzleTables: Record<string, unknown> = withOidc
      ? { ...BASE_MODELS, ...OIDC_MODELS }
      : { ...BASE_MODELS };

    it("couvre tous les modèles attendus, et seulement eux", () => {
      expect(Object.keys(expected).sort()).toEqual(
        Object.keys(drizzleTables).sort(),
      );
    });

    for (const [model, table] of Object.entries(drizzleTables)) {
      it(`${model} : chaque champ attendu existe, avec la bonne obligation et le bon type`, () => {
        const columns = getTableColumns(table as never) as Record<
          string,
          { notNull: boolean; dataType: string }
        >;
        const fields = expected[model]?.fields as Record<
          string,
          { required?: boolean; type: string }
        >;
        for (const [name, field] of Object.entries(fields)) {
          const column = columns[name];
          expect(column, `${model}.${name}`).toBeDefined();
          // Un champ requis par Better Auth ne peut pas être nullable en base.
          if (field.required !== false)
            expect(column?.notNull, `${model}.${name} doit être NOT NULL`).toBe(
              true,
            );
          if (DATA_TYPES[field.type] !== undefined)
            expect(column?.dataType, `${model}.${name} : type`).toBe(
              DATA_TYPES[field.type],
            );
        }
      });
    }
  });
}
