import { deviceDeps } from "@/server/code/deps";
import { handleDeviceStart } from "@/server/code/device";

// POST { client, client_version, device_name } → 200 { device_code, user_code, verification_uri(_complete), expires_in, interval }
// Sans authentification, limité par adresse (429). Contrat : docs/nexora-code.md.
export async function POST(request: Request) {
  return handleDeviceStart(request, deviceDeps());
}
