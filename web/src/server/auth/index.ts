import type { Database } from "@nexora/db";
import * as schema from "@nexora/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { createAccessControl } from "better-auth/plugins/access";
import { organization } from "better-auth/plugins/organization";
import {
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";
import {
  normalizeLocale,
  resetPasswordEmail,
  verificationEmail,
} from "./emails";
import type { Mailer } from "./mailer";
import { ensureUserOrganization } from "./organization";

export interface CreateAuthOptions {
  db: Database;
  /** Secret de signature des témoins et jetons : 32 caractères au moins (BETTER_AUTH_SECRET). */
  secret: string;
  /** Adresse publique du site (sans barre finale). */
  baseURL: string;
  mailer: Mailer;
  trustedOrigins?: string[];
  /** Désactivable pour les tests qui ne portent pas sur la limitation de débit. */
  rateLimit?: { enabled?: boolean };
  /** Témoins `Secure` (HTTPS) : activé hors développement. */
  secureCookies?: boolean;
  log?: (message: string, fields?: Record<string, unknown>) => void;
}

export const MIN_PASSWORD_LENGTH = 10;

// Deux rôles seulement (D11) : propriétaire et membre.
const ac = createAccessControl(defaultStatements);
const ROLES = {
  owner: ac.newRole(ownerAc.statements),
  member: ac.newRole(memberAc.statements),
};

/**
 * Authentification des clients : courriel + mot de passe, vérification du courriel, réinitialisation,
 * sessions, organisations (propriétaire/membre). Distincte des comptes Directus (D4).
 *
 * - CSRF : contrôle d'origine intégré à Better Auth (origines de confiance = le site seulement) et
 *   témoins HttpOnly + SameSite=Lax.
 * - Limitation de débit : en base (partagée entre instances), règles serrées sur les routes sensibles.
 *   L'adresse client vient de `x-forwarded-for` : le proxy frontal doit la renseigner et écraser
 *   toute valeur envoyée par le client.
 * - Une organisation par compte, créée à l'inscription ; pas de création ni de suppression
 *   d'organisation par l'API, pas d'invitation de membres dans ce jalon.
 */
export function createAuth(options: CreateAuthOptions) {
  if (options.secret.length < 32)
    throw new Error("BETTER_AUTH_SECRET : 32 caractères au moins");
  const { db, mailer } = options;
  const log = options.log ?? (() => {});

  /** Envoi sans attendre la réponse SMTP : le temps de réponse ne révèle pas l'existence d'un compte. */
  const sendInBackground = (promise: Promise<void>) => {
    promise.catch((error: unknown) =>
      log("auth : échec d'envoi de courriel", {
        errorName: error instanceof Error ? error.name : typeof error,
      }),
    );
  };

  return betterAuth({
    appName: "Nexora",
    baseURL: options.baseURL,
    secret: options.secret,
    trustedOrigins: options.trustedOrigins ?? [options.baseURL],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
        organization: schema.organizations,
        member: schema.members,
        invitation: schema.invitations,
        rateLimit: schema.authRateLimits,
      },
    }),
    user: {
      additionalFields: {
        locale: {
          type: "string",
          required: false,
          defaultValue: "fr",
          input: true,
        },
        company: { type: "string", required: false, input: true },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 3600,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        sendInBackground(
          mailer.send(
            resetPasswordEmail({
              to: user.email,
              name: user.name,
              url,
              lang: normalizeLocale((user as { locale?: unknown }).locale),
            }),
          ),
        );
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 3600,
      sendVerificationEmail: async ({ user, url }) => {
        sendInBackground(
          mailer.send(
            verificationEmail({
              to: user.email,
              name: user.name,
              url,
              lang: normalizeLocale((user as { locale?: unknown }).locale),
            }),
          ),
        );
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: {
      enabled: options.rateLimit?.enabled ?? true,
      storage: "database",
      modelName: "rateLimit",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 3 },
        "/reset-password": { window: 60, max: 5 },
        "/send-verification-email": { window: 60, max: 3 },
      },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
      // Explicite : Better Auth désactive ces contrôles par défaut quand il détecte un environnement
      // de test ; ils doivent rester actifs partout (CSRF : origine vérifiée dès qu'un témoin est présent).
      disableOriginCheck: false,
      disableCSRFCheck: false,
      useSecureCookies: options.secureCookies ?? false,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const extra = user as Record<string, unknown>;
            const company =
              typeof extra.company === "string"
                ? extra.company.trim().slice(0, 120) || null
                : null;
            return {
              data: { ...user, locale: normalizeLocale(extra.locale), company },
            };
          },
          after: async (user) => {
            await ensureUserOrganization(db, user.id);
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const org = await ensureUserOrganization(db, session.userId);
            return { data: { ...session, activeOrganizationId: org.id } };
          },
        },
      },
    },
    plugins: [
      organization({
        ac,
        roles: ROLES,
        creatorRole: "owner",
        allowUserToCreateOrganization: false,
        organizationLimit: 1,
        membershipLimit: 25,
        disableOrganizationDeletion: true,
        organizationHooks: {
          // Pas d'invitation dans ce jalon : une organisation par compte, un seul propriétaire.
          beforeCreateInvitation: async () => {
            throw new APIError("FORBIDDEN", {
              message: "Les invitations ne sont pas disponibles.",
            });
          },
          beforeUpdateMemberRole: async ({ newRole }) => {
            if (newRole !== "owner" && newRole !== "member")
              throw new APIError("BAD_REQUEST", { message: "Rôle inconnu." });
          },
        },
      }),
    ],
  });
}

export type NexoraAuth = ReturnType<typeof createAuth>;
export { createMemoryMailer, createSmtpMailer, type Mailer } from "./mailer";
