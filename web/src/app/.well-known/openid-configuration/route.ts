import { SITE_URL } from "@/lib/site";
import { handleDeviceOidcDiscovery } from "@/server/auth/device-oidc";

// Métadonnées OIDC des clients natifs de bureau (`lifecode-desktop`, `creative-studio-desktop`).
export const dynamic = "force-dynamic";

export function GET(): Response {
  return handleDeviceOidcDiscovery(SITE_URL);
}
