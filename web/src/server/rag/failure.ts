import { type ErrorType, openAiError } from "../gateway/errors";

/**
 * Échec d'une opération du RAG, indépendant du transport (HTTP, MCP, compte). Les messages sont en français et disent
 * quoi faire. Un échec « transitoire » (limite de débit, panne amont) laisse l'indexation reprendre plus tard.
 */
export interface RagFailure {
  status: number;
  code: string;
  message: string;
  type: ErrorType;
  param: string | null;
  transient: boolean;
  retryAfterSeconds?: number;
}

const f = (
  status: number,
  code: string,
  message: string,
  type: ErrorType = "invalid_request_error",
  param: string | null = null,
  transient = false,
): RagFailure => ({ status, code, message, type, param, transient });

export const F = {
  baseNotFound: () =>
    f(
      404,
      "base_not_found",
      "Cette base n'existe pas ou n'est pas accessible avec cette clé.",
    ),
  documentNotFound: () =>
    f(404, "document_not_found", "Ce document n'existe pas dans cette base."),
  invalid: (message: string, param: string | null = null) =>
    f(400, "invalid_request", message, "invalid_request_error", param),
  readOnly: () =>
    f(
      403,
      "read_only_key",
      "Cette clé est en lecture seule : elle peut chercher et lister, pas ajouter ni supprimer. Créez une clé avec le droit d'écriture depuis la page RAG de votre compte.",
      "permission_error",
    ),
  notAllowed: () =>
    f(
      403,
      "operation_not_allowed",
      "Cette clé n'a pas la permission RAG. Créez une clé pour une base depuis la page RAG de votre compte.",
      "permission_error",
    ),
  quotaExceeded: () =>
    f(
      507,
      "quota_exceeded",
      "Votre espace est plein : ce document ne tient pas dans le quota de votre offre. Supprimez des documents ou des bases que vous n'utilisez plus, ou ajoutez de l'espace depuis la page Facturation de votre compte.",
      "insufficient_quota",
    ),
  tooLarge: (message: string) =>
    f(413, "document_too_large", message, "invalid_request_error"),
  unsupportedType: (message: string) =>
    f(415, "unsupported_type", message, "invalid_request_error"),
  unprocessable: (message: string, code = "unprocessable_document") =>
    f(422, code, message, "invalid_request_error"),
  limit: (code: string, message: string) =>
    f(409, code, message, "invalid_request_error"),
  conflict: (code: string, message: string) =>
    f(409, code, message, "invalid_request_error"),
  noKey: () =>
    f(
      409,
      "no_active_key",
      "Aucune clé active pour cette base : créez-en une depuis la page RAG de votre compte pour pouvoir indexer et chercher.",
    ),
  modelUnavailable: (message: string) =>
    f(409, "model_unavailable", message, "invalid_request_error", "model"),
  unavailable: (message: string) =>
    f(503, "rag_unavailable", message, "api_error", null, true),
  upstream: (message: string) =>
    f(502, "invalid_upstream_response", message, "api_error", null, true),
  internal: () =>
    f(500, "internal_error", "Erreur interne du RAG.", "api_error", null, true),
};

export function failureResponse(
  failure: RagFailure,
  headers: Record<string, string> = {},
): Response {
  return openAiError(
    failure.status,
    failure.code,
    failure.message,
    failure.type,
    {
      ...headers,
      ...(failure.retryAfterSeconds
        ? { "retry-after": String(failure.retryAfterSeconds) }
        : {}),
    },
    failure.param,
  );
}

/**
 * Reprend telle quelle l'erreur de la passerelle (même code, même message, même statut : solde épuisé, refus du Privacy
 * Router, limite de débit…). 429 et 5xx sont transitoires.
 */
export async function gatewayFailure(res: Response): Promise<RagFailure> {
  let error: Record<string, unknown> = {};
  try {
    const body = (await res.json()) as { error?: Record<string, unknown> };
    if (body && typeof body.error === "object" && body.error)
      error = body.error;
  } catch {
    // corps illisible : valeurs par défaut ci-dessous
  }
  const retry = Number(res.headers.get("retry-after"));
  return {
    status: res.status,
    code: typeof error.code === "string" ? error.code : "upstream_error",
    message:
      typeof error.message === "string"
        ? error.message
        : "La passerelle a refusé la requête.",
    type: (typeof error.type === "string"
      ? error.type
      : "api_error") as ErrorType,
    param: typeof error.param === "string" ? error.param : null,
    transient: res.status === 429 || res.status >= 500,
    ...(Number.isFinite(retry) && retry > 0
      ? { retryAfterSeconds: Math.ceil(retry) }
      : {}),
  };
}
