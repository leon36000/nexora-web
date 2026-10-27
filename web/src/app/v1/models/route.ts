import { gatewayDeps } from "@/server/gateway/deps";
import { handleModels } from "@/server/gateway/proxy";

export async function GET(request: Request) {
  return handleModels(request, gatewayDeps());
}
