import { privacyAccountDeps } from "@/server/privacy/account-deps";
import {
  handlePrivacyGet,
  handlePrivacyPut,
} from "@/server/privacy/account-handlers";

// GET → 200 { level, version, isDefault, invalid, config, recent: { days, counts }, versions } :
//   politique de confidentialité en vigueur de l'organisation de la session (version 0 = politique par défaut).
// PUT { level: "standard"|"renforce"|"souverain", config?: { maskCategories?, denyCategories?, allowedHosts?,
//   blockedHosts?, allowedModels?, blockAttachments? } } → 200 { version, changed, level, config } ; nouvelle version.
//   401 sans session · 403 non propriétaire ou origine étrangère · 422 corps invalide · 429 trop d'appels.
// Métadonnées seulement : jamais le contenu d'une requête.
export async function GET(request: Request) {
  return handlePrivacyGet(request, await privacyAccountDeps());
}

export async function PUT(request: Request) {
  return handlePrivacyPut(request, await privacyAccountDeps());
}
