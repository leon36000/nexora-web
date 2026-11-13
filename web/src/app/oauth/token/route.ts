import { SITE_URL } from "@/lib/site";
import { handleDeviceOidcToken } from "@/server/auth/device-oidc";
import { getDb } from "@/server/db";

export const dynamic = "force-dynamic";

// Client public (RFC 8252) : pas de client_secret, PKCE S256 obligatoire.
export async function POST(request: Request): Promise<Response> {
  return handleDeviceOidcToken(request, {
    db: getDb(),
    baseUrl: SITE_URL,
    signingSecret: process.env.BETTER_AUTH_SECRET ?? "dev-only-secret-change-me",
  });
}
