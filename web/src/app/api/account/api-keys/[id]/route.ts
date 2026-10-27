import { handleRevokeKey } from "@/server/gateway/account-handlers";
import { accountKeysDeps } from "@/server/gateway/deps";

// DELETE → 200 { id, revokedAt } · 404 si la clé n'est pas à l'organisation de la session.
export async function DELETE(
  request: Request,
  ctx: RouteContext<"/api/account/api-keys/[id]">,
) {
  return handleRevokeKey(
    request,
    (await ctx.params).id,
    await accountKeysDeps(),
  );
}
