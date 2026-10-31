import { creativeAdminDeps } from "@/server/creative/deps";
import { handleCreativeAdmin } from "@/server/creative/handlers";

// Contrat (consommé par le module Directus « Nexora Creative ») :
//   GET  /api/admin/creative/config → { config, updatedAt, updatedBy, options: { llmModels, roles, recipes, secretRefs } }
//   PUT  /api/admin/creative/config ← configuration complète (version 1) → 200 { config, updatedAt } · 422 { error, issues }
// Authentification : Authorization: Bearer <NEXORA_APP_ADMIN_TOKEN> (temps constant). Aucune valeur de secret dans les réponses.
type Ctx = { params: Promise<{ path?: string[] }> };

const handle = async (request: Request, ctx: Ctx) =>
  handleCreativeAdmin(
    request,
    (await ctx.params).path ?? [],
    creativeAdminDeps(),
  );

export const GET = handle;
export const PUT = handle;
