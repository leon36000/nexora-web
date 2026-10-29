import { privacyAccountDeps } from "@/server/privacy/account-deps";
import { handlePrivacyReport } from "@/server/privacy/account-handlers";

// GET ?month=AAAA-MM (défaut : mois courant, UTC) → 200 text/csv en pièce jointe, UTF-8 avec BOM : décisions du
// mois regroupées par jour, produit, opération, décision, destination et règles (sans contenu).
//   401 sans session · 403 non propriétaire ou origine étrangère · 422 mois invalide · 429 trop d'exports.
export async function GET(request: Request) {
  return handlePrivacyReport(request, await privacyAccountDeps());
}
