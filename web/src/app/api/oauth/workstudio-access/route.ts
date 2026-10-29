import { handleWorkstudioAccess } from "@/server/auth/workstudio-access";
import { workstudioAccessDeps } from "@/server/auth/workstudio-access-deps";

// GET, en-tête « Authorization: Bearer <jeton d'accès OIDC> » (client WorkStudio, portée workstudio:model)
//   → 200 { url, model, key } = NEXORA_UPSTREAM_URL / _MODEL / _KEY de l'organisation de l'utilisateur du jeton.
//   401 jeton absent, inconnu, expiré ou d'un autre client · 403 portée manquante, courriel non vérifié, personnel
//   sans double authentification · 404 fournisseur OIDC inactif · 429 trop d'appels · 503 passerelle non configurée.
// Jamais mis en cache ; ni la clé ni le jeton ne vont au journal. Voir docs/workstudio-integre.md.
// Rendue à la demande : préparée au build, sans l'environnement OIDC, elle figerait une réponse 404.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleWorkstudioAccess(request, workstudioAccessDeps());
}
