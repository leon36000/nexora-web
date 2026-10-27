import { handleVpsAdmin } from "@/server/vps/admin-handlers";
import { vpsAdminDeps } from "@/server/vps/deps";

// Contrat (consommé par le module Directus « VPS ») : voir docs/infra.md, section VPS.
// Authentification : Authorization: Bearer <NEXORA_APP_ADMIN_TOKEN> (temps constant).
type Ctx = { params: Promise<{ path?: string[] }> };

const handle = async (request: Request, ctx: Ctx) =>
  handleVpsAdmin(request, (await ctx.params).path ?? [], vpsAdminDeps());

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
