import { E, type ErrorType, openAiError } from "../gateway/errors";

/**
 * Erreurs de WebPilot (contrat §8) : même enveloppe OpenAI que la passerelle, messages en français. Les trois 402
 * sont CELLES de la passerelle (`E.insufficient`, `E.blocked`, `E.keyCap`), jamais une copie.
 */
type H = Record<string, string> | undefined;

const invalid = (
  status: number,
  code: string,
  message: string,
  param: string | null,
  headers?: H,
) =>
  openAiError(status, code, message, "invalid_request_error", headers, param);
const api = (status: number, code: string, message: string, headers?: H) =>
  openAiError(status, code, message, "api_error" satisfies ErrorType, headers);

export const W = {
  insufficient: E.insufficient,
  blocked: E.blocked,
  keyCap: E.keyCap,
  invalidKey: E.invalidKey,
  rateLimited: E.rateLimited,
  tooLarge: E.tooLarge,
  badRequest: E.badRequest,
  notAllowed: (operation: string, headers?: H) =>
    invalid(
      403,
      "operation_not_allowed",
      `Cette clé API n'a pas la permission WebPilot « ${operation} ». Cochez-la dans l'écran des clés.`,
      null,
      headers,
    ),
  urlNotAllowed: (headers?: H, param: string | null = "url") =>
    invalid(
      400,
      "url_not_allowed",
      "Adresse refusée : seules les adresses http et https d'un site public, sur un port permis, sont lues.",
      param,
      headers,
    ),
  privacyDenied: (ruleId: string, reason: string, headers?: H) =>
    invalid(
      403,
      "privacy_policy_denied",
      `La politique de confidentialité de votre organisation a refusé cette sortie (règle ${ruleId.slice(0, 60)}, motif ${reason}).`,
      null,
      headers,
    ),
  privacyUnavailable: (headers?: H) =>
    api(
      503,
      "privacy_router_unavailable",
      "La couche de confidentialité ne répond pas : rien n'est sorti et rien n'est facturé.",
      headers,
    ),
  robotsDisallowed: (headers?: H) =>
    invalid(
      403,
      "robots_disallowed",
      "Le site interdit la lecture automatisée de cette page (robots.txt). Rien n'est facturé.",
      null,
      headers,
    ),
  notFound: (headers?: H) =>
    invalid(
      404,
      "not_found",
      "Ressource introuvable, expirée ou d'une autre organisation.",
      null,
      headers,
    ),
  targetUnreachable: (message: string, headers?: H) =>
    invalid(
      422,
      "target_unreachable",
      `${message} Rien n'est facturé.`,
      null,
      headers,
    ),
  unsupportedContent: (type: string, headers?: H) =>
    invalid(
      422,
      "unsupported_content",
      `Ce type de contenu n'est pas pris en charge (${type.slice(0, 60)}). Rien n'est facturé.`,
      null,
      headers,
    ),
  renderUnavailable: (headers?: H) =>
    invalid(
      422,
      "render_unavailable",
      "Le rendu par navigateur n'est pas encore disponible. Utilisez render: « static ».",
      "render",
      headers,
    ),
  targetError: (message: string, headers?: H) =>
    api(502, "target_error", `${message} Rien n'est facturé.`, headers),
  targetTimeout: (headers?: H) =>
    api(
      504,
      "target_timeout",
      "La cible n'a pas répondu à temps. Rien n'est facturé.",
      headers,
    ),
  unavailable: (message: string, headers?: H) =>
    api(503, "webpilot_unavailable", message, headers),
  sessionClosed: (reason: string | null, headers?: H) =>
    invalid(
      409,
      "session_closed",
      `La session est fermée${reason ? ` (motif : ${reason})` : ""}. Ouvrez-en une nouvelle.`,
      null,
      headers,
    ),
  sessionBusy: (headers?: H) =>
    invalid(
      409,
      "session_busy",
      "Un lot d'actions est déjà en cours dans cette session. Attendez sa réponse.",
      null,
      headers,
    ),
  internal: (headers?: H) =>
    api(500, "internal_error", "Erreur interne de WebPilot.", headers),
};

/** Objet `error` d'une ressource (tâche échouée) : le même que celui de l'erreur HTTP de la passerelle. */
export async function errorObject(
  code: string,
): Promise<Record<string, unknown> | null> {
  const res =
    code === "insufficient_quota"
      ? E.insufficient()
      : code === "account_blocked"
        ? E.blocked()
        : code === "api_key_spend_cap_reached"
          ? E.keyCap()
          : code === "privacy_router_unavailable"
            ? W.privacyUnavailable()
            : null;
  if (!res) return null;
  return ((await res.json()) as { error: Record<string, unknown> }).error;
}

export const tooManyCrawls = (headers?: Record<string, string>) =>
  openAiError(
    429,
    "rate_limit_exceeded",
    "Trop d'explorations actives pour cette organisation. Attendez la fin de l'une d'elles ou annulez-en une.",
    "rate_limit_error",
    { "retry-after": "60", ...headers },
  );

export const tooManySessions = (headers?: Record<string, string>) =>
  openAiError(
    429,
    "rate_limit_exceeded",
    "Trop de sessions de navigateur ouvertes pour cette organisation. Fermez-en une avant d'en ouvrir une autre.",
    "rate_limit_error",
    { "retry-after": "60", ...headers },
  );
