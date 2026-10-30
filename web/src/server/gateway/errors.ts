import {
  blockedMessage,
  noCreditsMessage,
  notEnoughCreditsMessage,
} from "../billing/credit-messages";
import { MICRO_PER_CREDIT } from "../ledger/money";

/** Erreurs au format OpenAI : `{ error: { message, type, param, code } }`. */

export type ErrorType =
  | "invalid_request_error"
  | "authentication_error"
  | "insufficient_quota"
  | "rate_limit_error"
  | "permission_error"
  | "api_error";

export function openAiError(
  status: number,
  code: string,
  message: string,
  type: ErrorType,
  headers: Record<string, string> = {},
  param: string | null = null,
): Response {
  return Response.json(
    { error: { message, type, param, code } },
    { status, headers: { "cache-control": "no-store", ...headers } },
  );
}

export const E = {
  invalidKey: (code: string, headers?: Record<string, string>) =>
    openAiError(
      401,
      code,
      code === "api_key_revoked"
        ? "Cette clé API a été révoquée."
        : code === "api_key_expired"
          ? "Cette clé API est expirée."
          : "Clé API invalide ou absente. Utilisez l'en-tête « Authorization: Bearer nxk_… ».",
      "authentication_error",
      { "www-authenticate": 'Bearer realm="nexora"', ...headers },
    ),
  badRequest: (
    message: string,
    code = "invalid_request",
    param: string | null = null,
    headers?: Record<string, string>,
  ) => openAiError(400, code, message, "invalid_request_error", headers, param),
  tooLarge: (headers?: Record<string, string>) =>
    openAiError(
      413,
      "request_too_large",
      "Corps de requête trop volumineux.",
      "invalid_request_error",
      headers,
    ),
  modelNotFound: (model: string, headers?: Record<string, string>) =>
    openAiError(
      404,
      "model_not_found",
      `Le modèle « ${model.slice(0, 80)} » n'existe pas ou n'est pas accessible avec cette clé.`,
      "invalid_request_error",
      headers,
      "model",
    ),
  /** Modèle publié au catalogue en « aperçu » : visible, pas encore appelable. Rien n'est réservé ni appelé en amont. */
  modelPreview: (headers?: Record<string, string>) =>
    openAiError(
      404,
      "model_not_available",
      "Ce modèle est en aperçu : il n'est pas encore disponible à l'appel.",
      "invalid_request_error",
      headers,
      "model",
    ),
  /**
   * Crédits insuffisants. `availableMicro` (disponible du grand livre) distingue « plus de crédits » (moins d'un
   * crédit, soit 10 000 micro-CAD) de « pas assez pour cette requête » ; absent, le message reste prudent.
   */
  insufficient: (headers?: Record<string, string>, availableMicro?: bigint) =>
    openAiError(
      402,
      "insufficient_quota",
      availableMicro !== undefined && availableMicro < MICRO_PER_CREDIT
        ? noCreditsMessage()
        : notEnoughCreditsMessage(),
      "insufficient_quota",
      headers,
    ),
  blocked: (headers?: Record<string, string>) =>
    openAiError(
      402,
      "account_blocked",
      blockedMessage(),
      "insufficient_quota",
      headers,
    ),
  keyCap: (headers?: Record<string, string>) =>
    openAiError(
      402,
      "api_key_spend_cap_reached",
      "Le plafond de dépense de cette clé API est atteint.",
      "insufficient_quota",
      headers,
    ),
  rateLimited: (headers: Record<string, string>) =>
    openAiError(
      429,
      "rate_limit_exceeded",
      "Limite de débit atteinte pour cette clé API. Réessayez après le délai indiqué.",
      "rate_limit_error",
      headers,
    ),
  upstream: (
    status: number,
    code: string,
    message: string,
    headers?: Record<string, string>,
  ) => openAiError(status, code, message, "api_error", headers),
  /** Privacy Router a refusé la sortie : la règle est nommée, jamais le contenu. */
  privacyDenied: (
    message: string,
    param: string | null,
    headers?: Record<string, string>,
  ) =>
    openAiError(
      403,
      "privacy_policy_denied",
      message,
      "permission_error",
      headers,
      param,
    ),
  /** Privacy Router ne répond pas : refus par précaution (échec fermé), rien n'est réservé ni facturé. */
  privacyUnavailable: (headers?: Record<string, string>) =>
    openAiError(
      503,
      "privacy_router_unavailable",
      "La couche de confidentialité est indisponible : la requête est refusée par précaution et rien n'est facturé. Réessayez dans un instant.",
      "api_error",
      headers,
    ),
  unavailable: (headers?: Record<string, string>) =>
    openAiError(
      503,
      "gateway_unavailable",
      "La passerelle n'est pas configurée.",
      "api_error",
      headers,
    ),
};

/** Adresse inconnue sous `/v1` : 404 au format OpenAI plutôt que la page HTML de Next.js. */
export function handleUnknownEndpoint(request: Request): Response {
  const path = new URL(request.url).pathname.slice(0, 80);
  return openAiError(
    404,
    "unknown_url",
    `Adresse inconnue : ${request.method} ${path}. Adresses prises en charge : /v1/models, /v1/chat/completions, /v1/embeddings, /v1/rerank, /v1/webpilot/{search,scrape,crawl,extract}, /v1/rag/.`,
    "invalid_request_error",
  );
}
