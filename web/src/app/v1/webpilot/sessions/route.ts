import { webpilotDeps } from "@/server/webpilot/deps";
import { handleSessions } from "@/server/webpilot/handlers";

// Toujours rendue à la demande : jamais préparée au build (l'environnement y est absent et figerait la réponse).
export const dynamic = "force-dynamic";

// Sessions de navigateur : contrat en place, fonction pas encore ouverte (501).
export async function POST(request: Request) {
  return handleSessions(request, webpilotDeps());
}
