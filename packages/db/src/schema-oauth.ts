import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sessions, users } from "./schema-auth.ts";

/**
 * Fournisseur OpenID Connect du site (WorkStudio intégré, connexion unique). Tables des plugins `jwt` et
 * `@better-auth/oauth-provider` de Better Auth : les noms de colonnes suivent leur schéma (un test compare ces
 * tables à `getAuthTables`), les noms de tables sont au pluriel. Aucun jeton n'est stocké en clair : les jetons
 * d'accès, les codes et le secret du client sont des empreintes.
 */

/** Clés de signature des jetons d'identité (plugin `jwt`). La clé privée est chiffrée avec BETTER_AUTH_SECRET. */
export const jwks = pgTable("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  alg: text("alg"),
  crv: text("crv"),
});

/**
 * Clients OAuth. Un seul est créé par le site (WorkStudio, première partie : `skip_consent`, PKCE obligatoire),
 * depuis l'environnement, au démarrage. Aucune route publique n'en crée d'autres.
 */
export const oauthClients = pgTable(
  "oauth_clients",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(),
    /** Empreinte (SHA-256, base64url) du secret ; jamais le secret. */
    clientSecret: text("client_secret"),
    clientDiscoveryId: text("client_discovery_id"),
    disabled: boolean("disabled").default(false),
    skipConsent: boolean("skip_consent"),
    enableEndSession: boolean("enable_end_session"),
    subjectType: text("subject_type"),
    scopes: text("scopes").array(),
    clientCredentialsScopes: text("client_credentials_scopes")
      .array()
      .default([]),
    userId: text("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    name: text("name"),
    uri: text("uri"),
    icon: text("icon"),
    contacts: text("contacts").array(),
    tos: text("tos"),
    policy: text("policy"),
    softwareId: text("software_id"),
    softwareVersion: text("software_version"),
    softwareStatement: text("software_statement"),
    redirectUris: text("redirect_uris").array().notNull(),
    postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
    backchannelLogoutUri: text("backchannel_logout_uri"),
    backchannelLogoutSessionRequired: boolean(
      "backchannel_logout_session_required",
    ),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
    applicationType: text("application_type"),
    jwks: text("jwks"),
    jwksUri: text("jwks_uri"),
    grantTypes: text("grant_types").array(),
    responseTypes: text("response_types").array(),
    requirePKCE: boolean("require_pkce"),
    dpopBoundAccessTokens: boolean("dpop_bound_access_tokens").default(false),
    referenceId: text("reference_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (t) => [
    // Contrainte (et non simple index) : d'autres tables s'y réfèrent par clé étrangère.
    unique("oauth_clients_client_id_unique").on(t.clientId),
    index("oauth_clients_user_idx").on(t.userId),
  ],
);

/** Ressources protégées (RFC 8707) : non utilisées par le site, mais exigées par le schéma du plugin. */
export const oauthResources = pgTable(
  "oauth_resources",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    name: text("name").notNull(),
    accessTokenTtl: integer("access_token_ttl"),
    refreshTokenTtl: integer("refresh_token_ttl"),
    signingAlgorithm: text("signing_algorithm"),
    signingKeyId: text("signing_key_id"),
    allowedScopes: text("allowed_scopes").array(),
    customClaims: jsonb("custom_claims").$type<Record<string, unknown>>(),
    dpopBoundAccessTokensRequired: boolean(
      "dpop_bound_access_tokens_required",
    ).default(false),
    disabled: boolean("disabled").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    policyVersion: integer("policy_version").default(1),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (t) => [unique("oauth_resources_identifier_unique").on(t.identifier)],
);

export const oauthClientResources = pgTable(
  "oauth_client_resources",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    resourceId: text("resource_id")
      .notNull()
      .references(() => oauthResources.identifier, { onDelete: "cascade" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("oauth_client_resources_client_idx").on(t.clientId),
    index("oauth_client_resources_resource_idx").on(t.resourceId),
    uniqueIndex("oauth_client_resources_pair_unique").on(
      t.clientId,
      t.resourceId,
    ),
  ],
);

/** Jetons de rafraîchissement : non émis pour WorkStudio (pas de `offline_access`), mais exigés par le schéma. */
export const oauthRefreshTokens = pgTable(
  "oauth_refresh_tokens",
  {
    id: text("id").primaryKey(),
    /** Empreinte du jeton, jamais sa valeur. */
    token: text("token").notNull(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.clientId),
    sessionId: text("session_id").references(() => sessions.id, {
      onDelete: "set null",
    }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources").array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    revoked: timestamp("revoked", { withTimezone: true }),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    rotationReplayResponse: text("rotation_replay_response"),
    rotationReplayExpiresAt: timestamp("rotation_replay_expires_at", {
      withTimezone: true,
    }),
    authTime: timestamp("auth_time", { withTimezone: true }),
    confirmation: jsonb("confirmation").$type<Record<string, unknown>>(),
    scopes: text("scopes").array().notNull(),
  },
  (t) => [
    uniqueIndex("oauth_refresh_tokens_token_unique").on(t.token),
    index("oauth_refresh_tokens_client_idx").on(t.clientId),
    index("oauth_refresh_tokens_session_idx").on(t.sessionId),
    index("oauth_refresh_tokens_user_idx").on(t.userId),
    index("oauth_refresh_tokens_code_idx").on(t.authorizationCodeId),
  ],
);

/**
 * Jetons d'accès opaques de WorkStudio (portées `openid profile email workstudio:model`), liés à la session du
 * site : une session fermée rend le jeton inactif. Durée courte (`accessTokenExpiresIn`).
 */
export const oauthAccessTokens = pgTable(
  "oauth_access_tokens",
  {
    id: text("id").primaryKey(),
    /** Empreinte du jeton (SHA-256), jamais sa valeur. */
    token: text("token").notNull(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.clientId),
    // Écart voulu avec le paquet (qui met NULL) : un jeton sans session n'est plus rattaché à rien et resterait
    // valable. Ici, la fin de la session du site (fermeture, expiration, réinitialisation) efface ses jetons.
    sessionId: text("session_id").references(() => sessions.id, {
      onDelete: "cascade",
    }),
    userId: text("user_id").references(() => users.id),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources").array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    refreshId: text("refresh_id").references(() => oauthRefreshTokens.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    revoked: timestamp("revoked", { withTimezone: true }),
    confirmation: jsonb("confirmation").$type<Record<string, unknown>>(),
    scopes: text("scopes").array().notNull(),
  },
  (t) => [
    uniqueIndex("oauth_access_tokens_token_unique").on(t.token),
    index("oauth_access_tokens_client_idx").on(t.clientId),
    index("oauth_access_tokens_session_idx").on(t.sessionId),
    index("oauth_access_tokens_user_idx").on(t.userId),
    index("oauth_access_tokens_code_idx").on(t.authorizationCodeId),
    index("oauth_access_tokens_refresh_idx").on(t.refreshId),
  ],
);

/** Consentements : WorkStudio est un client de première partie (consentement sauté), la table reste exigée. */
export const oauthConsents = pgTable(
  "oauth_consents",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.clientId),
    userId: text("user_id").references(() => users.id),
    referenceId: text("reference_id"),
    resources: text("resources").array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    scopes: text("scopes").array().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("oauth_consents_client_idx").on(t.clientId),
    index("oauth_consents_user_idx").on(t.userId),
  ],
);

/** Rejeu des assertions de client (`private_key_jwt`) : non utilisé (le client s'authentifie par secret). */
export const oauthClientAssertions = pgTable("oauth_client_assertions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
