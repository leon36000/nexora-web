import { webpilotDeps } from "@/server/webpilot/deps";
import { handleCrawlCreate } from "@/server/webpilot/handlers";

// Toujours rendue à la demande : jamais préparée au build (l'environnement y est absent et figerait la réponse).
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleCrawlCreate(request, webpilotDeps());
}
