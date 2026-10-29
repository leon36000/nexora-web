import { webpilotDeps } from "@/server/webpilot/deps";
import { handleSessions } from "@/server/webpilot/handlers";

// Toujours rendue à la demande : jamais préparée au build (l'environnement y est absent et figerait la réponse).
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleSessions(request, webpilotDeps());
}

export async function DELETE(request: Request) {
  return handleSessions(request, webpilotDeps());
}
