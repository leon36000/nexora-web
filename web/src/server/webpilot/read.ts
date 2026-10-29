import {
  ReadError,
  type ReadResult,
  RenderBlockedHostError,
  RenderError,
  SafeFetchError,
} from "@nexora/webpilot";
import { W } from "./errors";
import type { Outcome } from "./pipeline";

/** Levée par un crochet de saut quand Privacy Router refuse (ou tombe) en cours de lecture : porte la réponse prête. */
export class PrivacyStop extends Error {
  readonly response: Response;
  readonly errorCode: string;
  readonly httpStatus: number;
  constructor(response: Response, errorCode: string, httpStatus: number) {
    super("privacy_stop");
    this.name = "PrivacyStop";
    this.response = response;
    this.errorCode = errorCode;
    this.httpStatus = httpStatus;
  }
}

const fail = (
  httpStatus: number,
  errorCode: string,
  response: (headers: Record<string, string>) => Response,
): Outcome => ({ ok: false, httpStatus, errorCode, response });

/** Erreur de lecture -> issue en erreur (rien n'est facturé). Relance ce qui n'est pas une erreur de la cible. */
export function readFailure(error: unknown): Outcome {
  if (error instanceof PrivacyStop)
    return fail(error.httpStatus, error.errorCode, () => error.response);
  if (error instanceof ReadError)
    return fail(422, "render_unavailable", (h) => W.renderUnavailable(h));
  if (error instanceof RenderBlockedHostError)
    return fail(422, "target_unreachable", (h) =>
      W.targetUnreachable(
        "La cible redirige trop de fois vers d'autres sites.",
        h,
      ),
    );
  if (error instanceof RenderError)
    return fail(502, "target_error", (h) =>
      W.targetError("Le rendu par navigateur a échoué.", h),
    );
  if (error instanceof SafeFetchError) {
    switch (error.code) {
      case "url_not_allowed":
        return fail(400, "url_not_allowed", (h) => W.urlNotAllowed(h));
      case "target_timeout":
        return fail(504, "target_timeout", (h) => W.targetTimeout(h));
      case "response_too_large":
        return fail(502, "target_error", (h) =>
          W.targetError("La réponse de la cible est trop volumineuse.", h),
        );
      case "too_many_redirects":
        return fail(422, "target_unreachable", (h) =>
          W.targetUnreachable("La cible redirige trop de fois.", h),
        );
      default:
        return fail(422, "target_unreachable", (h) =>
          W.targetUnreachable(
            error.message === "hôte introuvable"
              ? "Le nom de l'hôte est introuvable."
              : error.message === "certificat invalide"
                ? "Le certificat de la cible est invalide."
                : "La cible n'a pas répondu.",
            h,
          ),
        );
    }
  }
  throw error;
}

/** Page non lue (robots.txt, statut de la cible, type de contenu) -> issue en erreur ; null si la page est lue. */
export function unreadPage(result: ReadResult): Outcome | null {
  switch (result.kind) {
    case "page":
      return null;
    case "robots_blocked":
      return fail(403, "robots_disallowed", (h) => W.robotsDisallowed(h));
    case "unsupported":
      return fail(422, "unsupported_content", (h) =>
        W.unsupportedContent(result.contentType, h),
      );
    case "http_error":
      return result.status >= 500
        ? fail(502, "target_error", (h) =>
            W.targetError(
              `La cible a répondu avec le statut ${result.status}.`,
              h,
            ),
          )
        : fail(422, "target_unreachable", (h) =>
            W.targetUnreachable(
              `La cible a répondu avec le statut ${result.status}.`,
              h,
            ),
          );
  }
}
