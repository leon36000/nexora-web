import { siteAgentsAdminDeps } from "@/server/site-agents/deps";
import { handleSiteAgentsAdmin } from "@/server/site-agents/handlers";

// Contrat (consommé par le module Directus « Agents du site ») : voir docs/infra.md, section Autogestion.
// Authentification : Authorization: Bearer <NEXORA_APP_ADMIN_TOKEN> (temps constant).
type Ctx = { params: Promise<{ path?: string[] }> };

const handle = async (request: Request, ctx: Ctx) =>
  handleSiteAgentsAdmin(
    request,
    (await ctx.params).path ?? [],
    siteAgentsAdminDeps(),
  );

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
