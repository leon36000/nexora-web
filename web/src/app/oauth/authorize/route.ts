import { SITE_URL } from "@/lib/site";
import {
  type DeviceOidcSessionUser,
  handleDeviceOidcAuthorize,
} from "@/server/auth/device-oidc";
import { getAuth } from "@/server/auth/instance";
import { getDb } from "@/server/db";

export const dynamic = "force-dynamic";

/** Session Better Auth -> utilisateur minimal (null si non connecté ou session périmée). */
async function getSessionUser(
  headers: Headers,
): Promise<DeviceOidcSessionUser | null> {
  const session = await getAuth().api.getSession({ headers });
  return session?.user
    ? {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        twoFactorEnabled: session.user.twoFactorEnabled,
      }
    : null;
}

export async function GET(request: Request): Promise<Response> {
  return handleDeviceOidcAuthorize(request, {
    db: getDb(),
    baseUrl: SITE_URL,
    getSessionUser,
  });
}
