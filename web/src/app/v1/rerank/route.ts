import { gatewayDeps } from "@/server/gateway/deps";
import { handleRerank } from "@/server/gateway/proxy";

export async function POST(request: Request) {
  return handleRerank(request, gatewayDeps());
}
