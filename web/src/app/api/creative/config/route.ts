import { connection } from "next/server";
import { creativeAdminDeps } from "@/server/creative/deps";
import { handleCreativeService } from "@/server/creative/handlers";

// Lu par le SERVICE Nexora Creative (jeton NEXORA_CREATIVE_SERVICE_TOKEN, distinct du jeton d'administration) :
// { configured: false } tant que rien n'est configuré ; sinon la configuration, avec la clé des moteurs cloud résolue.
export async function GET(request: Request) {
  // Rendu à la demande : la route lit la base `app`, qui n'existe pas à la compilation (image Docker).
  await connection();
  return handleCreativeService(request, creativeAdminDeps());
}
