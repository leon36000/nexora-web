import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Tables de l'authentification des clients (Better Auth, jalon S4). Les noms de colonnes suivent
 * le schéma du paquet (un test compare ces tables à `getAuthTables`) ; les noms de tables sont
 * au pluriel. Ces comptes sont distincts de ceux de Directus (D4 : tout ce qui porte un
 * identifiant client vit dans la base « app »).
 */
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    /** Langue d'interface choisie à l'inscription (courriels dans la bonne langue). */
    locale: text("locale").notNull().default("fr"),
    /** Nom de l'entreprise saisi à l'inscription (nom de l'organisation créée). */
    company: text("company"),
    /** Double authentification activée (TOTP vérifié) : exigée des comptes du personnel (plugin `twoFactor`). */
    twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activeOrganizationId: text("active_organization_id"),
  },
  (t) => [
    uniqueIndex("sessions_token_unique").on(t.token),
    index("sessions_user_idx").on(t.userId),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    /** Empreinte du mot de passe (scrypt de Better Auth) ; jamais le mot de passe. */
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

export const organizations = pgTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    logo: text("logo"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    metadata: text("metadata"),
  },
  (t) => [uniqueIndex("organizations_slug_unique").on(t.slug)],
);

/** Rôles de l'espace client : propriétaire (`owner`) et membre (`member`) seulement. */
export const ORG_ROLES = ["owner", "member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const members = pgTable(
  "members",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("members_org_user_unique").on(t.organizationId, t.userId),
    index("members_user_idx").on(t.userId),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [index("invitations_org_idx").on(t.organizationId)],
);

/** Limitation de débit de Better Auth (stockage en base : partagé entre les instances). */
export const authRateLimits = pgTable(
  "auth_rate_limits",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    count: integer("count").notNull(),
    lastRequest: bigint("last_request", { mode: "number" }).notNull(),
  },
  (t) => [uniqueIndex("auth_rate_limits_key_unique").on(t.key)],
);

/**
 * Double authentification (plugin `twoFactor` de Better Auth) : secret TOTP et codes de secours, tous deux
 * CHIFFRÉS par Better Auth avec `BETTER_AUTH_SECRET` (jamais en clair en base). `verified` reste faux tant que
 * le premier code n'a pas été saisi ; `failedVerificationCount` / `lockedUntil` : verrouillage du compte après
 * des échecs consécutifs de vérification.
 */
export const twoFactors = pgTable(
  "two_factors",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    verified: boolean("verified").notNull().default(true),
    failedVerificationCount: integer("failed_verification_count")
      .notNull()
      .default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (t) => [
    index("two_factors_user_idx").on(t.userId),
    index("two_factors_secret_idx").on(t.secret),
  ],
);

/**
 * Verrouillage progressif des connexions par courriel (empreinte SHA-256 du courriel en minuscules : la table
 * ne contient jamais d'adresse, et existe aussi pour des adresses sans compte, donc aucune énumération).
 * Après 5 échecs consécutifs, le délai double à chaque échec de plus (1 min, 2 min… plafonné à 30 min) ; une
 * connexion réussie remet le compteur à zéro.
 */
export const authLockouts = pgTable("auth_lockouts", {
  key: text("key").primaryKey(),
  failures: integer("failures").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
