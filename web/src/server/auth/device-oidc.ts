import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  and,
  type Database,
  deviceOidcCodes,
  deviceOidcTokens,
  eq,
  isNull,
  users,
} from "@nexora/db";
import { isActiveStaff } from "./guards";
import { ensureUserOrganization } from "./organization";

/**
 * Flux OIDC « Authorization Code + PKCE S256 » des clients natifs de bureau (RFC 8252 : client public,
 * sans client_secret, redirection vers la boucle locale). Seules les empreintes SHA-256 des codes et des
 * jetons d'accès sont conservées en base.
 */

/** Clients natifs publics autorisés (app de bureau installées). */
export const ALLOWED_NATIVE_CLIENTS = new Set([
  "lifecode-desktop",
  "lifecode-cli",
  "nexora-lifecode-cli",
  "creative-studio-desktop",
]);

/** Portées canoniques publiées ; `device:grant` (ou l'alias `nexora:device-grants`) est obligatoire. */
export const RECOGNIZED_SCOPES = [
  "openid",
  "profile",
  "email",
  "device:grant",
] as const;

const ACCEPTED_SCOPE_ALIASES: Readonly<Record<string, string>> = {
  "nexora:device-grants": "device:grant",
};

/** Portée exigée pour obtenir un jeton d'appareil. */
export const DEVICE_GRANT_SCOPE = "device:grant";

const REQUIRED_SCOPE = DEVICE_GRANT_SCOPE;
const CODE_TTL_SECONDS = 300;
const TOKEN_TTL_SECONDS = 900;
const CODE_CHALLENGE = /^[A-Za-z0-9_-]{43,128}$/;
const CODE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;

export interface DeviceOidcSessionUser {
  id: string;
  email: string;
  name?: string | null;
  twoFactorEnabled?: boolean | null;
}

export interface DeviceOidcDeps {
  db: Database;
  /** Adresse publique du site, sans barre finale. */
  baseUrl: string;
  getSessionUser: (headers: Headers) => Promise<DeviceOidcSessionUser | null>;
  now?: () => Date;
}

export interface DeviceOidcTokenDeps {
  db: Database;
  baseUrl: string;
  signingSecret: string;
  now?: () => Date;
}

export interface DeviceOidcPrincipal {
  tokenId: string;
  userId: string;
  organizationId: string;
  clientId: string;
  scopes: string[];
  email: string;
  displayName: string;
}

const sha256Hex = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function base64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

/** JWT HS256 compact (RFC 7519 §3.1). */
function signHs256(
  payload: Record<string, unknown>,
  secret: string,
): string {
  const header = base64urlJson({ alg: "HS256", typ: "JWT" });
  const body = base64urlJson(payload);
  return `${header}.${body}.${hmacSha256(`${header}.${body}`, secret)}`;
}

function hmacSha256(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

function json(body: unknown, status: number, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function oauthError(
  error: string,
  description: string,
  status = 400,
): Response {
  return json({ error, error_description: description }, status);
}

/** Redirection 302, jamais mise en cache. */
function redirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { location, "cache-control": "no-store" },
  });
}

/** `redirect_uri` d'un client natif : boucle locale en `http://`, port explicite, chemin `/callback`. */
export function isValidLoopbackRedirectUri(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.protocol !== "http:") return false;
  if (
    url.hostname !== "127.0.0.1" &&
    url.hostname !== "localhost" &&
    url.hostname !== "::1" &&
    url.hostname !== "[::1]"
  )
    return false;
  if (!/^\d+$/.test(url.port)) return false;
  const port = Number(url.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return false;
  if (url.username || url.password) return false;
  if (url.hash) return false;
  return url.pathname.startsWith("/callback");
}

function parseScopes(raw: string | null): string[] | null {
  if (raw === null) return null;
  const rawScopes = raw.split(/\s+/).filter((s) => s.length > 0);
  if (rawScopes.length === 0) return null;
  const mapped = rawScopes.map((s) => ACCEPTED_SCOPE_ALIASES[s] ?? s);
  if (mapped.some((s) => !(RECOGNIZED_SCOPES as readonly string[]).includes(s)))
    return null;
  const normalized = Array.from(new Set(mapped));
  if (!normalized.includes(REQUIRED_SCOPE)) return null;
  return normalized;
}

function withParams(base: string, params: Record<string, string>): string {
  const url = new URL(base);
  for (const [name, value] of Object.entries(params))
    url.searchParams.set(name, value);
  return url.toString();
}

/** Langue de l'interface : `ui_locales=en` ou, à défaut, un `Accept-Language` qui commence par l'anglais. */
function prefersEnglish(headers: Headers, url: URL): boolean {
  if (url.searchParams.get("ui_locales") === "en") return true;
  const langs = (headers.get("accept-language") ?? "").toLowerCase();
  return /^\s*en(?:\s*[-_,;]|\s*$)/.test(langs);
}

function accountPath(baseUrl: string, headers: Headers, url: URL, page: string) {
  return `${baseUrl}/${prefersEnglish(headers, url) ? "en" : "fr"}/compte/${page}`;
}

/** `GET /.well-known/openid-configuration` : métadonnées du fournisseur OIDC des clients de bureau. */
export function handleDeviceOidcDiscovery(baseUrl: string): Response {
  const issuer = baseUrl.replace(/\/+$/, "");
  return json(
    {
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      jwks_uri: `${issuer}/api/auth/jwks`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: [...RECOGNIZED_SCOPES],
      token_endpoint_auth_methods_supported: ["none"],
    },
    200,
  );
}

/** `GET /oauth/authorize` : validation du client, de la redirection, des portées et du PKCE S256. */
export async function handleDeviceOidcAuthorize(
  request: Request,
  deps: DeviceOidcDeps,
): Promise<Response> {
  const now = deps.now ?? (() => new Date());
  const baseUrl = deps.baseUrl.replace(/\/+$/, "");
  const url = new URL(request.url);
  const q = url.searchParams;

  const clientId = q.get("client_id") ?? "";
  const redirectUri = q.get("redirect_uri") ?? "";
  const state = q.get("state");

  // Client ou redirection invalides : JAMAIS de redirection (anti-open-redirect), réponse JSON 400.
  if (!ALLOWED_NATIVE_CLIENTS.has(clientId))
    return oauthError("invalid_request", "Unknown client_id.");
  if (!isValidLoopbackRedirectUri(redirectUri))
    return oauthError("invalid_request", "Invalid redirect_uri.");

  const back = (error: string, description: string) =>
    redirect(
      withParams(redirectUri, {
        error,
        error_description: description,
        ...(state ? { state } : {}),
      }),
    );

  if (q.get("response_type") !== "code")
    return back("invalid_request", "response_type must be code.");
  const scopes = parseScopes(q.get("scope"));
  if (!scopes) return back("invalid_scope", "Unsupported or missing scope.");
  if (q.get("code_challenge_method") !== "S256")
    return back("invalid_request", "code_challenge_method must be S256.");
  const challenge = q.get("code_challenge") ?? "";
  if (!CODE_CHALLENGE.test(challenge))
    return back("invalid_request", "Invalid code_challenge.");

  const user = await deps.getSessionUser(request.headers);
  if (!user) {
    const next = `/oauth/authorize${url.search}`;
    return redirect(
      `${accountPath(baseUrl, request.headers, url, "connexion")}?next=${encodeURIComponent(next)}`,
    );
  }

  // Comptes du personnel : la double authentification est obligatoire ; sans elle, passage par la page sécurité.
  if (user.twoFactorEnabled !== true && (await isActiveStaff(deps.db, user.id)))
    return redirect(accountPath(baseUrl, request.headers, url, "securite"));

  const org = await ensureUserOrganization(deps.db, user.id);

  const rawCode = `nxc_${randomBytes(32).toString("base64url")}`;
  const nonce = q.get("nonce");
  await deps.db.insert(deviceOidcCodes).values({
    codeHash: sha256Hex(rawCode),
    userId: user.id,
    organizationId: org.id,
    clientId,
    redirectUri,
    scope: scopes.join(" "),
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
    nonce: nonce && nonce.length <= 255 ? nonce : null,
    expiresAt: new Date(now().getTime() + CODE_TTL_SECONDS * 1000),
  });

  return redirect(
    withParams(redirectUri, {
      code: rawCode,
      ...(state ? { state } : {}),
    }),
  );
}

interface TokenRequestFields {
  grant_type?: unknown;
  code?: unknown;
  redirect_uri?: unknown;
  client_id?: unknown;
  code_verifier?: unknown;
}

/** Corps `application/x-www-form-urlencoded` OU `application/json` du point de terminaison de jeton. */
async function readTokenRequest(
  request: Request,
): Promise<TokenRequestFields | null> {
  const type = (request.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return null;
  }
  if (type === "application/json") {
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === "object"
        ? (parsed as TokenRequestFields)
        : null;
    } catch {
      return null;
    }
  }
  if (
    type === "application/x-www-form-urlencoded" ||
    type === "text/plain" ||
    type === ""
  ) {
    const out: TokenRequestFields = {};
    for (const [k, v] of new URLSearchParams(raw))
      (out as Record<string, unknown>)[k] = v;
    return out;
  }
  return null;
}

const str = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

/** `POST /oauth/token` : échange atomique du code (usage unique) contre un jeton opaque + `id_token`. */
export async function handleDeviceOidcToken(
  request: Request,
  deps: DeviceOidcTokenDeps,
): Promise<Response> {
  const now = (deps.now ?? (() => new Date()))();
  const baseUrl = deps.baseUrl.replace(/\/+$/, "");

  const body = await readTokenRequest(request);
  if (!body)
    return oauthError("invalid_request", "Malformed or unsupported body.");

  const grantType = str(body.grant_type);
  const rawCode = str(body.code);
  const redirectUri = str(body.redirect_uri);
  const clientId = str(body.client_id);
  const codeVerifier = str(body.code_verifier);

  if (grantType !== "authorization_code")
    return oauthError("unsupported_grant_type", "grant_type must be authorization_code.");
  if (!rawCode || !redirectUri || !clientId || !codeVerifier)
    return oauthError(
      "invalid_request",
      "code, redirect_uri, client_id and code_verifier are required.",
    );
  if (!ALLOWED_NATIVE_CLIENTS.has(clientId))
    return oauthError("invalid_client", "Unknown client_id.", 401);

  const codeHash = sha256Hex(rawCode);
  // Brûle le code atomiquement à la PREMIÈRE tentative : un rejeu (même concurrent) échoue à coup sûr.
  const [row] = await deps.db
    .update(deviceOidcCodes)
    .set({ consumedAt: now })
    .where(
      and(
        eq(deviceOidcCodes.codeHash, codeHash),
        isNull(deviceOidcCodes.consumedAt),
      ),
    )
    .returning();
  if (!row) {
    const [known] = await deps.db
      .select({ id: deviceOidcCodes.id })
      .from(deviceOidcCodes)
      .where(eq(deviceOidcCodes.codeHash, codeHash))
      .limit(1);
    return known
      ? oauthError("invalid_grant", "Authorization code already used.")
      : oauthError("invalid_grant", "Unknown authorization code.");
  }

  if (row.expiresAt.getTime() <= now.getTime())
    return oauthError("invalid_grant", "Authorization code expired.");
  if (row.clientId !== clientId)
    return oauthError("invalid_grant", "client_id mismatch.");
  if (row.redirectUri !== redirectUri)
    return oauthError("invalid_grant", "redirect_uri mismatch.");
  if (!CODE_VERIFIER.test(codeVerifier))
    return oauthError("invalid_grant", "Invalid code_verifier.");
  const computed = createHash("sha256")
    .update(codeVerifier, "ascii")
    .digest();
  const expected = Buffer.from(row.codeChallenge, "base64url");
  if (
    computed.length !== expected.length ||
    !timingSafeEqual(computed, expected)
  )
    return oauthError("invalid_grant", "PKCE verification failed.");

  const [user] = await deps.db
    .select()
    .from(users)
    .where(eq(users.id, row.userId))
    .limit(1);
  if (!user)
    return oauthError("invalid_grant", "Unknown account.");

  const accessToken = `nxo_${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_SECONDS * 1000);
  await deps.db.insert(deviceOidcTokens).values({
    tokenHash: sha256Hex(accessToken),
    userId: row.userId,
    organizationId: row.organizationId,
    clientId: row.clientId,
    scope: row.scope,
    expiresAt,
  });

  const iat = Math.floor(now.getTime() / 1000);
  const idToken = signHs256(
    {
      iss: baseUrl,
      sub: row.userId,
      aud: row.clientId,
      account_id: row.organizationId,
      email: user.email,
      name: user.name,
      iat,
      exp: iat + TOKEN_TTL_SECONDS,
      ...(row.nonce ? { nonce: row.nonce } : {}),
    },
    deps.signingSecret,
  );

  return json(
    {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: TOKEN_TTL_SECONDS,
      scope: row.scope,
      id_token: idToken,
      account: {
        id: row.organizationId,
        user_id: row.userId,
        email: user.email,
        display_name: user.name,
      },
    },
    200,
    { pragma: "no-cache" },
  );
}

/** `authenticateDeviceOidcToken` : jeton Bearer `nxo_…` actif et porteur de la portée exigée. */
export async function authenticateDeviceOidcToken(
  db: Database,
  rawToken: string,
  requiredScope = REQUIRED_SCOPE,
  now = new Date(),
): Promise<DeviceOidcPrincipal | null> {
  if (typeof rawToken !== "string" || !rawToken.startsWith("nxo_")) return null;
  const [row] = await db
    .select({
      tokenId: deviceOidcTokens.id,
      userId: deviceOidcTokens.userId,
      organizationId: deviceOidcTokens.organizationId,
      clientId: deviceOidcTokens.clientId,
      scope: deviceOidcTokens.scope,
      expiresAt: deviceOidcTokens.expiresAt,
      revokedAt: deviceOidcTokens.revokedAt,
      email: users.email,
      displayName: users.name,
    })
    .from(deviceOidcTokens)
    .innerJoin(users, eq(users.id, deviceOidcTokens.userId))
    .where(eq(deviceOidcTokens.tokenHash, sha256Hex(rawToken)))
    .limit(1);
  if (!row || row.revokedAt !== null) return null;
  if (row.expiresAt.getTime() <= now.getTime()) return null;
  const scopes = row.scope.split(/\s+/).filter((s) => s.length > 0);
  if (!scopes.includes(requiredScope)) return null;
  return {
    tokenId: row.tokenId,
    userId: row.userId,
    organizationId: row.organizationId,
    clientId: row.clientId,
    scopes,
    email: row.email,
    displayName: row.displayName,
  };
}
