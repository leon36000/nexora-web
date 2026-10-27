import { handleVpsAction } from "@/server/vps/customer-handlers";
import { vpsCustomerDeps } from "@/server/vps/deps";

export async function POST(request: Request, ctx: RouteContext<"/api/account/vps/[id]/action">) {
  const { id } = await ctx.params;
  return handleVpsAction(request, id, await vpsCustomerDeps());
}
