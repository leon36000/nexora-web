import { vaultDeps } from "@/server/vault/deps";
import { handleRevoke } from "@/server/vault/handlers";

export async function DELETE(
  request: Request,
  ctx: RouteContext<"/api/admin/vault/[ref]">,
) {
  const { ref } = await ctx.params;
  return handleRevoke(request, ref, vaultDeps());
}
