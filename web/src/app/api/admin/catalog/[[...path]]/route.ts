import { handleCatalogAdmin } from "@/server/gateway/admin-handlers";
import { catalogAdminDeps } from "@/server/gateway/deps";

// Contrat (consommé par le module Directus « Modèles ») : voir docs/infra.md, section Passerelle.
// Authentification : Authorization: Bearer <NEXORA_APP_ADMIN_TOKEN> (temps constant).
type Ctx = { params: Promise<{ path?: string[] }> };

const handle = async (request: Request, ctx: Ctx) =>
  handleCatalogAdmin(
    request,
    (await ctx.params).path ?? [],
    catalogAdminDeps(),
  );

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
