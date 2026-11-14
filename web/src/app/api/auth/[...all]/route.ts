import { GET as handleNativeOidcAuthorize } from "@/app/oauth/authorize/route";
import { POST as handleNativeOidcToken } from "@/app/oauth/token/route";
import {
  ALLOWED_NATIVE_CLIENTS,
  handleDeviceOidcRevoke,
  handleDeviceOidcUserInfo,
} from "@/server/auth/device-oidc";
import { getAuth } from "@/server/auth/instance";
import { getDb } from "@/server/db";

// Better Auth : /api/auth/sign-up/email, /sign-in/email, /verify-email, /request-password-reset…
// Pour `/api/auth/oauth2/{authorize,token}`, les clients natifs de bureau (`ALLOWED_NATIVE_CLIENTS`,
// code `nxc_…`) sont servis par `device-oidc` tandis que WorkStudio reste servi par Better Auth.
// Idem pour `/userinfo` (jeton `nxo_…`) et `/revoke` (RFC 7009, jeton `nxo_…` ou client natif).
async function isNativeDeviceTokenRequest(request: Request): Promise<boolean> {
  try {
    const ct = (request.headers.get("content-type") ?? "").toLowerCase();
    const cloned = request.clone();
    if (ct.includes("application/x-www-form-urlencoded")) {
      const params = new URLSearchParams(await cloned.text());
      const clientId = params.get("client_id")?.trim() ?? "";
      const code = params.get("code")?.trim() ?? "";
      return ALLOWED_NATIVE_CLIENTS.has(clientId) || code.startsWith("nxc_");
    }
    if (ct.includes("application/json")) {
      const body = (await cloned.json()) as Record<string, unknown>;
      const clientId =
        typeof body?.client_id === "string" ? body.client_id.trim() : "";
      const code = typeof body?.code === "string" ? body.code.trim() : "";
      return ALLOWED_NATIVE_CLIENTS.has(clientId) || code.startsWith("nxc_");
    }
  } catch {
    return false;
  }
  return false;
}

/** Client natif ou jeton `nxo_…` dans le corps d'une demande de révocation. */
async function isNativeDeviceRevokeRequest(request: Request): Promise<boolean> {
  const ct = (request.headers.get("content-type") ?? "").toLowerCase();
  try {
    const raw = await request.clone().text();
    let clientId = "";
    let token = "";
    if (ct.includes("application/json")) {
      const body = JSON.parse(raw) as Record<string, unknown>;
      clientId = typeof body?.client_id === "string" ? body.client_id.trim() : "";
      token = typeof body?.token === "string" ? body.token.trim() : "";
    } else {
      const params = new URLSearchParams(raw);
      clientId = params.get("client_id")?.trim() ?? "";
      token = params.get("token")?.trim() ?? "";
    }
    return ALLOWED_NATIVE_CLIENTS.has(clientId) || token.startsWith("nxo_");
  } catch {
    return false;
  }
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/api/auth/oauth2/authorize") {
    const clientId = url.searchParams.get("client_id")?.trim() ?? "";
    if (ALLOWED_NATIVE_CLIENTS.has(clientId)) {
      return handleNativeOidcAuthorize(request);
    }
  }
  if (url.pathname === "/api/auth/oauth2/userinfo") {
    const auth = request.headers.get("authorization") ?? "";
    if (/^Bearer\s+nxo_/i.test(auth.trim())) {
      return handleDeviceOidcUserInfo(request, { db: getDb() });
    }
  }
  return getAuth().handler(request);
}

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (
    url.pathname === "/api/auth/oauth2/token" &&
    (await isNativeDeviceTokenRequest(request))
  ) {
    return handleNativeOidcToken(request);
  }
  if (
    url.pathname === "/api/auth/oauth2/revoke" &&
    (await isNativeDeviceRevokeRequest(request))
  ) {
    return handleDeviceOidcRevoke(request, { db: getDb() });
  }
  return getAuth().handler(request);
}
