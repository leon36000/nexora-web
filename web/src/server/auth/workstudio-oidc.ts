import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { oauthProvider } from "@better-auth/oauth-provider";
import { type Database, ne, oauthClients } from "@nexora/db";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { jwt } from "better-auth/plugins/jwt";
import { isActiveStaff } from "./guards";
import { ensureUserOrganization } from "./organization";

/**
 * Le site, fournisseur OpenID Connect de WorkStudio (connexion unique). Plugin officiel
 * `@better-auth/oauth-provider` (le plugin `oidcProvider` du paquet `better-auth` n'existe plus depuis la 1.7) et
 * plugin `jwt` pour signer les jetons d'identité (RS256, clés publiées à `/api/auth/jwks`).
 *
 * Un SEUL client, WorkStudio, de première partie : consentement sauté, PKCE obligatoire, secret en empreinte.
 * Il est décrit par trois variables d'environnement et enregistré en base au premier appel OAuth (le paquet interdit
 * de poser `skip_consent` par son API publique). Sans ces variables, rien n'est monté : `/api/auth/oauth2/*`,
 * `/jwks` et la découverte répondent 404 (échec fermé). Voir `docs/workstudio-integre.md`.
 */

/** Identifiant du fournisseur côté WorkStudio : détermine l'adresse de retour `/api/auth/oauth2/callback/<id>`. */
export const WORKSTUDIO_PROVIDER_ID = "nexora-oidc";
export const WORKSTUDIO_CALLBACK_PATH = `/api/auth/oauth2/callback/${WORKSTUDIO_PROVIDER_ID}`;
/** Portée qui ouvre `GET /api/oauth/workstudio-access` (accès modèle de l'organisation de l'utilisateur). */
export const WORKSTUDIO_MODEL_SCOPE = "workstudio:model";
export const WORKSTUDIO_SCOPES = [
  "openid",
  "profile",
  "email",
  WORKSTUDIO_MODEL_SCOPE,
] as const;
/** Réclamation de `userinfo` : organisation de travail de l'utilisateur. */
export const ORGANIZATION_CLAIM = "organization_id";

/** Durées courtes, en secondes. Le code d'autorisation vit aussi longtemps que le lien signé de connexion (paquet). */
export const WORKSTUDIO_TOKEN_LIFETIMES = {
  accessToken: 600,
  idToken: 600,
  code: 300,
} as const;

export interface WorkstudioOidcConfig {
  clientId: string;
  clientSecret: string;
  /** Adresse publique de WorkStudio, sans barre finale ni requête. */
  publicUrl: string;
  callbackUrl: string;
  tokenEndpointAuthMethod: "client_secret_post" | "client_secret_basic";
}

export type WorkstudioOidcResolution =
  | { config: WorkstudioOidcConfig; problem?: undefined }
  | { config: null; problem: string };

const CLIENT_ID = /^[A-Za-z0-9._-]{8,128}$/;
const LOOPBACK = /^(localhost|127(\.\d{1,3}){3}|\[::1\])$/;

function envValue(
  env: Record<string, string | undefined>,
  name: string,
): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

/**
 * Lit WORKSTUDIO_OIDC_CLIENT_ID, WORKSTUDIO_OIDC_CLIENT_SECRET et WORKSTUDIO_PUBLIC_URL (et, en option,
 * WORKSTUDIO_OIDC_TOKEN_AUTH = post | basic). `problem` nomme la variable en cause, jamais sa valeur.
 * « absent » : rien à signaler (fournisseur simplement non utilisé).
 */
export function resolveWorkstudioOidc(
  env: Record<string, string | undefined>,
  options: { allowLoopback?: boolean } = {},
): WorkstudioOidcResolution {
  const clientId = envValue(env, "WORKSTUDIO_OIDC_CLIENT_ID");
  const clientSecret = envValue(env, "WORKSTUDIO_OIDC_CLIENT_SECRET");
  const publicUrl = envValue(env, "WORKSTUDIO_PUBLIC_URL");
  // L'adresse publique seule sert au bouton « Ouvrir WorkStudio » : ce n'est pas une configuration partielle.
  if (!clientId && !clientSecret) return { config: null, problem: "absent" };
  const missing = [
    ["WORKSTUDIO_OIDC_CLIENT_ID", clientId],
    ["WORKSTUDIO_OIDC_CLIENT_SECRET", clientSecret],
    ["WORKSTUDIO_PUBLIC_URL", publicUrl],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0)
    return {
      config: null,
      problem: `configuration incomplète : ${missing.join(", ")} manquant`,
    };
  if (!clientId || !clientSecret || !publicUrl)
    return { config: null, problem: "configuration incomplète" };

  if (!CLIENT_ID.test(clientId))
    return {
      config: null,
      problem:
        "WORKSTUDIO_OIDC_CLIENT_ID : 8 à 128 caractères parmi A-Z a-z 0-9 . _ -",
    };
  if (
    clientSecret.length < 32 ||
    clientSecret.length > 256 ||
    // biome-ignore lint/suspicious/noControlCharactersInRegex: refuse les espaces et les caractères de contrôle
    /[\s\u0000-\u001f\u007f]/.test(clientSecret)
  )
    return {
      config: null,
      problem:
        "WORKSTUDIO_OIDC_CLIENT_SECRET : 32 à 256 caractères, sans espace",
    };

  let url: URL;
  try {
    url = new URL(publicUrl);
  } catch {
    return {
      config: null,
      problem: "WORKSTUDIO_PUBLIC_URL : adresse illisible",
    };
  }
  const secure = url.protocol === "https:";
  const local =
    options.allowLoopback === true &&
    url.protocol === "http:" &&
    LOOPBACK.test(url.hostname);
  if ((!secure && !local) || url.username || url.password)
    return {
      config: null,
      problem:
        "WORKSTUDIO_PUBLIC_URL : https exigé, sans identifiants (http admis sur la machine locale en développement)",
    };

  const tokenAuth = envValue(env, "WORKSTUDIO_OIDC_TOKEN_AUTH") ?? "post";
  if (tokenAuth !== "post" && tokenAuth !== "basic")
    return {
      config: null,
      problem: "WORKSTUDIO_OIDC_TOKEN_AUTH : « post » ou « basic »",
    };

  const base = `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  return {
    config: {
      clientId,
      clientSecret,
      publicUrl: base,
      callbackUrl: `${base}${WORKSTUDIO_CALLBACK_PATH}`,
      tokenEndpointAuthMethod:
        tokenAuth === "basic" ? "client_secret_basic" : "client_secret_post",
    },
  };
}

/** Empreinte du secret du client (SHA-256, base64url) : seule chose rangée en base. */
export function hashClientSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("base64url");
}

function verifyClientSecret(secret: string, stored: string): boolean {
  const a = Buffer.from(hashClientSecret(secret));
  const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Enregistre (ou met à jour) le client WorkStudio décrit par l'environnement, et DÉSACTIVE tout autre client :
 * changer l'identifiant ou le secret annule l'ancien. Rejouable ; le secret en clair n'est jamais écrit.
 */
export async function ensureWorkstudioClient(
  db: Database,
  config: WorkstudioOidcConfig,
  now: Date = new Date(),
): Promise<void> {
  const managed = {
    clientSecret: hashClientSecret(config.clientSecret),
    clientDiscoveryId: null,
    disabled: false,
    skipConsent: true,
    enableEndSession: false,
    subjectType: "public",
    scopes: [...WORKSTUDIO_SCOPES],
    clientCredentialsScopes: [],
    userId: null,
    updatedAt: now,
    name: "Nexora WorkStudio",
    uri: config.publicUrl,
    icon: null,
    contacts: null,
    tos: null,
    policy: null,
    softwareId: null,
    softwareVersion: null,
    softwareStatement: null,
    redirectUris: [config.callbackUrl],
    postLogoutRedirectUris: null,
    backchannelLogoutUri: null,
    backchannelLogoutSessionRequired: null,
    tokenEndpointAuthMethod: config.tokenEndpointAuthMethod,
    applicationType: "web",
    jwks: null,
    jwksUri: null,
    grantTypes: ["authorization_code"],
    responseTypes: ["code"],
    requirePKCE: true,
    dpopBoundAccessTokens: false,
    referenceId: null,
    metadata: null,
  };
  await db.transaction(async (tx) => {
    await tx
      .insert(oauthClients)
      .values({
        id: randomBytes(16).toString("hex"),
        clientId: config.clientId,
        createdAt: now,
        ...managed,
      })
      .onConflictDoUpdate({ target: oauthClients.clientId, set: managed });
    await tx
      .update(oauthClients)
      .set({ disabled: true, updatedAt: now })
      .where(ne(oauthClients.clientId, config.clientId));
  });
}

/** Seules ces routes OAuth existent ; tout le reste du plugin (gestion des clients, ressources, jeton de session…) répond 404. */
const ALLOWED_OAUTH_PATHS = new Set([
  "/oauth2/authorize",
  "/oauth2/token",
  "/oauth2/userinfo",
  "/oauth2/introspect",
  "/oauth2/revoke",
]);

export interface WorkstudioPluginsInput {
  db: Database;
  config: WorkstudioOidcConfig;
  /** Adresse publique du site, sans barre finale. */
  baseURL: string;
  log: (message: string, fields?: Record<string, unknown>) => void;
  now: () => number;
}

/**
 * Plugins Better Auth du fournisseur : `jwt` (clés de signature), `oauthProvider` (autorisation, jeton, userinfo)
 * et un petit plugin de garde (liste blanche des routes, enregistrement du client).
 */
export function workstudioOidcPlugins(
  input: WorkstudioPluginsInput,
): BetterAuthPlugin[] {
  const { db, config, baseURL, log } = input;
  const issuer = `${baseURL}/api/auth`;

  // Enregistrement du client au premier appel OAuth du processus ; en cas d'échec, on réessaie à l'appel suivant.
  let seeded: Promise<void> | null = null;
  const ensureSeeded = (): Promise<void> => {
    if (!seeded) {
      seeded = ensureWorkstudioClient(db, config, new Date(input.now())).catch(
        (error: unknown) => {
          seeded = null;
          log("oidc : client WorkStudio non enregistré", {
            errorName: error instanceof Error ? error.name : typeof error,
          });
          throw error;
        },
      );
    }
    return seeded;
  };

  const guard: BetterAuthPlugin = {
    id: "nexora-workstudio-guard",
    hooks: {
      before: [
        {
          matcher: (ctx) => {
            const path = ctx.path ?? "";
            return (
              path.startsWith("/oauth2/") ||
              path.startsWith("/admin/oauth2/") ||
              // `GET /token` (plugin jwt) délivrerait un JWT de la session : inutile ici.
              path === "/token"
            );
          },
          handler: createAuthMiddleware(async (ctx) => {
            if (!ALLOWED_OAUTH_PATHS.has(ctx.path ?? ""))
              throw new APIError("NOT_FOUND", { message: "Not found" });
            await ensureSeeded();
          }),
        },
      ],
    },
  };

  return [
    jwt({
      jwt: { issuer, expirationTime: `${WORKSTUDIO_TOKEN_LIFETIMES.idToken}s` },
      jwks: { keyPairConfig: { alg: "RS256", modulusLength: 2048 } },
      disableSettingJwtHeader: true,
    }),
    oauthProvider({
      loginPage: `${baseURL}/compte/connexion`,
      // Jamais atteinte : WorkStudio saute le consentement. Aucune page ne l'accepte, donc un client qui
      // l'exigerait ne pourrait pas aboutir.
      consentPage: `${baseURL}/compte/workstudio`,
      scopes: [...WORKSTUDIO_SCOPES],
      grantTypes: ["authorization_code"],
      accessTokenExpiresIn: WORKSTUDIO_TOKEN_LIFETIMES.accessToken,
      idTokenExpiresIn: WORKSTUDIO_TOKEN_LIFETIMES.idToken,
      codeExpiresIn: WORKSTUDIO_TOKEN_LIFETIMES.code,
      storeClientSecret: { hash: hashClientSecret, verify: verifyClientSecret },
      storeTokens: "hashed",
      // Adresse de retour : correspondance EXACTE avec celle enregistrée (le paquet tolère sinon un autre port sur
      // la boucle locale).
      validateRedirectUri: (uri, registered) => registered.includes(uri),
      allowDynamicClientRegistration: false,
      allowUnauthenticatedClientRegistration: false,
      // Par défaut le paquet laisse tout utilisateur connecté créer des clients : ici, personne.
      clientPrivileges: () => false,
      resourcePrivileges: () => false,
      // Un compte du personnel sans double authentification ne reçoit aucun jeton : renvoyé vers la page de sécurité.
      postLogin: {
        page: `${baseURL}/compte/securite`,
        consentReferenceId: () => undefined,
        shouldRedirect: async ({ user }) =>
          (await isActiveStaff(db, user.id)) &&
          (user as { twoFactorEnabled?: boolean }).twoFactorEnabled !== true,
      },
      customUserInfoClaims: async ({ user }) => {
        const org = await ensureUserOrganization(db, user.id);
        return { [ORGANIZATION_CLAIM]: org.id };
      },
      // Le serveur de WorkStudio est une seule adresse pour tous ses utilisateurs : limites larges ici,
      // serrées pour les routes de gestion qui répondent de toute façon 404.
      rateLimit: {
        authorize: { window: 60, max: 60 },
        token: { window: 60, max: 300 },
        userinfo: { window: 60, max: 300 },
        introspect: { window: 60, max: 300 },
        revoke: { window: 60, max: 60 },
        register: { window: 60, max: 3 },
        rotateClientKeys: { window: 60, max: 3 },
      },
    }),
    guard,
  ];
}

export interface TokenIntrospection {
  active: boolean;
  /** Client auquel le jeton a été délivré. */
  clientId?: string;
  /** Identifiant de l'utilisateur du site (`sub`, jamais pseudonymisé ici). */
  userId?: string;
  scopes: string[];
}

const INACTIVE: TokenIntrospection = { active: false, scopes: [] };

type IntrospectFn = (context: {
  body: Record<string, string>;
  headers: Headers;
  request: Request;
}) => Promise<unknown>;

/**
 * Introspection d'un jeton d'accès AU NOM du client WorkStudio, en appel direct (sans passer par HTTP, donc sans
 * entamer la limite de débit des routes publiques). Le paquet ne renvoie « actif » que pour les jetons délivrés à
 * ce client, non expirés, non révoqués, et dont la session du site existe encore.
 */
export function createWorkstudioIntrospector(
  auth: { api: unknown },
  config: WorkstudioOidcConfig,
  baseURL: string,
): (token: string) => Promise<TokenIntrospection> {
  const api = auth.api as { oauth2Introspect?: IntrospectFn };
  const url = `${baseURL.replace(/\/+$/, "")}/api/auth/oauth2/introspect`;
  return async (token) => {
    if (typeof api.oauth2Introspect !== "function") return INACTIVE;
    const form: Record<string, string> = {
      token,
      token_type_hint: "access_token",
    };
    const headers = new Headers({
      "content-type": "application/x-www-form-urlencoded",
    });
    if (config.tokenEndpointAuthMethod === "client_secret_basic") {
      const basic = Buffer.from(
        `${encodeURIComponent(config.clientId)}:${encodeURIComponent(config.clientSecret)}`,
      ).toString("base64");
      headers.set("authorization", `Basic ${basic}`);
    } else {
      form.client_id = config.clientId;
      form.client_secret = config.clientSecret;
    }
    const request = new Request(url, {
      method: "POST",
      headers,
      body: new URLSearchParams(form).toString(),
    });
    let result: unknown;
    try {
      result = await api.oauth2Introspect({ body: form, headers, request });
      // Avec une requête fournie, le paquet répond par un objet Response (JSON).
      if (result instanceof Response) {
        if (result.status === 400 || result.status === 401) return INACTIVE;
        if (!result.ok)
          throw new Error(`introspection : HTTP ${result.status}`);
        result = await result.json();
      }
    } catch (error) {
      // Jeton inconnu ou mal formé : inactif. Toute autre panne remonte (la route répond alors 503).
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 400 || status === 401) return INACTIVE;
      throw error;
    }
    const payload = (result ?? {}) as {
      active?: unknown;
      client_id?: unknown;
      sub?: unknown;
      scope?: unknown;
    };
    if (payload.active !== true) return INACTIVE;
    return {
      active: true,
      clientId:
        typeof payload.client_id === "string" ? payload.client_id : undefined,
      userId: typeof payload.sub === "string" ? payload.sub : undefined,
      scopes:
        typeof payload.scope === "string"
          ? payload.scope.split(/\s+/).filter(Boolean)
          : [],
    };
  };
}
