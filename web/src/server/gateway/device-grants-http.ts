import {
  and,
  apiKeys,
  creditAccounts,
  type Database,
  desc,
  eq,
  gatewayDeviceGrants,
  gte,
  lt,
  members,
  type OrgRole,
  or,
  usageEvents,
} from "@nexora/db";
import type { Logger } from "@nexora/log";
import { authenticateDeviceOidcToken } from "../auth/device-oidc";
import { isSameOriginRequest } from "../auth/origin";
import {
  createDeviceGrant,
  DeviceGrantError,
  findGrantByApiKeyId,
  getDeviceGrant,
  listDeviceGrants,
  revokeAllDeviceGrants,
  revokeDeviceGrant,
  rotateDeviceGrant,
} from "./device-grants";
import { authenticateApiKey, hashApiKey } from "./keys";

export interface DeviceGrantsHttpDeps {
  db: () => Database;
  siteUrl: string;
  now: () => Date;
  log?: Logger;
  getSessionContext: (headers: Headers) => Promise<{
    userId: string;
    organizationId: string;
    role: OrgRole | string;
  } | null>;
}

export type AccountPrincipal =
  | { kind: "oidc"; userId: string; organizationId: string }
  | {
      kind: "session";
      userId: string;
      organizationId: string;
      role: OrgRole | string;
    }
  | {
      kind: "api_key";
      organizationId: string;
      apiKeyId: string;
      grantId: string | null;
    };

export type AuthResult =
  | { principal: AccountPrincipal }
  | { response: Response };

const MAX_GRACE_PERIOD_SECONDS = 3_600;

/** Langue de la réponse : `?lang=en` prime, sinon `Accept-Language` commençant par `en`, sinon `fr`. */
export function selectLanguage(request: Request): "fr" | "en" {
  try {
    const param = new URL(request.url).searchParams.get("lang");
    if (param !== null) {
      const normalized = param.trim().toLowerCase();
      if (normalized === "en" || normalized.startsWith("en-")) return "en";
      if (normalized === "fr" || normalized.startsWith("fr-")) return "fr";
    }
  } catch {
    // URL relative ou non parsable : on retombe sur l'en-tête.
  }
  const header = (request.headers.get("accept-language") ?? "")
    .trimStart()
    .toLowerCase();
  return /^en(?:[-_,;\s]|$)/.test(header) ? "en" : "fr";
}

function isEnglishPreferred(request: Request): boolean {
  return selectLanguage(request) === "en";
}

function billingUrl(siteUrl: string, english: boolean): string {
  const base = siteUrl.replace(/\/+$/, "");
  return `${base}/${english ? "en" : "fr"}/compte/facturation#ajouter-des-fonds`;
}

const json = (body: unknown, status = 200, headers?: HeadersInit) => {
  const h = new Headers(headers);
  h.set("content-type", "application/json; charset=utf-8");
  h.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { status, headers: h });
};

/** Erreur compatible OpenAI et enveloppe bilingue FR/EN consommée par les clients natifs. */
export function deviceGrantErrorResponse(
  request: Request,
  status: number,
  code: string,
  messageFr: string,
  messageEn: string,
  opts: {
    rechargeUrl?: string;
    retryAfterSeconds?: number;
    wwwAuthenticate?: boolean;
  } = {},
): Response {
  const lang = selectLanguage(request);
  const type =
    status === 401
      ? "authentication_error"
      : status === 402
        ? "billing_error"
        : status === 403
          ? "permission_error"
          : status === 404
            ? "not_found_error"
            : status === 429
              ? "rate_limit_error"
              : status >= 500
                ? "api_error"
                : "invalid_request_error";
  const headers = new Headers();
  if (opts.wwwAuthenticate)
    headers.set("www-authenticate", 'Bearer realm="nexora"');
  if (opts.retryAfterSeconds !== undefined)
    headers.set("retry-after", String(opts.retryAfterSeconds));
  return json(
    {
      error: {
        code,
        type,
        status,
        message: lang === "en" ? messageEn : messageFr,
        message_fr: messageFr,
        message_en: messageEn,
        param: null,
        ...(opts.rechargeUrl ? { recharge_url: opts.rechargeUrl } : {}),
      },
      code,
      message_fr: messageFr,
      message_en: messageEn,
      ...(opts.rechargeUrl
        ? { recharge_url: opts.rechargeUrl, topup_url: opts.rechargeUrl }
        : {}),
    },
    status,
    headers,
  );
}

const invalidKey = (request: Request, code = "invalid_api_key") => {
  const messages: Record<string, [string, string]> = {
    invalid_api_key: [
      "Jeton ou clé API invalide ou absent.",
      "Invalid or missing token or API key.",
    ],
    api_key_revoked: [
      "Cette clé API d'appareil a été révoquée.",
      "This device API key has been revoked.",
    ],
    api_key_expired: [
      "Cette clé API d'appareil a expiré.",
      "This device API key has expired.",
    ],
  };
  const [fr, en] = messages[code] ?? messages.invalid_api_key!;
  return deviceGrantErrorResponse(request, 401, code, fr, en, {
    wwwAuthenticate: true,
  });
};

const forbidden = (request: Request) =>
  deviceGrantErrorResponse(
    request,
    403,
    "forbidden",
    "Accès refusé.",
    "Access denied.",
  );

const insufficientScope = (
  request: Request,
  fr = "Cette clé d'appareil ne dispose pas de la portée requise (usage:read).",
  en = "This device key lacks the required scope (usage:read).",
) => deviceGrantErrorResponse(request, 403, "insufficient_scope", fr, en);

const crossDevice = (request: Request) =>
  deviceGrantErrorResponse(
    request,
    403,
    "cross_device_forbidden",
    "Cette clé d'appareil ne peut pas gérer un autre appareil.",
    "This device key cannot manage another device.",
  );

const notFound = (request: Request) =>
  deviceGrantErrorResponse(
    request,
    404,
    "grant_not_found",
    "Accès d'appareil introuvable.",
    "Device grant not found.",
  );

const badRequest = (
  request: Request,
  fr = "La requête est invalide.",
  en = "The request is invalid.",
) => deviceGrantErrorResponse(request, 400, "invalid_request", fr, en);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hasScope(scopes: unknown, requiredScope: string): boolean {
  if (Array.isArray(scopes)) {
    return scopes.some((s) => s === requiredScope || s === "*");
  }
  if (!scopes || typeof scopes !== "object") return false;
  const record = scopes as Record<string, unknown>;
  if (record[requiredScope] === false) return false;
  if (record[requiredScope] === true) return true;
  for (const field of ["permissions", "scopes", "account", "grants"]) {
    const candidate = record[field];
    if (Array.isArray(candidate)) {
      return candidate.some((s) => s === requiredScope || s === "*");
    }
  }
  // Format canonique `{ models, webpilot }` : `usage:read` est accordé par défaut sauf refus explicite.
  if (
    requiredScope === "usage:read" &&
    ("models" in record || "webpilot" in record)
  ) {
    return true;
  }
  return false;
}

/** Un en-tête Authorization invalide ne doit jamais se rabattre sur un témoin de session. */
export async function authenticateAccountRequest(
  request: Request,
  deps: DeviceGrantsHttpDeps,
): Promise<AuthResult> {
  const authorization = request.headers.get("authorization");
  if (authorization !== null) {
    const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization);
    if (!match?.[1]) return { response: invalidKey(request) };
    const token = match[1];
    const db = deps.db();
    const now = deps.now();
    if (token.startsWith("nxo_")) {
      const oidc = await authenticateDeviceOidcToken(
        db,
        token,
        "device:grant",
        now,
      );
      if (!oidc) return { response: invalidKey(request) };
      return {
        principal: {
          kind: "oidc",
          userId: oidc.userId,
          organizationId: oidc.organizationId,
        },
      };
    }
    if (token.startsWith("nxk_")) {
      const auth = await authenticateApiKey(db, authorization, now);
      if (!auth.ok) {
        return { response: invalidKey(request, auth.code) };
      }
      const grant = await findGrantByApiKeyId(db, auth.key.id);
      if (grant && grant.revokedAt !== null) {
        return { response: invalidKey(request, "api_key_revoked") };
      }
      if (grant && grant.expiresAt <= now) {
        return { response: invalidKey(request, "api_key_expired") };
      }
      const grantId =
        grant?.organizationId === auth.key.organizationId ? grant.id : null;
      return {
        principal: {
          kind: "api_key",
          organizationId: auth.key.organizationId,
          apiKeyId: auth.key.id,
          grantId,
        },
      };
    }
    return { response: invalidKey(request) };
  }

  if (
    (request.method === "POST" || request.method === "DELETE") &&
    !isSameOriginRequest(request, deps.siteUrl)
  ) {
    return {
      response: deviceGrantErrorResponse(
        request,
        403,
        "forbidden",
        "Origine de la requête refusée.",
        "Request origin denied.",
      ),
    };
  }
  const session = await deps.getSessionContext(request.headers);
  if (!session) return { response: invalidKey(request) };
  return { principal: { kind: "session", ...session } };
}

/**
 * Authentifie un lecteur de données du compte (`/v1/account/balance`, `/v1/account/usage`).
 * Pour une clé `Bearer nxk_...` rattachée à `gatewayDeviceGrants` (`apiKeyId` ou `previousApiKeyId`),
 * vérifie qu'elle n'est pas révoquée (`401 api_key_revoked`), non expirée, et que `grant.scopes`
 * autorise `"usage:read"` (`403 insufficient_scope`). Une clé API manuelle ordinaire sans ligne
 * grant conserve l'accès complet.
 */
export async function authenticateAccountReader(
  request: Request,
  deps: DeviceGrantsHttpDeps,
): Promise<AuthResult> {
  const authorization = request.headers.get("authorization");
  if (authorization !== null) {
    const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization);
    if (!match?.[1]) return { response: invalidKey(request) };
    const token = match[1];
    if (token.startsWith("nxk_")) {
      const db = deps.db();
      const now = deps.now();
      const auth = await authenticateApiKey(db, authorization, now);
      if (!auth.ok) {
        if (auth.code === "api_key_expired") {
          const [keyRow] = await db
            .select({ id: apiKeys.id })
            .from(apiKeys)
            .where(eq(apiKeys.keyHash, hashApiKey(token)))
            .limit(1);
          if (keyRow && UUID_RE.test(keyRow.id)) {
            const grant = await findGrantByApiKeyId(db, keyRow.id);
            if (grant?.revokedAt !== null && grant !== null) {
              return { response: invalidKey(request, "api_key_revoked") };
            }
          }
        }
        return { response: invalidKey(request, auth.code) };
      }
      if (UUID_RE.test(auth.key.id)) {
        const [grant] = await db
          .select({
            id: gatewayDeviceGrants.id,
            organizationId: gatewayDeviceGrants.organizationId,
            revokedAt: gatewayDeviceGrants.revokedAt,
            expiresAt: gatewayDeviceGrants.expiresAt,
            scopes: gatewayDeviceGrants.scopes,
          })
          .from(gatewayDeviceGrants)
          .where(
            or(
              eq(gatewayDeviceGrants.apiKeyId, auth.key.id),
              eq(gatewayDeviceGrants.previousApiKeyId, auth.key.id),
            ),
          )
          .limit(1);
        if (grant) {
          if (grant.revokedAt !== null) {
            return { response: invalidKey(request, "api_key_revoked") };
          }
          if (grant.expiresAt <= now) {
            return { response: invalidKey(request, "api_key_expired") };
          }
          if (!hasScope(grant.scopes, "usage:read")) {
            return { response: insufficientScope(request) };
          }
          const grantId =
            grant.organizationId === auth.key.organizationId ? grant.id : null;
          return {
            principal: {
              kind: "api_key",
              organizationId: auth.key.organizationId,
              apiKeyId: auth.key.id,
              grantId,
            },
          };
        }
      }
      return {
        principal: {
          kind: "api_key",
          organizationId: auth.key.organizationId,
          apiKeyId: auth.key.id,
          grantId: null,
        },
      };
    }
  }
  return authenticateAccountRequest(request, deps);
}

function targetGrant(
  request: Request,
  principal: AccountPrincipal,
  id: string,
): { id: string } | { response: Response } {
  if (id === "current") {
    if (principal.kind !== "api_key" || !principal.grantId)
      return { response: notFound(request) };
    return { id: principal.grantId };
  }
  if (
    principal.kind === "api_key" &&
    (!principal.grantId || id.toLowerCase() !== principal.grantId.toLowerCase())
  ) {
    return { response: crossDevice(request) };
  }
  if (!UUID_RE.test(id)) return { response: notFound(request) };
  return { id };
}

function method(request: Request, expected: string): Response | null {
  if (request.method === expected) return null;
  const response = deviceGrantErrorResponse(
    request,
    405,
    "method_not_allowed",
    "Méthode HTTP non permise.",
    "HTTP method not allowed.",
  );
  response.headers.set("allow", expected);
  return response;
}

function methods(
  request: Request,
  allowed: readonly string[],
): Response | null {
  if (allowed.includes(request.method)) return null;
  const response = deviceGrantErrorResponse(
    request,
    405,
    "method_not_allowed",
    "Méthode HTTP non permise.",
    "HTTP method not allowed.",
  );
  response.headers.set("allow", allowed.join(", "));
  return response;
}

function handleError(
  request: Request,
  deps: DeviceGrantsHttpDeps,
  error: unknown,
): Response {
  if (error instanceof DeviceGrantError) {
    const english = isEnglishPreferred(request);
    const rechargeUrl =
      error.status === 402 ? billingUrl(deps.siteUrl, english) : undefined;
    return deviceGrantErrorResponse(
      request,
      error.status,
      error.code,
      error.messageFr,
      error.messageEn,
      {
        wwwAuthenticate: error.status === 401,
        rechargeUrl,
        retryAfterSeconds: error.status === 429 ? 60 : undefined,
      },
    );
  }
  deps.log?.error("accès appareil : erreur interne", {
    errorName: error instanceof Error ? error.name : typeof error,
  });
  return deviceGrantErrorResponse(
    request,
    500,
    "internal_error",
    "Une erreur interne est survenue.",
    "An internal error occurred.",
  );
}

async function run(
  request: Request,
  deps: DeviceGrantsHttpDeps,
  expected: string,
  f: (principal: AccountPrincipal) => Promise<Response>,
): Promise<Response> {
  const wrongMethod = method(request, expected);
  if (wrongMethod) return wrongMethod;
  try {
    const auth = await authenticateAccountRequest(request, deps);
    return "response" in auth ? auth.response : await f(auth.principal);
  } catch (error) {
    return handleError(request, deps, error);
  }
}

async function runReader(
  request: Request,
  deps: DeviceGrantsHttpDeps,
  expected: string,
  f: (principal: AccountPrincipal) => Promise<Response>,
): Promise<Response> {
  const wrongMethod = method(request, expected);
  if (wrongMethod) return wrongMethod;
  try {
    const auth = await authenticateAccountReader(request, deps);
    return "response" in auth ? auth.response : await f(auth.principal);
  } catch (error) {
    return handleError(request, deps, error);
  }
}

async function runMethods(
  request: Request,
  deps: DeviceGrantsHttpDeps,
  allowed: readonly string[],
  f: (principal: AccountPrincipal) => Promise<Response>,
): Promise<Response> {
  const wrongMethod = methods(request, allowed);
  if (wrongMethod) return wrongMethod;
  try {
    const auth = await authenticateAccountRequest(request, deps);
    return "response" in auth ? auth.response : await f(auth.principal);
  } catch (error) {
    return handleError(request, deps, error);
  }
}

function withoutKey<T extends object>(grant: T): Omit<T, "key" | "keyHash"> {
  const {
    key: _key,
    keyHash: _hash,
    ...safe
  } = grant as T & {
    key?: unknown;
    keyHash?: unknown;
  };
  return safe;
}

async function readOptionalJsonObject(
  request: Request,
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false }> {
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return { ok: false };
  }
  if (!raw.trim()) return { ok: true, value: {} };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false };
  }
}

function parseGracePeriodSeconds(
  body: Record<string, unknown>,
): { ok: true; value: number | undefined } | { ok: false } {
  const raw = body.grace_period_seconds ?? body.gracePeriodSeconds;
  if (raw === undefined) return { ok: true, value: undefined };
  if (
    typeof raw !== "number" ||
    !Number.isSafeInteger(raw) ||
    raw < 0 ||
    raw > MAX_GRACE_PERIOD_SECONDS
  ) {
    return { ok: false };
  }
  return { ok: true, value: raw };
}

function parseBodyGrantId(body: Record<string, unknown>): string | null {
  const raw = body.grant_id ?? body.grantId;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function applyCustomGracePeriod(
  db: Database,
  organizationId: string,
  grantId: string,
  now: Date,
  gracePeriodSeconds: number,
  expiresAtIso: string,
): Promise<string | null> {
  const [grantRow] = await db
    .select({
      previousApiKeyId: gatewayDeviceGrants.previousApiKeyId,
      expiresAt: gatewayDeviceGrants.expiresAt,
    })
    .from(gatewayDeviceGrants)
    .where(
      and(
        eq(gatewayDeviceGrants.organizationId, organizationId),
        eq(gatewayDeviceGrants.id, grantId),
      ),
    )
    .limit(1);
  if (!grantRow) return expiresAtIso;

  if (gracePeriodSeconds === 0) {
    if (grantRow.previousApiKeyId) {
      await db
        .update(apiKeys)
        .set({ revokedAt: now, expiresAt: now })
        .where(
          and(
            eq(apiKeys.organizationId, organizationId),
            eq(apiKeys.id, grantRow.previousApiKeyId),
          ),
        );
    }
    await db
      .update(gatewayDeviceGrants)
      .set({
        previousApiKeyId: null,
        graceExpiresAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(gatewayDeviceGrants.organizationId, organizationId),
          eq(gatewayDeviceGrants.id, grantId),
        ),
      );
    return null;
  }

  const graceExpiresAt = new Date(
    Math.min(
      grantRow.expiresAt.getTime(),
      now.getTime() + gracePeriodSeconds * 1_000,
    ),
  );
  if (grantRow.previousApiKeyId) {
    await db
      .update(apiKeys)
      .set({ expiresAt: graceExpiresAt })
      .where(
        and(
          eq(apiKeys.organizationId, organizationId),
          eq(apiKeys.id, grantRow.previousApiKeyId),
        ),
      );
  }
  await db
    .update(gatewayDeviceGrants)
    .set({ graceExpiresAt, updatedAt: now })
    .where(
      and(
        eq(gatewayDeviceGrants.organizationId, organizationId),
        eq(gatewayDeviceGrants.id, grantId),
      ),
    );
  return graceExpiresAt.toISOString();
}

interface ParsedCreateBody {
  deviceId: string;
  deviceLabel: string;
  product?: string | null;
  scopes?: {
    models?: string[];
    webpilot?: string[];
    daily_cap_micros?: number;
  };
  spendCapCad?: number | null;
  ttlDays?: number;
  requirePositiveBalance?: boolean;
}

function parseCreateBody(value: unknown): ParsedCreateBody | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const rawDeviceId = v.device_id ?? v.deviceId;
  const rawDeviceLabel =
    v.device_label ?? v.deviceLabel ?? v.label ?? v.device_name ?? v.machine_label;
  if (typeof rawDeviceId !== "string" || !rawDeviceId.trim()) return null;
  if (typeof rawDeviceLabel !== "string" || !rawDeviceLabel.trim()) return null;

  const rawProduct = v.product;
  if (
    rawProduct !== undefined &&
    rawProduct !== null &&
    typeof rawProduct !== "string"
  ) {
    return null;
  }

  let parsedScopes: ParsedCreateBody["scopes"];
  if (v.scopes !== undefined && v.scopes !== null) {
    if (Array.isArray(v.scopes)) {
      if (v.scopes.some((item) => typeof item !== "string")) return null;
      const list = v.scopes as string[];
      const wantsModels = list.includes("models") || list.includes("*");
      const wantsWebpilot = list.includes("webpilot") || list.includes("*");
      parsedScopes = {
        models: wantsModels ? ["*"] : [],
        webpilot: wantsWebpilot
          ? ["search", "scrape", "crawl", "extract", "sessions"]
          : [],
      };
    } else if (typeof v.scopes === "object") {
      const sc = v.scopes as Record<string, unknown>;
      if (
        sc.models !== undefined &&
        (!Array.isArray(sc.models) ||
          sc.models.some((m) => typeof m !== "string"))
      ) {
        return null;
      }
      if (
        sc.webpilot !== undefined &&
        (!Array.isArray(sc.webpilot) ||
          sc.webpilot.some((op) => typeof op !== "string"))
      ) {
        return null;
      }
      if (
        sc.daily_cap_micros !== undefined &&
        (typeof sc.daily_cap_micros !== "number" ||
          !Number.isSafeInteger(sc.daily_cap_micros) ||
          sc.daily_cap_micros <= 0)
      ) {
        return null;
      }
      parsedScopes = {
        ...(sc.models !== undefined ? { models: sc.models as string[] } : {}),
        ...(sc.webpilot !== undefined
          ? { webpilot: sc.webpilot as string[] }
          : {}),
        ...(sc.daily_cap_micros !== undefined
          ? { daily_cap_micros: sc.daily_cap_micros }
          : {}),
      };
    } else {
      return null;
    }
  }

  const rawSpendCap = v.spend_cap_cad ?? v.spendCapCad;
  let spendCapCad: number | null | undefined;
  if (rawSpendCap === null) {
    spendCapCad = null;
  } else if (rawSpendCap !== undefined) {
    const n =
      typeof rawSpendCap === "number"
        ? rawSpendCap
        : typeof rawSpendCap === "string" && rawSpendCap.trim() !== ""
          ? Number(rawSpendCap)
          : Number.NaN;
    if (!Number.isFinite(n) || n < 0) return null;
    spendCapCad = n;
  }

  const rawTtl = v.ttl_days ?? v.ttlDays;
  let ttlDays: number | undefined;
  if (rawTtl !== undefined) {
    if (typeof rawTtl !== "number" || !Number.isInteger(rawTtl)) return null;
    ttlDays = rawTtl;
  }

  const rawRequireFunded =
    v.require_positive_balance ?? v.requirePositiveBalance;
  const requirePositiveBalance =
    typeof rawRequireFunded === "boolean" ? rawRequireFunded : undefined;

  return {
    deviceId: rawDeviceId.trim(),
    deviceLabel: rawDeviceLabel.trim(),
    product: (rawProduct as string | null | undefined) ?? "lifecode",
    scopes: parsedScopes,
    spendCapCad,
    ttlDays,
    requirePositiveBalance,
  };
}

export function handleCreateDeviceGrant(
  request: Request,
  deps: DeviceGrantsHttpDeps,
): Promise<Response> {
  return run(request, deps, "POST", async (principal) => {
    if (principal.kind === "api_key") {
      return deviceGrantErrorResponse(
        request,
        403,
        "insufficient_scope",
        "Une clé d'appareil ne peut pas émettre un nouvel accès d'appareil.",
        "A device API key cannot issue a new device grant.",
      );
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest(
        request,
        "Corps JSON invalide.",
        "Invalid JSON request body.",
      );
    }
    const input = parseCreateBody(body);
    if (!input) {
      return badRequest(
        request,
        "Paramètres d'appareil invalides (device_id et device_label requis).",
        "Invalid device parameters (device_id and device_label are required).",
      );
    }
    const issued = await createDeviceGrant(deps.db(), {
      ...input,
      organizationId: principal.organizationId,
      userId: principal.userId,
      now: deps.now(),
    });
    return json(issued, 201);
  });
}

export function handleListDeviceGrants(
  request: Request,
  deps: DeviceGrantsHttpDeps,
): Promise<Response> {
  return run(request, deps, "GET", async (principal) => {
    const includeRevoked =
      new URL(request.url).searchParams.get("include_revoked") === "true";
    const all = await listDeviceGrants(deps.db(), {
      organizationId: principal.organizationId,
      includeRevoked,
    });
    const visible =
      principal.kind === "api_key"
        ? principal.grantId
          ? all.filter((g) => g.grant_id === principal.grantId)
          : []
        : all;
    const grants = visible.map(withoutKey);
    return json({ object: "list", data: grants, grants });
  });
}

export function handleGetDeviceGrant(
  request: Request,
  grantId: string,
  deps: DeviceGrantsHttpDeps,
): Promise<Response> {
  return run(request, deps, "GET", async (principal) => {
    const target = targetGrant(request, principal, grantId);
    if ("response" in target) return target.response;
    const grant = await getDeviceGrant(deps.db(), {
      organizationId: principal.organizationId,
      grantId: target.id,
    });
    return grant ? json(withoutKey(grant)) : notFound(request);
  });
}

export function handleRotateDeviceGrant(
  request: Request,
  grantId: string,
  deps: DeviceGrantsHttpDeps,
): Promise<Response> {
  return run(request, deps, "POST", async (principal) => {
    if (
      principal.kind === "session" &&
      principal.role !== "owner" &&
      principal.role !== "admin"
    ) {
      return forbidden(request);
    }
    const target = targetGrant(request, principal, grantId);
    if ("response" in target) return target.response;
    const issued = await rotateDeviceGrant(deps.db(), {
      organizationId: principal.organizationId,
      grantId: target.id,
      actingApiKeyId: principal.kind === "api_key" ? principal.apiKeyId : null,
      userId: principal.kind !== "api_key" ? principal.userId : null,
      now: deps.now(),
    });
    return json(issued, 200);
  });
}

/**
 * `POST /v1/account/device-grants/rotate` (ou `/v1/device-grants/rotate`) :
 * - avec `Authorization: Bearer nxk_...`, localise le grant actif par `apiKeyId == auth.key.id`
 *   et exécute `rotateDeviceGrant` ;
 * - avec un principal compte (`nxo_...` OIDC ou session), exige `{ grant_id: "<uuid>", grace_period_seconds?: number }`
 *   dans le corps JSON.
 */
export function handleRotateSelfDeviceGrant(
  request: Request,
  deps: DeviceGrantsHttpDeps,
): Promise<Response> {
  return run(request, deps, "POST", async (principal) => {
    if (
      principal.kind === "session" &&
      principal.role !== "owner" &&
      principal.role !== "admin"
    ) {
      return forbidden(request);
    }

    const parsedBody = await readOptionalJsonObject(request);
    if (!parsedBody.ok) {
      return badRequest(
        request,
        "Corps JSON invalide.",
        "Invalid JSON request body.",
      );
    }

    const graceCheck = parseGracePeriodSeconds(parsedBody.value);
    if (!graceCheck.ok) {
      return badRequest(
        request,
        "Paramètre grace_period_seconds invalide (entier entre 0 et 3600).",
        "Invalid grace_period_seconds parameter (integer between 0 and 3600).",
      );
    }
    const gracePeriodSeconds = graceCheck.value;
    const bodyGrantId = parseBodyGrantId(parsedBody.value);
    const db = deps.db();
    const now = deps.now();

    let resolvedGrantId: string;
    if (principal.kind === "api_key") {
      const [activeRow] = UUID_RE.test(principal.apiKeyId)
        ? await db
            .select({
              id: gatewayDeviceGrants.id,
              organizationId: gatewayDeviceGrants.organizationId,
            })
            .from(gatewayDeviceGrants)
            .where(eq(gatewayDeviceGrants.apiKeyId, principal.apiKeyId))
            .limit(1)
        : [];
      const activeGrantId =
        activeRow?.organizationId === principal.organizationId
          ? activeRow.id
          : null;
      if (bodyGrantId !== null) {
        if (
          !activeGrantId ||
          bodyGrantId.toLowerCase() !== activeGrantId.toLowerCase()
        ) {
          if (
            principal.grantId &&
            bodyGrantId.toLowerCase() === principal.grantId.toLowerCase()
          ) {
            return crossDevice(request);
          }
          return crossDevice(request);
        }
      }
      if (!activeGrantId) {
        return principal.grantId ? crossDevice(request) : notFound(request);
      }
      resolvedGrantId = activeGrantId;
    } else {
      if (!bodyGrantId || !UUID_RE.test(bodyGrantId)) {
        return badRequest(
          request,
          "Le champ grant_id (UUID) est requis.",
          "The grant_id (UUID) field is required.",
        );
      }
      resolvedGrantId = bodyGrantId;
    }

    const issued = await rotateDeviceGrant(db, {
      organizationId: principal.organizationId,
      grantId: resolvedGrantId,
      actingApiKeyId: principal.kind === "api_key" ? principal.apiKeyId : null,
      userId: principal.kind !== "api_key" ? principal.userId : null,
      now,
    });

    if (gracePeriodSeconds !== undefined) {
      const customGrace = await applyCustomGracePeriod(
        db,
        principal.organizationId,
        issued.grant_id,
        now,
        gracePeriodSeconds,
        issued.grace_expires_at ?? issued.expires_at,
      );
      return json({ ...issued, grace_expires_at: customGrace }, 200);
    }

    return json(issued, 200);
  });
}

export function handleRevokeDeviceGrant(
  request: Request,
  grantId: string,
  deps: DeviceGrantsHttpDeps,
): Promise<Response> {
  return runMethods(request, deps, ["POST", "DELETE"], async (principal) => {
    if (
      principal.kind === "session" &&
      principal.role !== "owner" &&
      principal.role !== "admin"
    ) {
      return forbidden(request);
    }
    const target = targetGrant(request, principal, grantId);
    if ("response" in target) return target.response;
    const result = await revokeDeviceGrant(deps.db(), {
      organizationId: principal.organizationId,
      grantId: target.id,
      actingApiKeyId: principal.kind === "api_key" ? principal.apiKeyId : null,
      now: deps.now(),
    });
    return json({ revoked: result.revoked, grant_id: result.grantId }, 200);
  });
}

/**
 * `POST` ou `DELETE` sur la route de révocation directe (`/v1/account/device-grants/revoke`) :
 * - avec `Authorization: Bearer nxk_...`, localise le grant par `apiKeyId` ou `previousApiKeyId`
 *   et appelle `revokeDeviceGrant` ;
 * - avec un principal compte (`nxo_...` OIDC ou session), exige `{ grant_id: "<uuid>" }` dans le corps JSON.
 */
export function handleRevokeSelfDeviceGrant(
  request: Request,
  deps: DeviceGrantsHttpDeps,
): Promise<Response> {
  return runMethods(request, deps, ["POST", "DELETE"], async (principal) => {
    if (
      principal.kind === "session" &&
      principal.role !== "owner" &&
      principal.role !== "admin"
    ) {
      return forbidden(request);
    }

    const parsedBody = await readOptionalJsonObject(request);
    if (!parsedBody.ok) {
      return badRequest(
        request,
        "Corps JSON invalide.",
        "Invalid JSON request body.",
      );
    }
    const bodyGrantId = parseBodyGrantId(parsedBody.value);
    const db = deps.db();

    let resolvedGrantId: string;
    if (principal.kind === "api_key") {
      const found = await findGrantByApiKeyId(db, principal.apiKeyId);
      const matchedGrantId =
        found?.organizationId === principal.organizationId
          ? found.id
          : principal.grantId;
      if (bodyGrantId !== null) {
        if (
          !matchedGrantId ||
          bodyGrantId.toLowerCase() !== matchedGrantId.toLowerCase()
        ) {
          return crossDevice(request);
        }
      }
      if (!matchedGrantId) return notFound(request);
      resolvedGrantId = matchedGrantId;
    } else {
      if (!bodyGrantId || !UUID_RE.test(bodyGrantId)) {
        return badRequest(
          request,
          "Le champ grant_id (UUID) est requis.",
          "The grant_id (UUID) field is required.",
        );
      }
      resolvedGrantId = bodyGrantId;
    }

    const result = await revokeDeviceGrant(db, {
      organizationId: principal.organizationId,
      grantId: resolvedGrantId,
      actingApiKeyId: principal.kind === "api_key" ? principal.apiKeyId : null,
      now: deps.now(),
    });
    return json({ revoked: result.revoked, grant_id: result.grantId }, 200);
  });
}

export function handleRevokeAllDeviceGrants(
  request: Request,
  deps: DeviceGrantsHttpDeps,
): Promise<Response> {
  return run(request, deps, "DELETE", async (principal) => {
    if (principal.kind === "api_key") return crossDevice(request);
    if (
      principal.kind === "session" &&
      principal.role !== "owner" &&
      principal.role !== "admin"
    ) {
      return forbidden(request);
    }
    if (principal.kind === "oidc") {
      const [membership] = await deps
        .db()
        .select({ role: members.role })
        .from(members)
        .where(
          and(
            eq(members.organizationId, principal.organizationId),
            eq(members.userId, principal.userId),
          ),
        )
        .limit(1);
      if (
        !membership ||
        (membership.role !== "owner" && membership.role !== "admin")
      ) {
        return forbidden(request);
      }
    }
    const { revokedCount } = await revokeAllDeviceGrants(deps.db(), {
      organizationId: principal.organizationId,
      now: deps.now(),
    });
    return json({ revoked: true, revoked_count: revokedCount }, 200);
  });
}

export function handleAccountBalance(
  request: Request,
  deps: DeviceGrantsHttpDeps,
): Promise<Response> {
  return runReader(request, deps, "GET", async (principal) => {
    const english = isEnglishPreferred(request);
    const rechargeUrl = billingUrl(deps.siteUrl, english);
    const [row] = await deps
      .db()
      .select()
      .from(creditAccounts)
      .where(eq(creditAccounts.organizationId, principal.organizationId))
      .limit(1);
    const totalBalance = row?.balanceMicro ?? 0n;
    const reserved = row?.heldMicro ?? 0n;
    if (totalBalance < 0n) {
      return deviceGrantErrorResponse(
        request,
        402,
        "account_blocked",
        "Le compte de facturation est bloqué (solde débiteur). Rechargez votre compte pour continuer.",
        "The billing account is blocked (negative balance). Add funds to continue.",
        { rechargeUrl },
      );
    }
    const available = totalBalance - reserved;
    return json({
      organization_id: principal.organizationId,
      currency: "CAD",
      balance_micros: Number(available),
      balance_cad: Number(available) / 1_000_000,
      total_balance_micros: Number(totalBalance),
      reserved_micros: Number(reserved),
      can_use_models: available > 0n,
      recharge_url: rechargeUrl,
    });
  });
}

function parseIsoDate(value: string): Date | null {
  const m =
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2}))?$/.exec(
      value,
    );
  if (!m) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function endpointToPoste(
  endpoint: string,
): "turn" | "embedding" | "rerank" | "webpilot" {
  const normalized = endpoint
    .toLowerCase()
    .replace(/^\/?v1\//, "")
    .replace(/^\//, "");
  if (
    normalized.startsWith("webpilot.") ||
    normalized.startsWith("webpilot/")
  ) {
    return "webpilot";
  }
  if (normalized === "embeddings" || normalized === "embedding")
    return "embedding";
  if (normalized === "rerank") return "rerank";
  return "turn";
}

export function handleAccountUsage(
  request: Request,
  deps: DeviceGrantsHttpDeps,
): Promise<Response> {
  return runReader(request, deps, "GET", async (principal) => {
    const params = new URL(request.url).searchParams;
    const fromText = params.get("from");
    const toText = params.get("to");
    const limitText = params.get("limit");
    const from = fromText === null ? null : parseIsoDate(fromText);
    const to = toText === null ? null : parseIsoDate(toText);
    if (
      (fromText !== null && !from) ||
      (toText !== null && !to) ||
      (from && to && from >= to)
    ) {
      return badRequest(
        request,
        "Plage temporelle invalide.",
        "Invalid date range.",
      );
    }
    if (
      limitText !== null &&
      (!/^\d+$/.test(limitText) ||
        !Number.isSafeInteger(Number(limitText)) ||
        Number(limitText) < 1)
    ) {
      return badRequest(request, "Limite invalide.", "Invalid limit.");
    }
    const limit = limitText === null ? 100 : Math.min(500, Number(limitText));
    const rows = await deps
      .db()
      .select({
        id: usageEvents.id,
        requestId: usageEvents.requestId,
        ts: usageEvents.createdAt,
        model: usageEvents.modelPublicId,
        endpoint: usageEvents.endpoint,
        inputTokens: usageEvents.promptTokens,
        outputTokens: usageEvents.completionTokens,
        cacheReadTokens: usageEvents.cachedTokens,
        reasoningTokens: usageEvents.reasoningTokens,
        costMicro: usageEvents.costMicro,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.organizationId, principal.organizationId),
          from ? gte(usageEvents.createdAt, from) : undefined,
          to ? lt(usageEvents.createdAt, to) : undefined,
        ),
      )
      .orderBy(desc(usageEvents.createdAt), desc(usageEvents.id))
      .limit(limit);

    const events = rows.map((row) => ({
      id: row.id,
      request_id: row.requestId,
      ts: row.ts.toISOString(),
      poste: endpointToPoste(row.endpoint),
      model: row.model,
      endpoint: row.endpoint,
      input_tokens: row.inputTokens,
      output_tokens: row.outputTokens,
      cache_read_tokens: row.cacheReadTokens,
      reasoning_tokens: row.reasoningTokens,
      cost_micros: Number(row.costMicro),
      cost_cad: Number(row.costMicro) / 1_000_000,
    }));
    return json({ object: "list", events, data: events });
  });
}
