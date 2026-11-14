import {
  handleGetDeviceGrant,
  handleRevokeDeviceGrant,
} from "@/server/gateway/device-grants-http";
import { getDeviceGrantsHttpDeps } from "@/server/gateway/device-grants-runtime";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { id } = await context.params;
  return handleGetDeviceGrant(request, id, getDeviceGrantsHttpDeps());
}

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { id } = await context.params;
  return handleRevokeDeviceGrant(request, id, getDeviceGrantsHttpDeps());
}
