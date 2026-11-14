import { handleRevokeSelfDeviceGrant } from "@/server/gateway/device-grants-http";
import { getDeviceGrantsHttpDeps } from "@/server/gateway/device-grants-runtime";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleRevokeSelfDeviceGrant(request, getDeviceGrantsHttpDeps());
}

export function DELETE(request: Request): Promise<Response> {
  return handleRevokeSelfDeviceGrant(request, getDeviceGrantsHttpDeps());
}
