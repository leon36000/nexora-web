import { handleSetBalanceAlert } from "@/server/billing/alert-handlers";
import { accountKeysDeps } from "@/server/gateway/deps";

// PUT { enabled: boolean, thresholdCad: "12,50" } → 200 { enabled, thresholdMicro }
//   401 sans session · 403 non propriétaire ou origine · 422 seuil invalide · 429 trop d'appels.
export async function PUT(request: Request) {
  return handleSetBalanceAlert(request, await accountKeysDeps());
}
