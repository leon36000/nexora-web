import { connection } from "next/server";
import { webpilotDeps } from "@/server/webpilot/deps";
import { handleSessions } from "@/server/webpilot/handlers";

// Sessions de navigateur : contrat en place, fonction pas encore ouverte (501).
export async function POST(request: Request) {
  // Cache Components : sans cet appel, la route est préparée au build (sans environnement) et fige sa réponse.
  await connection();
  return handleSessions(request, webpilotDeps());
}
