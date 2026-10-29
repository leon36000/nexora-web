/**
 * Contrat de Nexora Privacy Router (interface partagée).
 *
 * Toute sortie de données vers un tiers (fournisseur d'IA, site web, API externe)
 * passe par `PrivacyRouter.evaluate` avant d'avoir lieu. Panne de la couche = refus
 * (échec fermé). Voir docs/superpowers/specs/2026-10-29-webpilot-contrat-api.md §6.
 */

export type PrivacyProduct = "gateway" | "webpilot" | "workstudio";

export type PrivacyOperation =
  | "chat"
  | "embeddings"
  | "search"
  | "scrape"
  | "crawl"
  | "extract"
  | "session.goto"
  | "session.type"
  | "webhook";

export type PrivacyKind = "query" | "url" | "form_input" | "page_content" | "prompt";

export type OutboundIntent = {
  organizationId: string;
  apiKeyId: string | null;
  product: PrivacyProduct;
  operation: PrivacyOperation;
  /** Destination de la sortie : hôte (toujours) et chemin (si la politique le demande), ou modèle visé. */
  destination: { host: string; path?: string } | { model: string };
  /** Nature des données qui sortent. */
  kinds: readonly PrivacyKind[];
  /** Le contenu n'est passé que si la politique doit l'inspecter. */
  content?: string;
};

export type PrivacyDenyReason =
  | "host_not_allowed"
  | "host_blocked"
  | "model_not_allowed"
  | "sensitive_data"
  | "strict_sovereignty"
  | "policy_invalid";

export type PrivacyDecision =
  | { decision: "allow"; policyVersion: string }
  | {
      decision: "mask";
      policyVersion: string;
      content: string;
      ruleIds: string[];
    }
  | {
      decision: "deny";
      policyVersion: string;
      ruleId: string;
      reason: PrivacyDenyReason;
    };

export interface PrivacyRouter {
  evaluate(intent: OutboundIntent): Promise<PrivacyDecision>;
}

/** Levée quand la couche ne peut pas décider : l'appelant répond 503 `privacy_router_unavailable`. */
export class PrivacyRouterUnavailableError extends Error {
  constructor(message = "Privacy Router indisponible") {
    super(message);
    this.name = "PrivacyRouterUnavailableError";
  }
}
