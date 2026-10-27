import { gatewayDeps } from "@/server/gateway/deps";
import { handleChatCompletions } from "@/server/gateway/proxy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleChatCompletions(request, gatewayDeps());
}
