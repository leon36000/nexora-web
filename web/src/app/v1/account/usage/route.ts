import { handleAccountUsage } from "@/server/gateway/device-grants-http";
import { getDeviceGrantsHttpDeps } from "@/server/gateway/device-grants-runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleAccountUsage(request, getDeviceGrantsHttpDeps());
}
