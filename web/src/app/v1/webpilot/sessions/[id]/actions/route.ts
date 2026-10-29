import { connection } from "next/server";
import { webpilotDeps } from "@/server/webpilot/deps";
import { handleSessionActions } from "@/server/webpilot/handlers";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  // Cache Components : sans cet appel, la route est préparée au build (sans environnement) et fige sa réponse.
  await connection();
  return handleSessionActions(request, (await ctx.params).id, webpilotDeps());
}
