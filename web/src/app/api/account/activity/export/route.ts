import { handleActivityExport } from "@/server/gateway/activity-handlers";
import { accountKeysDeps } from "@/server/gateway/deps";

// GET (mêmes filtres que la lecture JSON, sans limit ni cursor) → 200 text/csv en pièce jointe, UTF-8 avec BOM,
// 100 000 lignes au plus (en-tête x-nexora-export-truncated). Cellules de texte protégées contre l'injection de formules.
//   401 sans session · 403 origine étrangère · 422 paramètre invalide · 429 trop d'exports.
export async function GET(request: Request) {
  return handleActivityExport(request, await accountKeysDeps());
}
