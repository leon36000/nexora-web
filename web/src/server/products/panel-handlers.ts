import type { Logger } from "@nexora/log";
import { z } from "zod";
import { isSameOriginRequest } from "../auth/origin";
import type { CodeWorkspaceService } from "./code-workspace";
import { normalizeWorkspace } from "./code-workspace";
import type {
  RagBaseSummary,
  RagCreateFailure,
  RagPanelService,
} from "./rag-panel";

/**
 * Routes du panneau « Mes outils » qui agissent sur un service des chantiers B et C :
 * - `POST /api/account/rag { name }` : « Créer mon RAG » en un clic (la base et sa clé d'API dédiée) ;
 * - `GET /api/account/code/workspace` : état de l'environnement Nexora Code de la personne ;
 * - `POST /api/account/code/workspace` : démarre cet environnement.
 *
 * Les services sont injectés (`PanelServicesDeps`) : ces routes n'ont aucune dépendance au RAG ni à Nexora Code. Sans
 * interrupteur allumé (`NEXORA_PRODUCT_RAG`, `NEXORA_PRODUCT_CODE`) : 404 `not_available` ; allumé sans service branché :
 * 503. L'organisation et la personne viennent TOUJOURS de la session, jamais du corps de la requête. Aucune valeur de clé
 * dans les journaux ; un message d'erreur d'un service n'est jamais renvoyé au navigateur.
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
  ragEnabled: () => boolean;
  codeEnabled: () => boolean;
  rag: () => RagPanelService | null;
  code: () => CodeWorkspaceService | null;
}

const NO_STORE = { "cache-control": "no-store" };
const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(body, { status, headers: { ...NO_STORE, ...headers } });

const rateLimited = (retryAfterSeconds: number) =>
  json({ error: "rate_limited" }, 429, {
    "retry-after": String(retryAfterSeconds),
  });

const createSchema = z
  .object({ name: z.string().trim().min(1).max(80) })
  .strict();

const FAILURE_STATUS: Record<RagCreateFailure, number> = {
  quota_exceeded: 402,
  no_credits: 402,
  base_exists: 409,
  base_limit: 409,
  key_limit: 409,
  unavailable: 503,
};

const baseJson = (b: RagBaseSummary) => ({
  id: b.id,
  name: b.name,
  description: b.description,
  createdAt: b.createdAt.toISOString(),
  documents: b.documents,
  pending: b.pending,
  failed: b.failed,
  usedBytes: b.usedBytes,
});

export async function handleCreateRag(
  request: Request,
  deps: PanelServicesDeps,
): Promise<Response> {
  try {
    if (!isSameOriginRequest(request, deps.siteUrl))
      return json({ error: "invalid_origin" }, 403);
    const ctx = await deps.getContext(request.headers);
    if (!ctx) return json({ error: "unauthenticated" }, 401);
    // Créer un RAG crée une clé d'API : comme pour les clés du compte, le propriétaire seul.
    if (ctx.role !== "owner") return json({ error: "forbidden" }, 403);
    const limit = await deps.rateLimit(`acct-rag-create:${ctx.userId}`, {
      limit: 10,
      windowSeconds: 60,
    });
    if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);
    if (!deps.ragEnabled()) return json({ error: "not_available" }, 404);
    const service = deps.rag();
    if (!service) return json({ error: "unavailable" }, 503);

    let name: string;
    try {
      const parsed = createSchema.safeParse(await request.json());
      if (!parsed.success) return json({ error: "invalid_request" }, 422);
      name = parsed.data.name;
    } catch {
      return json({ error: "invalid_json" }, 422);
    }

    const result = await service.createBaseWithKey({
      orgId: ctx.organizationId,
      userId: ctx.userId,
      name,
    });
    if (!result.ok)
      return json({ error: result.reason }, FAILURE_STATUS[result.reason]);
    // Jamais la valeur ni le préfixe de la clé : seulement les identifiants.
    deps.log.info("RAG créé depuis le panneau", {
      organizationId: ctx.organizationId,
      baseId: result.base.id,
      keyId: result.key.id,
    });
    return json(
      {
        base: baseJson(result.base),
        key: {
          id: result.key.id,
          prefix: result.key.prefix,
          secret: result.key.secret,
        },
        connection: service.connection(),
      },
      201,
    );
  } catch (error) {
    deps.log.error("création du RAG depuis le panneau : erreur interne", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return json({ error: "internal_error" }, 500);
  }
}

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
