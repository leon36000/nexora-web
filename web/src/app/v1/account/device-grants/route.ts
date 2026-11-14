import {
  handleCreateDeviceGrant,
  handleListDeviceGrants,
  handleRevokeAllDeviceGrants,
} from "@/server/gateway/device-grants-http";
import { getDeviceGrantsHttpDeps } from "@/server/gateway/device-grants-runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleListDeviceGrants(request, getDeviceGrantsHttpDeps());
}

export async function POST(request: Request): Promise<Response> {
  return handleCreateDeviceGrant(request, getDeviceGrantsHttpDeps());
}

export async function DELETE(request: Request): Promise<Response> {
  return handleRevokeAllDeviceGrants(request, getDeviceGrantsHttpDeps());
}
