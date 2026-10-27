import { handlePaymentsAdmin } from "@/server/payments/admin-handlers";
import { paymentsAdminDeps } from "@/server/payments/deps";

// Contrat (consommé par le module Directus « Paiements ») : voir docs/infra.md, section Paiements.
// Authentification : Authorization: Bearer <NEXORA_APP_ADMIN_TOKEN> (temps constant).
type Ctx = { params: Promise<{ path?: string[] }> };

const handle = async (request: Request, ctx: Ctx) =>
  handlePaymentsAdmin(request, (await ctx.params).path ?? [], paymentsAdminDeps());

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
