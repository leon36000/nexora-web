import { W } from "./errors";
import { begin } from "./pipeline";
import type { WebpilotDeps } from "./types";

/**
 * Sessions de navigateur : le contrat est en place (clé, permission, débit), la fonction n'est pas ouverte.
 * Réponse `501 not_implemented` en français, après authentification (une clé invalide reste un 401).
 */
export async function handleSessions(
  request: Request,
  deps: WebpilotDeps,
): Promise<Response> {
  try {
    const begun = await begin(request, deps, "sessions", { body: false });
    if (!begun.ok) return begun.response;
    return W.notImplemented(begun.ctx.headers);
  } catch (error) {
    deps.log.error("webpilot : sessions", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return W.internal();
  }
}
