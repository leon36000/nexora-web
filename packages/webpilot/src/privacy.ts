/**
 * Point d'accroche de Nexora Privacy Router vu du moteur WebPilot. Mêmes formes que `PrivacyRouter` de
 * web/src/server/privacy/types.ts (une instance de ce dernier est acceptée telle quelle ; un test du site le vérifie).
 * Tout ce qui sort vers un tiers (hôte visité, requête de recherche, contenu envoyé à un modèle) passe par ici AVANT
 * de sortir. Panne de la couche = refus (échec fermé).
 */
export interface PrivacyIntent {
  organizationId: string;
  apiKeyId: string | null;
  product: "webpilot";
  operation: string;
  destination: { host: string; path?: string } | { model: string };
  kinds: readonly string[];
  content?: string;
}

export type PrivacyVerdict =
  | { decision: "allow"; policyVersion: string }
  | {
      decision: "mask";
      policyVersion: string;
      content: string;
      ruleIds: string[];
    }
  | { decision: "deny"; policyVersion: string; ruleId: string; reason: string };

export interface PrivacyGate {
  evaluate(intent: PrivacyIntent): Promise<PrivacyVerdict>;
}

/** La couche ne peut pas décider (levée par `PrivacyRouterUnavailableError` du site, reconnue par son nom). */
export function isPrivacyUnavailable(error: unknown): boolean {
  return (
    error instanceof Error && error.name === "PrivacyRouterUnavailableError"
  );
}
