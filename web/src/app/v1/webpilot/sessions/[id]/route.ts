import { connection } from "next/server";
import { webpilotDeps } from "@/server/webpilot/deps";
import { handleSessions } from "@/server/webpilot/handlers";

export async function GET(request: Request) {
  // Cache Components : sans cet appel, la route est préparée au build (sans environnement) et fige sa réponse.
  await connection();
  return handleSessions(request, webpilotDeps());
}

export async function DELETE(request: Request) {
  // Cache Components : sans cet appel, la route est préparée au build (sans environnement) et fige sa réponse.
  await connection();
  return handleSessions(request, webpilotDeps());
}
