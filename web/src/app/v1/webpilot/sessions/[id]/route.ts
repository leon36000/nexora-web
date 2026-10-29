import { connection } from "next/server";
import { webpilotDeps } from "@/server/webpilot/deps";
import {
  handleSessionDelete,
  handleSessionGet,
} from "@/server/webpilot/handlers";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  // Cache Components : sans cet appel, la route est préparée au build (sans environnement) et fige sa réponse.
  await connection();
  return handleSessionGet(request, (await ctx.params).id, webpilotDeps());
}

export async function DELETE(request: Request, ctx: Ctx) {
  // Cache Components : sans cet appel, la route est préparée au build (sans environnement) et fige sa réponse.
  await connection();
  return handleSessionDelete(request, (await ctx.params).id, webpilotDeps());
}
