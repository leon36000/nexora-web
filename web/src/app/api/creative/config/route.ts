import { creativeAdminDeps } from "@/server/creative/deps";
import { handleCreativeService } from "@/server/creative/handlers";

// Lu par le SERVICE Nexora Creative (jeton NEXORA_CREATIVE_SERVICE_TOKEN, distinct du jeton d'administration) :
// { configured: false } tant que rien n'est configuré ; sinon la configuration, avec la clé des moteurs cloud résolue.
export async function GET(request: Request) {
  return handleCreativeService(request, creativeAdminDeps());
}
