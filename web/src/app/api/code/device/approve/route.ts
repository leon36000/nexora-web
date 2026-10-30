import { deviceDeps } from "@/server/code/deps";
import { handleDeviceApprove } from "@/server/code/device";

// POST { user_code, decision?: "approve" | "deny" } → 200 { ok: true } · 400 invalid_code · 401 · 403 (origine, courriel
// non vérifié, 2FA du personnel) · 409 key_limit · 429. Session du site obligatoire. Contrat : docs/nexora-code.md.
export async function POST(request: Request) {
  return handleDeviceApprove(request, deviceDeps());
}
