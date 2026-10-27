import { seoAdminDeps } from "@/server/seo-admin/deps";
import { handleSeoAdmin } from "@/server/seo-admin/handlers";

// Contrat (consommé par le module Directus « SEO »). Authentification : Bearer <NEXORA_APP_ADMIN_TOKEN>.
type Ctx = { params: Promise<{ path?: string[] }> };

const handle = async (request: Request, ctx: Ctx) =>
  handleSeoAdmin(request, (await ctx.params).path ?? [], seoAdminDeps());

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
