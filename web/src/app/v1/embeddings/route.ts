import { gatewayDeps } from "@/server/gateway/deps";
import { handleEmbeddings } from "@/server/gateway/proxy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleEmbeddings(request, gatewayDeps());
}
