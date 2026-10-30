import type { Logger } from "@nexora/log";
import { isSameOriginRequest } from "../auth/origin";
import type { CodeWorkspaceService } from "./code-workspace";
import { normalizeWorkspace } from "./code-workspace";

/**
 * Route du panneau « Mes outils » qui agit sur le service du chantier C :
 * - `GET /api/account/code/workspace` : état de l'environnement Nexora Code de la personne ;
 * - `POST /api/account/code/workspace` : démarre cet environnement.
 *
 * Le RAG n'a pas de route ici : « Créer mon RAG » appelle `POST /api/account/rag` du chantier B (`server/rag/account.ts`,
 * `docs/rag.md`), qui crée la base et sa clé dédiée.
 *
 * Le service est injecté (`PanelServicesDeps`). Sans interrupteur allumé (`NEXORA_PRODUCT_CODE`) : 404 `not_available` ;
 * allumé sans service branché : 503. L'organisation et la personne viennent TOUJOURS de la session. Un message d'erreur
 * du service n'est jamais renvoyé au navigateur.
 */

export interface PanelServicesDeps {
  siteUrl: string;
  getContext: (headers: Headers) => Promise<{
    userId: string;
    organizationId: string;
    role: "owner" | "member";
  } | null>;
  rateLimit: (
    key: string,
    options: { limit: number; windowSeconds: number },
  ) => Promise<{ allowed: boolean; retryAfterSeconds: number }>;
  log: Logger;
  codeEnabled: () => boolean;
  code: () => CodeWorkspaceService | null;
}

const NO_STORE = { "cache-control": "no-store" };
const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(body, { status, headers: { ...NO_STORE, ...headers } });

const rateLimited = (retryAfterSeconds: number) =>
  json({ error: "rate_limited" }, 429, {
    "retry-after": String(retryAfterSeconds),
  });

/** `GET` : état ; `POST` : démarrage. Toute autre méthode : 405 (le fichier de route n'exporte que ces deux-là). */
export async function handleCodeWorkspace(
  request: Request,
  deps: PanelServicesDeps,
): Promise<Response> {
  try {
    const starting = request.method === "POST";
    if (starting && !isSameOriginRequest(request, deps.siteUrl))
      return json({ error: "invalid_origin" }, 403);
    const ctx = await deps.getContext(request.headers);
    if (!ctx) return json({ error: "unauthenticated" }, 401);
    const limit = await deps.rateLimit(
      `acct-code-${starting ? "start" : "state"}:${ctx.userId}`,
      starting
        ? { limit: 6, windowSeconds: 60 }
        : { limit: 60, windowSeconds: 60 },
    );
    if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);
    if (!deps.codeEnabled()) return json({ error: "not_available" }, 404);
    const service = deps.code();
    if (!service) return json({ error: "unavailable" }, 503);

    const who = { orgId: ctx.organizationId, userId: ctx.userId };
    if (!starting) return json(normalizeWorkspace(await service.getState(who)));

    const result = await service.start(who);
    if (!result.ok)
      return json(
        { error: result.reason },
        result.reason === "quota_exceeded" ? 402 : 503,
      );
    deps.log.info("environnement Nexora Code démarré depuis le panneau", {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    });
    return json(normalizeWorkspace(result.state), 202);
  } catch (error) {
    deps.log.error("environnement Nexora Code : erreur interne", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return json({ error: "internal_error" }, 500);
  }
}
