import { connection } from "next/server";
import { gatewayDeps } from "@/server/gateway/deps";
import { handleModels } from "@/server/gateway/proxy";

export async function GET(request: Request) {
  // Rendu à la demande : la liste dépend de la clé et de la base `app`, absente à la compilation (image Docker).
  await connection();
  return handleModels(request, gatewayDeps());
}
