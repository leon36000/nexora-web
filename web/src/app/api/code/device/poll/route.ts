import { deviceDeps } from "@/server/code/deps";
import { handleDevicePoll } from "@/server/code/device";

// POST { device_code } → 200 { status: pending | slow_down | denied | expired | approved(+ api_key, une seule fois) }
// 400 invalid_device_code. Contrat : docs/nexora-code.md.
export async function POST(request: Request) {
  return handleDevicePoll(request, deviceDeps());
}
