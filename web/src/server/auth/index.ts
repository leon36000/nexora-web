import * as schema from "@nexora/db";
import { and, type Database, eq, isNull, ne } from "@nexora/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { createAccessControl } from "better-auth/plugins/access";
import { organization } from "better-auth/plugins/organization";
import {
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";
import { twoFactor } from "better-auth/plugins/two-factor";
import { MIN_PASSWORD_LENGTH } from "@/lib/account-rules";
import {
  newSignInEmail,
  normalizeLocale,
  resetPasswordEmail,
  verificationEmail,
} from "./emails";
import {
  clearLoginFailures,
  lockedForMs,
  recordLoginFailure,
  sanitizeDisplayName,
} from "./lockout";
import type { Mailer } from "./mailer";
import { ensureUserOrganization } from "./organization";
import {
  type BreachChecker,
  checkPasswordPolicy,
  MAX_PASSWORD_LENGTH,
  type PasswordProblem,
} from "./password-policy";

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
  /** Vérification des mots de passe contre les fuites connues (HIBP) ; `null` renvoyé : service indisponible, on laisse passer. */
  breachCheck?: BreachChecker;
  /** Horloge (tests du verrouillage). */
  now?: () => number;
  log?: (message: string, fields?: Record<string, unknown>) => void;
}

export { MIN_PASSWORD_LENGTH };

// Deux rôles seulement (D11) : propriétaire et membre.
const ac = createAccessControl(defaultStatements);
const ROLES = {
  owner: ac.newRole(ownerAc.statements),
  member: ac.newRole(memberAc.statements),
};

function isApiErrorLike(value: unknown): value is { statusCode: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { statusCode?: unknown }).statusCode === "number"
  );
}

/** Compte du personnel actif (drapeau posé depuis l'administration, non révoqué). */
async function isActiveStaff(db: Database, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: schema.staffAccounts.userId })
    .from(schema.staffAccounts)
    .where(
      and(
        eq(schema.staffAccounts.userId, userId),
        isNull(schema.staffAccounts.revokedAt),
      ),
    );
  return Boolean(row);
}

const PASSWORD_ERRORS: Record<PasswordProblem, [string, string]> = {
  too_short: ["PASSWORD_TOO_SHORT", "Mot de passe trop court."],
  too_long: ["PASSWORD_TOO_LONG", "Mot de passe trop long."],
  common: ["PASSWORD_TOO_COMMON", "Mot de passe trop courant."],
  personal: ["PASSWORD_PERSONAL", "Mot de passe tiré de vos informations."],
  breached: [
    "PASSWORD_COMPROMISED",
    "Mot de passe vu dans une fuite de données.",
  ],
};

function passwordError(problem: PasswordProblem): APIError {
  const [code, message] = PASSWORD_ERRORS[problem];
  return new APIError("BAD_REQUEST", { message, code });
}

async function passwordProblem(
  password: string,
  context: { email?: string; name?: string },
  breachCheck: BreachChecker | undefined,
): Promise<PasswordProblem | null> {
  const local = checkPasswordPolicy(password, context);
  if (local) return local;
  if (breachCheck && (await breachCheck(password)) === true) return "breached";
  return null;
}

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
  const now = options.now ?? Date.now;
  const sendInBackground = (promise: Promise<void>) => {
    promise.catch((error: unknown) =>
      log("auth : échec d'envoi de courriel", {
        errorName: error instanceof Error ? error.name : typeof error,
      }),
    );
  };

  /** Première connexion : rien. Ensuite : un courriel si l'adresse n'a jamais servi à ouvrir une session de ce compte. */
  const notifyUnusualSignIn = async (session: {
    id: string;
    userId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }) => {
    const ip = session.ipAddress?.trim();
    if (!ip) return;
    const previous = await db
      .select({ ip: schema.sessions.ipAddress })
      .from(schema.sessions)
      .where(
        and(
          eq(schema.sessions.userId, session.userId),
          ne(schema.sessions.id, session.id),
        ),
      )
      .limit(500);
    if (previous.length === 0 || previous.some((row) => row.ip === ip)) return;
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, session.userId));
    if (!user) return;
    sendInBackground(
      mailer.send(
        newSignInEmail({
          to: user.email,
          name: user.name,
          ip,
          userAgent: session.userAgent ?? "",
          at: new Date(now()),
          lang: normalizeLocale(user.locale),
        }),
      ),
    );
  };

  return betterAuth({
    appName: "Nexora AI",
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
        twoFactor: schema.twoFactors,
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
      maxPasswordLength: MAX_PASSWORD_LENGTH,
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
        "/change-password": { window: 60, max: 5 },
        "/get-session": { window: 60, max: 60 },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const body = (ctx.body ?? {}) as Record<string, unknown>;
        if (ctx.path === "/sign-up/email") {
          const name = sanitizeDisplayName(body.name);
          if (!name)
            throw new APIError("BAD_REQUEST", {
              message: "Nom invalide.",
              code: "INVALID_NAME",
            });
          const problem = await passwordProblem(
            String(body.password ?? ""),
            { email: String(body.email ?? ""), name },
            options.breachCheck,
          );
          if (problem) throw passwordError(problem);
          return { context: { ...ctx, body: { ...body, name } } };
        }
        if (ctx.path === "/reset-password" || ctx.path === "/change-password") {
          const problem = await passwordProblem(
            String(body.newPassword ?? ""),
            {},
            options.breachCheck,
          );
          if (problem) throw passwordError(problem);
          return;
        }
        if (ctx.path === "/sign-in/email" && typeof body.email === "string") {
          const wait = await lockedForMs(db, body.email, now());
          if (wait > 0)
            throw new APIError(
              "TOO_MANY_REQUESTS",
              {
                message: "Trop d’échecs : réessayez plus tard.",
                code: "ACCOUNT_TEMPORARILY_LOCKED",
              },
              { "Retry-After": String(Math.ceil(wait / 1000)) },
            );
          return;
        }
        // Un appareil « de confiance » contournerait la double authentification pendant 30 jours : refusé.
        if (
          ctx.path === "/two-factor/verify-totp" ||
          ctx.path === "/two-factor/verify-backup-code" ||
          ctx.path === "/two-factor/verify-otp"
        ) {
          if (body.trustDevice)
            return {
              context: { ...ctx, body: { ...body, trustDevice: false } },
            };
          return;
        }
        // Les comptes du personnel ne peuvent pas retirer leur double authentification.
        if (ctx.path === "/two-factor/disable") {
          const session = await getSessionFromCtx(ctx);
          if (session && (await isActiveStaff(db, session.user.id)))
            throw new APIError("FORBIDDEN", {
              message:
                "La double authentification est obligatoire pour un compte du personnel.",
              code: "TWO_FACTOR_REQUIRED_FOR_STAFF",
            });
          return;
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-in/email") return;
        const email = (ctx.body as { email?: unknown } | undefined)?.email;
        if (typeof email !== "string") return;
        const returned = ctx.context.returned;
        if (returned instanceof Error || isApiErrorLike(returned)) {
          if (isApiErrorLike(returned) && returned.statusCode === 401)
            await recordLoginFailure(db, email, now());
          return;
        }
        // Succès du mot de passe (ou étape de double authentification en attente) : le compteur repart de zéro.
        await clearLoginFailures(db, email);
      }),
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
              data: {
                ...user,
                name: sanitizeDisplayName(user.name) ?? "Client",
                locale: normalizeLocale(extra.locale),
                company,
              },
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
          // Connexion depuis une adresse jamais vue sur ce compte : avertissement par courriel (hors première connexion).
          after: async (session) => {
            try {
              await notifyUnusualSignIn(session);
            } catch (error) {
              log("auth : avertissement de connexion non envoyé", {
                errorName: error instanceof Error ? error.name : typeof error,
              });
            }
          },
        },
      },
    },
    plugins: [
      twoFactor({
        issuer: "Nexora AI",
        totpOptions: { digits: 6, period: 30 },
        backupCodeOptions: {
          amount: 10,
          length: 10,
          storeBackupCodes: "encrypted",
        },
      }),
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
