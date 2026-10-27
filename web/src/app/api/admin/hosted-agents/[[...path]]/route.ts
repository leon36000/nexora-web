import { hostedAgentsAdminDeps } from "@/server/agents/deps";
import { handleHostedAgentsAdmin } from "@/server/agents/handlers";

// Contrat (consommé par le module Directus « Agents hébergés ») : voir docs/infra.md, section Agents hébergés.
// Authentification : Authorization: Bearer <NEXORA_APP_ADMIN_TOKEN> (temps constant).
type Ctx = { params: Promise<{ path?: string[] }> };

const handle = async (request: Request, ctx: Ctx) =>
  handleHostedAgentsAdmin(
    request,
    (await ctx.params).path ?? [],
    hostedAgentsAdminDeps(),
  );

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
