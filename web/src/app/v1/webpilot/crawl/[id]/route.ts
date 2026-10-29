import { webpilotDeps } from "@/server/webpilot/deps";
import { handleCrawlDelete, handleCrawlGet } from "@/server/webpilot/handlers";

// Toujours rendue à la demande : jamais préparée au build (l'environnement y est absent et figerait la réponse).
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  return handleCrawlGet(request, (await ctx.params).id, webpilotDeps());
}

export async function DELETE(request: Request, ctx: Ctx) {
  return handleCrawlDelete(request, (await ctx.params).id, webpilotDeps());
}
